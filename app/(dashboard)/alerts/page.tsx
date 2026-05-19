"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Severity = "CRITICAL" | "WARNING";
type FilterType = "Semua" | "Kritis" | "Warning";

interface Alert {
  id: string;
  severity: Severity;
  machine: string;
  message: string;
  category: string;
  time: string;
  resolved: boolean;
  failureProb: number;
  healthScore: number;
}

function healthScoreFromProb(probs: { Healthy: number; Warning: number; Critical: number }) {
  return Math.round(probs.Healthy * 100 + probs.Warning * 50);
}

function getCategory(sensor: Record<string, number>): string {
  if (sensor.temperature >= 85) return "Temperature";
  if (sensor.vibration >= 1.0)  return "Mechanical";
  if (sensor.pressure >= 110)   return "Pressure";
  if (sensor.noise_level >= 80) return "Noise";
  if (sensor.power_consumption >= 90) return "Electrical";
  return "General";
}

function getMessage(severity: Severity, sensor: Record<string, number>, healthScore: number, prob: number): string {
  if (severity === "CRITICAL") {
    if (sensor.temperature >= 85) return `Suhu operasional melebihi threshold ${sensor.temperature.toFixed(0)}°C.`;
    if (sensor.vibration >= 1.0)  return `Health score turun drastis (${healthScore}%). Bearing aus, perlu penggantian segera.`;
    if (sensor.pressure >= 110)   return `Pressure melebihi batas aman ${sensor.pressure.toFixed(0)} bar.`;
    return `Risiko kegagalan tinggi. Failure probability ${(prob*100).toFixed(1)}%.`;
  }
  if (sensor.vibration >= 0.7)  return `Vibrasi melebihi batas normal. Monitor terus untuk 24 jam ke depan.`;
  if (sensor.noise_level >= 75) return `Tingkat kebisingan meningkat ${sensor.noise_level.toFixed(0)} dB dari baseline.`;
  if (sensor.power_consumption >= 80) return `Konsumsi daya tidak stabil dalam 2 jam terakhir.`;
  return `Health score ${healthScore}% — perlu perhatian dalam 24 jam.`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`}/>;
}

function exportAlerts(alerts: Alert[]) {
  const headers = ["ID","Severity","Machine","Category","Message","Time","Status","Failure Prob","Health Score"];
  const rows = alerts.map(a => [
    a.id, a.severity, a.machine, a.category,
    `"${a.message}"`, a.time,
    a.resolved ? "Resolved" : "Active",
    `${(a.failureProb*100).toFixed(1)}%`,
    `${a.healthScore}%`,
  ]);
  const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `alerts_report_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 5;

export default function AlertsPage() {
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [loading, setLoading]         = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [filter, setFilter]           = useState<FilterType>("Semua");
  const [page, setPage]               = useState(1);
  const [lastUpdate, setLastUpdate]   = useState("");

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);

      // 1. Ambil sensor terbaru per mesin
      const { data: sensorData, error: sErr } = await supabase
        .from("sensor_readings")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);

      const latest: Record<string, any> = {};
      for (const row of (sensorData ?? [])) {
        if (!latest[row.machine_id]) latest[row.machine_id] = row;
      }

      const machineIds = Object.keys(latest).sort();

      // 2. Ambil machine_id yang sudah resolved dari Supabase
      const { data: resolvedData } = await supabase
        .from("predictions")
        .select("machine_id")
        .eq("is_resolved", true);

      const resolvedMachines = new Set((resolvedData ?? []).map(r => r.machine_id));

      // 3. Prediksi dari FastAPI
      const predictions = await Promise.all(
        machineIds.map(id => {
          const s = latest[id];
          return fetch(`${API_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              machine_id: s.machine_id,
              temperature: s.temperature,
              vibration: s.vibration,
              pressure: s.pressure,
              rpm: s.rpm,
              power_consumption: s.power_consumption,
              noise_level: s.noise_level,
              humidity: s.humidity,
              operating_hours: s.operating_hours,
            }),
          }).then(r => r.json());
        })
      );

      // 4. Build alerts
      const newAlerts: Alert[] = [];
      for (let i = 0; i < predictions.length; i++) {
        const p      = predictions[i];
        const mid    = machineIds[i];
        const sensor = latest[mid];
        const label  = p.task_B.health_label;
        const prob   = p.task_A.failure_probability;
        const score  = healthScoreFromProb(p.task_B.probabilities);

        if (label === "Critical" || label === "Warning") {
          const severity: Severity = label === "Critical" ? "CRITICAL" : "WARNING";
          const sensorMap = {
            temperature: sensor.temperature,
            vibration: sensor.vibration,
            pressure: sensor.pressure,
            noise_level: sensor.noise_level,
            power_consumption: sensor.power_consumption,
          };

          // Simpan prediksi baru ke Supabase (hanya kalau belum resolved)
          let predId = `${mid}-${Date.now()}`;
          if (!resolvedMachines.has(mid)) {
            const { data: inserted } = await supabase
              .from("predictions")
              .insert({
                machine_id: mid,
                health_label: label,
                health_score: score,
                failure_probability: prob,
                will_fail: p.task_A.will_fail_within_7days,
                risk_level: p.task_A.risk_level,
                recommendation: p.recommendation,
                is_resolved: false,
              })
              .select("id")
              .single();
            if (inserted?.id) predId = inserted.id.toString();
          }

          newAlerts.push({
            id         : predId,
            severity,
            machine    : mid,
            message    : getMessage(severity, sensorMap, score, prob),
            category   : getCategory(sensorMap),
            time       : new Date(sensor.timestamp).toLocaleString("id-ID", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            }),
            resolved   : resolvedMachines.has(mid),
            failureProb: prob,
            healthScore: score,
          });
        }
      }

      newAlerts.sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        if (a.severity !== b.severity) return a.severity === "CRITICAL" ? -1 : 1;
        return b.failureProb - a.failureProb;
      });

      setAlerts(newAlerts);
      setLastUpdate(new Date().toLocaleTimeString("id-ID"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Tandai Selesai — simpan permanen ke Supabase ──
  async function resolveAlert(alertId: string, machineId: string) {
    try {
      setResolvingId(alertId);
      await supabase
        .from("predictions")
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .eq("machine_id", machineId)
        .eq("is_resolved", false);

      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, resolved: true } : a
      ));
    } catch (err) {
      console.error("Gagal resolve:", err);
    } finally {
      setResolvingId(null);
    }
  }

  const activeAlerts   = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved);

  const filtered = activeAlerts.filter(a => {
    if (filter === "Kritis")  return a.severity === "CRITICAL";
    if (filter === "Warning") return a.severity === "WARNING";
    return true;
  });

  const totalPages       = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated        = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const criticalCount    = activeAlerts.filter(a => a.severity === "CRITICAL").length;
  const warningCount     = activeAlerts.filter(a => a.severity === "WARNING").length;
  const affectedMachines = new Set(activeAlerts.map(a => a.machine)).size;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Alert Aktif</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">
            {criticalCount} Kritis · {warningCount} Peringatan
            {lastUpdate && ` · Update: ${lastUpdate}`} ·{" "}
            <button onClick={fetchAlerts} className="text-zinc-400 hover:text-white underline underline-offset-2 transition-colors">
              Refresh
            </button>
          </p>
        </div>
        <button onClick={() => exportAlerts(alerts)}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-[12px] font-medium px-4 py-2 rounded-lg transition-colors">
          ↓ Export Laporan
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-[12px] text-red-400">{error}</p>
          <button onClick={fetchAlerts} className="text-[11px] text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10">
            Coba Lagi
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {loading ? Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-20 rounded-xl"/>) : (
          <>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Critical Alerts</p>
              <p className="text-2xl font-medium text-red-400">{criticalCount}</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Warning Alerts</p>
              <p className="text-2xl font-medium text-amber-400">{warningCount}</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Machines Affected</p>
              <p className="text-2xl font-medium text-white">{affectedMachines}</p>
            </div>
          </>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["Semua","Kritis","Warning"] as FilterType[]).map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }}
            className={`text-[12px] px-4 py-1.5 rounded-full transition-colors ${
              filter === f ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300 bg-white/5"
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Active Alerts */}
      {loading ? (
        <div className="flex flex-col gap-3 mb-6">
          {Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-24 rounded-xl"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#18191c] border border-white/5 rounded-xl py-10 text-center mb-6">
          <p className="text-[13px] text-green-400 font-medium">✅ Tidak ada alert aktif</p>
          <p className="text-[11px] text-zinc-500 mt-1">Semua mesin dalam kondisi normal</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {paginated.map(a => (
            <div key={a.id} className={`bg-[#18191c] border rounded-xl p-4 border-l-2 ${
              a.severity === "CRITICAL" ? "border-l-red-500 border-white/5" : "border-l-amber-400 border-white/5"
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      a.severity === "CRITICAL" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"
                    }`}>{a.severity}</span>
                    <span className="text-[12px] font-medium text-zinc-300">{a.machine}</span>
                    <span className="text-[11px] text-zinc-600">{a.time}</span>
                  </div>
                  <p className="text-[13px] text-zinc-200 mb-1">{a.message}</p>
                  <p className="text-[11px] text-zinc-500">
                    Category: {a.category} ·
                    Failure prob: <span className={a.failureProb >= 0.5 ? "text-red-400" : "text-amber-400"}>
                      {(a.failureProb*100).toFixed(1)}%
                    </span> ·
                    Health: <span className={a.healthScore < 40 ? "text-red-400" : a.healthScore < 70 ? "text-amber-400" : "text-green-400"}>
                      {a.healthScore}%
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Link href={`/machines/${a.machine}`}
                    className="text-[11px] bg-green-500 hover:bg-green-400 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
                    Lihat Mesin
                  </Link>
                  <button
                    onClick={() => resolveAlert(a.id, a.machine)}
                    disabled={resolvingId === a.id}
                    className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                    {resolvingId === a.id ? "Menyimpan..." : "Tandai Selesai"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mb-6">
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
            className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded border border-white/10 transition-colors">
            Previous
          </button>
          {Array.from({length: totalPages}).map((_,i) => (
            <button key={i} onClick={() => setPage(i+1)}
              className={`text-[11px] px-3 py-1.5 rounded border transition-colors ${
                page === i+1 ? "bg-white/15 text-white border-white/20" : "text-zinc-400 hover:text-white border-white/10"
              }`}>
              {i+1}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
            className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded border border-white/10 transition-colors">
            Next
          </button>
        </div>
      )}

      {/* Resolved */}
      {resolvedAlerts.length > 0 && (
        <>
          <p className="text-[10px] font-medium tracking-widest text-zinc-600 mb-3">RESOLVED</p>
          <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden opacity-60">
            {resolvedAlerts.map((a, i) => (
              <div key={a.id} className={`flex items-start justify-between px-4 py-4 ${
                i < resolvedAlerts.length-1 ? "border-b border-white/5" : ""
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-[3px] h-9 rounded-full shrink-0 mt-0.5 ${
                    a.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-400"
                  }`}/>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        a.severity === "CRITICAL" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"
                      }`}>{a.severity}</span>
                      <span className="text-[11px] text-zinc-400">{a.machine}</span>
                      <span className="text-[10px] text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded">Resolved ✓</span>
                    </div>
                    <p className="text-[12px] text-zinc-500">{a.message}</p>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 pt-0.5">{a.time}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}