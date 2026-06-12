"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Severity = "CRITICAL" | "WARNING";
type FilterType = "All" | "Critical" | "Warning";

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

// ── Normal sensor values per machine (from real dataset, failure=0) ──────────
const NORMAL_SENSOR_VALUES: Record<string, {
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  power_consumption: number;
  noise_level: number;
  humidity: number;
}> = {
  "M-01": { temperature: 73.08, vibration: 0.49, pressure: 101.66, rpm: 2429, power_consumption: 76.49, noise_level: 71.12, humidity: 54.73 },
  "M-02": { temperature: 72.75, vibration: 0.48, pressure: 101.52, rpm: 2420, power_consumption: 76.10, noise_level: 70.88, humidity: 55.04 },
  "M-03": { temperature: 72.91, vibration: 0.49, pressure: 101.70, rpm: 2429, power_consumption: 76.55, noise_level: 71.14, humidity: 54.94 },
  "M-04": { temperature: 72.51, vibration: 0.47, pressure: 101.32, rpm: 2415, power_consumption: 75.82, noise_level: 70.62, humidity: 55.03 },
  "M-05": { temperature: 72.28, vibration: 0.46, pressure: 101.16, rpm: 2406, power_consumption: 75.28, noise_level: 70.22, humidity: 55.11 },
  "M-06": { temperature: 73.02, vibration: 0.49, pressure: 101.64, rpm: 2430, power_consumption: 76.69, noise_level: 71.14, humidity: 54.97 },
  "M-07": { temperature: 72.51, vibration: 0.47, pressure: 101.33, rpm: 2416, power_consumption: 75.79, noise_level: 70.61, humidity: 54.98 },
  "M-08": { temperature: 73.05, vibration: 0.49, pressure: 101.65, rpm: 2429, power_consumption: 76.46, noise_level: 71.11, humidity: 54.98 },
  "M-09": { temperature: 72.57, vibration: 0.47, pressure: 101.35, rpm: 2412, power_consumption: 75.61, noise_level: 70.59, humidity: 55.12 },
  "M-10": { temperature: 72.78, vibration: 0.48, pressure: 101.56, rpm: 2422, power_consumption: 76.15, noise_level: 70.91, humidity: 55.06 },
  "M-11": { temperature: 72.97, vibration: 0.49, pressure: 101.69, rpm: 2429, power_consumption: 76.56, noise_level: 71.15, humidity: 54.97 },
  "M-12": { temperature: 72.52, vibration: 0.47, pressure: 101.30, rpm: 2416, power_consumption: 75.77, noise_level: 70.63, humidity: 55.08 },
  "M-13": { temperature: 72.13, vibration: 0.46, pressure: 101.17, rpm: 2405, power_consumption: 75.40, noise_level: 70.37, humidity: 54.88 },
  "M-14": { temperature: 72.71, vibration: 0.48, pressure: 101.49, rpm: 2422, power_consumption: 76.09, noise_level: 70.87, humidity: 55.06 },
  "M-15": { temperature: 72.49, vibration: 0.47, pressure: 101.35, rpm: 2412, power_consumption: 75.75, noise_level: 70.54, humidity: 54.92 },
  "M-16": { temperature: 72.32, vibration: 0.46, pressure: 101.15, rpm: 2408, power_consumption: 75.45, noise_level: 70.29, humidity: 55.19 },
  "M-17": { temperature: 72.73, vibration: 0.48, pressure: 101.49, rpm: 2420, power_consumption: 76.13, noise_level: 70.96, humidity: 55.15 },
  "M-18": { temperature: 72.71, vibration: 0.48, pressure: 101.52, rpm: 2423, power_consumption: 76.17, noise_level: 70.82, humidity: 55.08 },
  "M-19": { temperature: 72.93, vibration: 0.49, pressure: 101.68, rpm: 2427, power_consumption: 76.44, noise_level: 71.11, humidity: 54.97 },
  "M-20": { temperature: 72.54, vibration: 0.47, pressure: 101.36, rpm: 2417, power_consumption: 75.74, noise_level: 70.52, humidity: 54.79 },
};

const DEFAULT_NORMAL = {
  temperature: 72.68, vibration: 0.48, pressure: 101.45,
  rpm: 2420, power_consumption: 76.10, noise_level: 70.78, humidity: 55.00,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function healthScoreFromProb(probs: { Healthy: number; Warning: number; Critical: number }) {
  return Math.round(probs.Healthy * 100 + probs.Warning * 50);
}

function getCategory(sensor: Record<string, number>): string {
  if (sensor.temperature >= 85)       return "Temperature";
  if (sensor.vibration >= 1.0)        return "Mechanical";
  if (sensor.pressure >= 110)         return "Pressure";
  if (sensor.noise_level >= 80)       return "Noise";
  if (sensor.power_consumption >= 90) return "Electrical";
  return "General";
}

function getMessage(severity: Severity, sensor: Record<string, number>, healthScore: number, prob: number): string {
  if (severity === "CRITICAL") {
    if (sensor.temperature >= 85) return `Operating temperature exceeded threshold at ${sensor.temperature.toFixed(0)}°C.`;
    if (sensor.vibration >= 1.0)  return `Health score dropped critically (${healthScore}%). Bearing worn out, immediate replacement required.`;
    if (sensor.pressure >= 110)   return `Pressure exceeded safe limit at ${sensor.pressure.toFixed(0)} bar.`;
    return `High failure risk. Failure probability ${(prob * 100).toFixed(1)}%.`;
  }
  if (sensor.vibration >= 0.7)        return `Vibration exceeded normal limit. Monitor continuously for the next 24 hours.`;
  if (sensor.noise_level >= 75)       return `Noise level increased to ${sensor.noise_level.toFixed(0)} dB above baseline.`;
  if (sensor.power_consumption >= 80) return `Unstable power consumption detected in the last 2 hours.`;
  return `Health score ${healthScore}% — attention required within 24 hours.`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`} />;
}

function exportAlerts(alerts: Alert[]) {
  const headers = ["ID", "Severity", "Machine", "Category", "Message", "Time", "Status", "Failure Prob", "Health Score"];
  const rows = alerts.map(a => [
    a.id, a.severity, a.machine, a.category,
    `"${a.message}"`, a.time,
    a.resolved ? "Resolved" : "Active",
    `${(a.failureProb * 100).toFixed(1)}%`,
    `${a.healthScore}%`,
  ]);
  const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `alerts_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 5;

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [loading, setLoading]         = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [filter, setFilter]           = useState<FilterType>("All");
  const [page, setPage]               = useState(1);
  const [lastUpdate, setLastUpdate]   = useState("");

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);

      // 1. Fetch latest sensor data per machine
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

      // 2. Fetch ALL predictions from DB
      const { data: allPredictions } = await supabase
        .from("predictions")
        .select("machine_id, is_resolved, resolved_at, health_label, health_score, failure_probability")
        .order("created_at", { ascending: false });

      const activeMap: Record<string, any> = {};
      const resolvedMap: Record<string, any> = {};

      for (const p of (allPredictions ?? [])) {
        if (!p.is_resolved && !activeMap[p.machine_id]) {
          activeMap[p.machine_id] = p;
        }
        if (p.is_resolved && !resolvedMap[p.machine_id]) {
          resolvedMap[p.machine_id] = p;
        }
      }

      // 3. Predictions from FastAPI for ALL machines
      const predictions = await Promise.all(
        machineIds.map(id => {
          const s = latest[id];
          if (!s) return Promise.resolve(null);
          return fetch(`${API_URL}/predict`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              machine_id:        s.machine_id,
              temperature:       s.temperature,
              vibration:         s.vibration,
              pressure:          s.pressure,
              rpm:               s.rpm,
              power_consumption: s.power_consumption,
              noise_level:       s.noise_level,
              humidity:          s.humidity,
              operating_hours:   s.operating_hours,
            }),
          }).then(r => r.json()).catch(() => null);
        })
      );

      // 4. Build alerts
      const newAlerts: Alert[] = [];
      for (let i = 0; i < machineIds.length; i++) {
        const p      = predictions[i];
        const mid    = machineIds[i];
        const sensor = latest[mid];
        if (!p || !sensor) continue;

        const label = p.task_B?.health_label;
        const prob  = p.task_A?.failure_probability ?? 0;
        const score = p.task_B?.probabilities ? healthScoreFromProb(p.task_B.probabilities) : 0;

        if (label === "Critical" || label === "Warning") {
          const severity: Severity = label === "Critical" ? "CRITICAL" : "WARNING";
          const sensorMap = {
            temperature:       sensor.temperature,
            vibration:         sensor.vibration,
            pressure:          sensor.pressure,
            noise_level:       sensor.noise_level,
            power_consumption: sensor.power_consumption,
          };

          if (!activeMap[mid]) {
            const { data: inserted } = await supabase
              .from("predictions")
              .insert({
                machine_id:          mid,
                health_label:        label,
                health_score:        score,
                failure_probability: prob,
                will_fail:           p.task_A.will_fail_within_7days,
                risk_level:          p.task_A.risk_level,
                recommendation:      p.recommendation,
                is_resolved:         false,
              })
              .select("id")
              .single();
            if (inserted?.id) activeMap[mid] = { id: inserted.id };
          }

          newAlerts.push({
            id:          activeMap[mid]?.id?.toString() ?? `${mid}-${Date.now()}`,
            severity,
            machine:     mid,
            message:     getMessage(severity, sensorMap, score, prob),
            category:    getCategory(sensorMap),
            time:        new Date(sensor.timestamp).toLocaleString("en-US", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            }),
            resolved:    false,
            failureProb: prob,
            healthScore: score,
          });
        }
      }

      // 5. Add resolved entries from DB
      for (const mid of Object.keys(resolvedMap)) {
        const alreadyExists = newAlerts.find(a => a.machine === mid);
        if (alreadyExists) continue;

        const r = resolvedMap[mid];
        newAlerts.push({
          id:          `${mid}-resolved-${r.resolved_at}`,
          severity:    (r.health_label === "Critical" ? "CRITICAL" : "WARNING") as Severity,
          machine:     mid,
          message:     "Machine has been repaired and returned to normal.",
          category:    "General",
          time:        new Date(r.resolved_at).toLocaleString("en-US", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          }),
          resolved:    true,
          failureProb: 0,
          healthScore: 100,
        });
      }

      newAlerts.sort((a, b) => {
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
        if (a.severity !== b.severity) return a.severity === "CRITICAL" ? -1 : 1;
        return b.failureProb - a.failureProb;
      });

      setAlerts(newAlerts);
      setLastUpdate(new Date().toLocaleTimeString("en-US"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ── Mark as Resolved ──────────────────────────────────────────────────────
  async function resolveAlert(alertId: string, machineId: string) {
    try {
      setResolvingId(alertId);

      // Step 1: Mark active predictions as resolved
      await supabase
        .from("predictions")
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .eq("machine_id", machineId)
        .eq("is_resolved", false);

      // Step 2: Reset sensor to normal values
      const normalValues = NORMAL_SENSOR_VALUES[machineId] ?? DEFAULT_NORMAL;
      const { data: latestSensor } = await supabase
        .from("sensor_readings")
        .select("timestamp")
        .eq("machine_id", machineId)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (latestSensor?.timestamp) {
        await supabase
          .from("sensor_readings")
          .update({
            temperature:       normalValues.temperature,
            vibration:         normalValues.vibration,
            pressure:          normalValues.pressure,
            rpm:               normalValues.rpm,
            power_consumption: normalValues.power_consumption,
            noise_level:       normalValues.noise_level,
            humidity:          normalValues.humidity,
            failure:           0,
          })
          .eq("machine_id", machineId)
          .eq("timestamp", latestSensor.timestamp);
      }

      // Step 3: Kirim sensor normal ke FastAPI untuk dapat hasil model
      const prediction = await fetch(`${API_URL}/predict/full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_id:        machineId,
          temperature:       normalValues.temperature,
          vibration:         normalValues.vibration,
          pressure:          normalValues.pressure,
          rpm:               normalValues.rpm,
          power_consumption: normalValues.power_consumption,
          noise_level:       normalValues.noise_level,
          humidity:          normalValues.humidity,
          operating_hours:   0,
        }),
      }).then(r => r.json());

      // Step 4: Insert prediction baru dari hasil FastAPI
      await supabase
        .from("predictions")
        .insert({
          machine_id:          machineId,
          health_label:        prediction.task_B.health_label,
          health_score:        prediction.overall_health_score,
          failure_probability: prediction.task_A.failure_probability,
          will_fail:           prediction.task_A.will_fail_within_7days,
          risk_level:          prediction.task_A.risk_level,
          recommendation:      prediction.recommendation,
          is_resolved:         false,
        });

      // Step 5: Update UI immediately
      setAlerts(prev =>
        prev.map(a => a.id === alertId ? {
          ...a,
          resolved:    true,
          message:     "Machine has been repaired and returned to normal.",
          failureProb: prediction.task_A.failure_probability,
          healthScore: prediction.overall_health_score,
        } : a)
      );

    } catch (err) {
      console.error("Failed to resolve:", err);
    } finally {
      setResolvingId(null);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeAlerts   = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved);

  const filtered = activeAlerts.filter(a => {
    if (filter === "Critical") return a.severity === "CRITICAL";
    if (filter === "Warning")  return a.severity === "WARNING";
    return true;
  });

  const totalPages       = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated        = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const criticalCount    = activeAlerts.filter(a => a.severity === "CRITICAL").length;
  const warningCount     = activeAlerts.filter(a => a.severity === "WARNING").length;
  const affectedMachines = new Set(activeAlerts.map(a => a.machine)).size;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Active Alerts</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">
            {criticalCount} Critical · {warningCount} Warning
            {lastUpdate && ` · Updated: ${lastUpdate}`} ·{" "}
            <button
              onClick={fetchAlerts}
              className="text-zinc-400 hover:text-white underline underline-offset-2 transition-colors"
            >
              Refresh
            </button>
          </p>
        </div>
        <button
          onClick={() => exportAlerts(alerts)}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-[12px] font-medium px-4 py-2 rounded-lg transition-colors"
        >
          ↓ Export Report
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-[12px] text-red-400">{error}</p>
          <button
            onClick={fetchAlerts}
            className="text-[11px] text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
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
        {(["All", "Critical", "Warning"] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`text-[12px] px-4 py-1.5 rounded-full transition-colors ${
              filter === f
                ? "bg-white/15 text-white"
                : "text-zinc-500 hover:text-zinc-300 bg-white/5"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Active Alerts */}
      {loading ? (
        <div className="flex flex-col gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#18191c] border border-white/5 rounded-xl py-10 text-center mb-6">
          <p className="text-[13px] text-green-400 font-medium">✅ No active alerts</p>
          <p className="text-[11px] text-zinc-500 mt-1">All machines are in normal condition</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {paginated.map(a => (
            <div
              key={a.id}
              className={`bg-[#18191c] border rounded-xl p-4 border-l-2 ${
                a.severity === "CRITICAL"
                  ? "border-l-red-500 border-white/5"
                  : "border-l-amber-400 border-white/5"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      a.severity === "CRITICAL"
                        ? "bg-red-500 text-white"
                        : "bg-amber-400 text-amber-900"
                    }`}>
                      {a.severity}
                    </span>
                    <span className="text-[12px] font-medium text-zinc-300">{a.machine}</span>
                    <span className="text-[11px] text-zinc-600">{a.time}</span>
                  </div>
                  <p className="text-[13px] text-zinc-200 mb-1">{a.message}</p>
                  <p className="text-[11px] text-zinc-500">
                    Category: {a.category} ·
                    Failure prob:{" "}
                    <span className={a.failureProb >= 0.5 ? "text-red-400" : "text-amber-400"}>
                      {(a.failureProb * 100).toFixed(1)}%
                    </span>{" "}
                    · Health:{" "}
                    <span className={
                      a.healthScore < 40
                        ? "text-red-400"
                        : a.healthScore < 70
                        ? "text-amber-400"
                        : "text-green-400"
                    }>
                      {a.healthScore}%
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Link
                    href={`/machines/${a.machine}`}
                    className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    View Machine
                  </Link>
                  <button
                    onClick={() => resolveAlert(a.id, a.machine)}
                    disabled={resolvingId === a.id}
                    className="text-[11px] bg-green-500 hover:bg-green-400 text-white font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {resolvingId === a.id ? "Saving..." : "Mark as Resolved"}
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
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded border border-white/10 transition-colors"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`text-[11px] px-3 py-1.5 rounded border transition-colors ${
                page === i + 1
                  ? "bg-white/15 text-white border-white/20"
                  : "text-zinc-400 hover:text-white border-white/10"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded border border-white/10 transition-colors"
          >
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
              <div
                key={a.id}
                className={`flex items-start justify-between px-4 py-4 ${
                  i < resolvedAlerts.length - 1 ? "border-b border-white/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-[3px] h-9 rounded-full shrink-0 mt-0.5 ${
                    a.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-400"
                  }`} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        a.severity === "CRITICAL"
                          ? "bg-red-500 text-white"
                          : "bg-amber-400 text-amber-900"
                      }`}>
                        {a.severity}
                      </span>
                      <span className="text-[11px] text-zinc-400">{a.machine}</span>
                      <span className="text-[10px] text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded">
                        Resolved ✓
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-500">{a.message}</p>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 pt-0.5">
                  {a.time}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}