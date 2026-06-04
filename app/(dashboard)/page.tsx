"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type HealthLabel = "Healthy" | "Warning" | "Critical";
type RiskLevel   = "LOW" | "MEDIUM" | "HIGH";

interface SensorRow {
  machine_id: string;
  timestamp: string;
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  power_consumption: number;
  noise_level: number;
  humidity: number;
  operating_hours: number;
}

interface MachineRow {
  id: string;
  healthScore: number;
  healthLabel: HealthLabel;
  failureProb: number;
  willFail: boolean;
  riskLevel: RiskLevel;
  rulHours: number;
  rulCapped: boolean;
  isAnomaly: boolean;
  anomalyScore: number;
  recommendation: string;
  status: "critical" | "warning" | "good";
  latestSensor: SensorRow | null;
}

interface SensorTrend {
  label: string;
  temperature: number;
  vibration: number;
  noise_level: number;
}

function labelToStatus(label: HealthLabel): MachineRow["status"] {
  if (label === "Critical") return "critical";
  if (label === "Warning")  return "warning";
  return "good";
}

function healthScoreFromProb(probs: { Healthy: number; Warning: number; Critical: number }): number {
  return Math.round(probs.Healthy * 100 + probs.Warning * 50 + probs.Critical * 0);
}

function barColor(score: number) {
  if (score < 40) return "bg-red-500";
  if (score < 70) return "bg-amber-400";
  return "bg-green-500";
}

function scoreColor(score: number) {
  if (score < 40) return "text-red-400";
  if (score < 70) return "text-amber-400";
  return "text-green-400";
}

function riskBadge(level: RiskLevel) {
  if (level === "HIGH")   return "bg-red-500/20 text-red-400 border border-red-500/30";
  if (level === "MEDIUM") return "bg-amber-400/20 text-amber-400 border border-amber-400/30";
  return "bg-green-500/20 text-green-400 border border-green-500/30";
}

function SensorChart({ data }: { data: SensorTrend[] }) {
  const W = 320, H = 160, padL = 28, padR = 8, padT = 8, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  if (data.length === 0) return (
    <div className="h-40 flex items-center justify-center">
      <p className="text-[11px] text-zinc-600">No sensor data</p>
    </div>
  );

  const allVals = data.flatMap(d => [d.temperature, d.vibration * 100, d.noise_level]);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const toX = (i: number) => padL + (i / Math.max(data.length - 1, 1)) * innerW;
  const toY = (v: number) => padT + innerH - ((v - minV) / range) * innerH;
  const makePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  const step = Math.ceil(data.length / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Sensor trends">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const v = minV + range * t;
        return (
          <g key={i}>
            <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="#ffffff10" strokeWidth="0.5"/>
            <text x={padL - 4} y={toY(v) + 3.5} textAnchor="end" fill="#555" fontSize="7">{v.toFixed(0)}</text>
          </g>
        );
      })}
      {data.filter((_, i) => i % step === 0).map((d, i) => (
        <text key={i} x={toX(i * step)} y={H - 6} textAnchor="middle" fill="#555" fontSize="7">{d.label}</text>
      ))}
      <path d={makePath(data.map(d => d.temperature))} fill="none" stroke="#e24b4a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={makePath(data.map(d => d.vibration * 100))} fill="none" stroke="#ef9f27" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2"/>
      <path d={makePath(data.map(d => d.noise_level))} fill="none" stroke="#378add" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 3"/>
    </svg>
  );
}

function formatRUL(rulHours: number): string {
  if (rulHours >= 999) return "> 7.0d";
  if (rulHours >= 168) return "7.0d";
  if (rulHours >= 24) return `${(rulHours / 24).toFixed(1)}d`;
  return `${Math.round(rulHours)}h`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`}/>;
}

export default function DashboardPage() {
  const [machines, setMachines]       = useState<MachineRow[]>([]);
  const [sensorTrend, setSensorTrend] = useState<SensorTrend[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdate, setLastUpdate]   = useState<string>("");
  const [selectedMachine, setSelectedMachine] = useState<string>("M-01");

  const fetchAll = useCallback(async () => {
    try {
      setError(null);

      // 1. Fetch latest sensor data from Supabase
      const { data: sensorData, error: sErr } = await supabase
        .from("sensor_readings")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);

      // Get the latest data per machine
      const latestPerMachine: Record<string, SensorRow> = {};
      for (const row of (sensorData ?? [])) {
        if (!latestPerMachine[row.machine_id]) {
          latestPerMachine[row.machine_id] = row;
        }
      }

      const machineIds = Object.keys(latestPerMachine).sort();

      // 2. Send to FastAPI
      const predictions = await Promise.all(
        machineIds.map((id) => {
          const s = latestPerMachine[id];
          return fetch(`${API_URL}/predict/full`, {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
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
          }).then(r => {
            if (!r.ok) throw new Error(`FastAPI error ${r.status}`);
            return r.json();
          });
        })
      );

      // 3. Save predictions to Supabase (disabled for now)
      // await supabase.from("predictions").insert(
      //   predictions.map(p => ({
      //     machine_id: p.machine_id,
      //     health_label: p.task_B.health_label,
      //     health_score: healthScoreFromProb(p.task_B.probabilities),
      //     failure_probability: p.task_A.failure_probability,
      //     will_fail: p.task_A.will_fail_within_7days,
      //     risk_level: p.task_A.risk_level,
      //     recommendation: p.recommendation,
      //   }))
      // );

      // 4. Build rows
      const rows: MachineRow[] = predictions.map((p, i) => ({
        id: p.machine_id,
        healthScore: p.overall_health_score ?? healthScoreFromProb(p.task_B.probabilities),
        healthLabel: p.task_B.health_label,
        failureProb: p.task_A.failure_probability,
        willFail: p.task_A.will_fail_within_7days,
        riskLevel: p.task_A.risk_level,
        rulHours: p.task_C?.rul_hours ?? 999,
        rulCapped: p.task_C?.rul_capped ?? true,
        isAnomaly: p.anomaly?.is_anomaly ?? false,
        anomalyScore: p.anomaly?.score ?? 0,
        recommendation: p.recommendation,
        status: labelToStatus(p.task_B.health_label),
        latestSensor: latestPerMachine[machineIds[i]] ?? null,
      }));

      setMachines(rows.sort((a, b) => a.healthScore - b.healthScore));

      // 5. Sensor trend for selected machine
      const machineData = (sensorData ?? [])
        .filter(r => r.machine_id === selectedMachine)
        .slice(0, 24)
        .reverse();

      setSensorTrend(machineData.map(r => ({
        label: new Date(r.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        temperature: r.temperature,
        vibration: r.vibration,
        noise_level: r.noise_level,
      })));

      setLastUpdate(new Date().toLocaleTimeString("en-US"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [selectedMachine]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const criticalCount = machines.filter(m => m.status === "critical").length;
  const willFailCount = machines.filter(m => m.willFail).length;
  const avgHealth = machines.length
    ? Math.round(machines.reduce((s, m) => s + m.healthScore, 0) / machines.length) : 0;
  const mostCritical = machines[0];
  const alerts = machines.filter(m => m.willFail || m.status !== "good");

  return (
    <div className="p-6">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Predictive Maintenance Dashboard</h1>
          {lastUpdate && (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Real data from Supabase · Updated: {lastUpdate} ·{" "}
              <button onClick={fetchAll} className="text-zinc-400 hover:text-white transition-colors underline underline-offset-2">
                Refresh
              </button>
            </p>
          )}
        </div>
        {loading ? <Skeleton className="w-24 h-7"/> :
          alerts.length > 0 ? (
            <span className="bg-amber-400 text-amber-900 text-[11px] font-semibold px-3 py-1.5 rounded-full">
              {alerts.length} active alerts
            </span>
          ) : (
            <span className="bg-green-500/20 text-green-400 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-green-500/30">
              All normal
            </span>
          )
        }
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-red-400 font-medium">Connection failed</p>
            <p className="text-[11px] text-red-400/70 mt-0.5">{error}</p>
          </div>
          <button onClick={fetchAll} className="text-[11px] text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            Try Again
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {loading ? Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-24 rounded-xl"/>) : (
          <>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1.5">Total Machines</p>
              <p className="text-2xl font-medium text-white leading-none mb-1">{machines.length}</p>
              <p className="text-[11px] text-green-400">From Supabase</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1.5">Critical Status</p>
              <p className={`text-2xl font-medium leading-none mb-1 ${criticalCount > 0 ? "text-red-400" : "text-white"}`}>{criticalCount}</p>
              <p className="text-[11px] text-red-400">{criticalCount > 0 ? "Needs maintenance" : "None"}</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1.5">Avg Health Score</p>
              <p className={`text-2xl font-medium leading-none mb-1 ${scoreColor(avgHealth)}`}>{avgHealth}%</p>
              <p className="text-[11px] text-zinc-500">From prediction model</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1.5">Will Fail in 7 Days</p>
              <p className={`text-2xl font-medium leading-none mb-1 ${willFailCount > 0 ? "text-red-400" : "text-green-400"}`}>{willFailCount}</p>
              <p className="text-[11px] text-zinc-500">{mostCritical ? `${mostCritical.id} most critical` : "-"}</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1.5">Anomalies Detected</p>
              <p className={`text-2xl font-medium leading-none mb-1 ${machines.filter(m => m.isAnomaly).length > 0 ? "text-purple-400" : "text-white"}`}>
                {machines.filter(m => m.isAnomaly).length}
              </p>
              <p className="text-[11px] text-zinc-500">IsolationForest</p>
            </div>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left card: Health Score per Machine */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Health Score per Machine</p>
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8"/>)}
            </div>
          ) : (
            machines.map((m) => (
              <Link key={m.id} href={`/machines/${m.id}`} className="block mb-3 group">
                {/* Header row: ID + badges + score */}
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-zinc-400 group-hover:text-white transition-colors">
                      {m.id}
                    </span>
                    {m.willFail && (
                      <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-medium">
                        FAIL 7D
                      </span>
                    )}
                    {m.isAnomaly && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-medium">
                        ANOMALY
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${riskBadge(m.riskLevel)}`}>
                      {m.riskLevel}
                    </span>
                    <span className={`text-[11px] font-medium ${scoreColor(m.healthScore)}`}>
                      {m.healthScore}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor(m.healthScore)}`}
                    style={{ width: `${m.healthScore}%` }}
                  />
                </div>

                {/* Info rows: sensor + prediction outputs */}
                {m.latestSensor && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] text-zinc-600">
                      Temp: {m.latestSensor.temperature}°C · Vib: {m.latestSensor.vibration} · RPM: {m.latestSensor.rpm}
                      {" · "}
                      <span className={
                        m.rulHours < 24 ? "text-red-500" :
                        m.rulHours < 72 ? "text-red-400" :
                        m.rulHours < 168 ? "text-amber-400" :
                        "text-zinc-600"
                      }>
                        RUL: {formatRUL(m.rulHours)}
                      </span>
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      <span className={m.failureProb >= 0.5 ? "text-red-400" : m.failureProb >= 0.2 ? "text-amber-400" : "text-zinc-600"}>
                        Fail: {(m.failureProb * 100).toFixed(1)}%
                      </span>
                      {" · "}
                      <span className={m.isAnomaly ? "text-purple-400" : "text-zinc-600"}>
                        Anom: {m.anomalyScore.toFixed(2)}
                      </span>
                    </p>
                  </div>
                )}
              </Link>
            ))
          )}
        </div>

        {/* Right card: Sensor Trends */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-zinc-300">Sensor Trends</p>
              <select
                value={selectedMachine}
                onChange={(e) => setSelectedMachine(e.target.value)}
                aria-label="Select machine to view sensor trends"
                className="bg-white/5 border border-white/10 rounded-md px-2 py-0.5 text-[11px] text-zinc-300 focus:outline-none focus:border-white/20 cursor-pointer hover:bg-white/10 transition-colors"
              >
                {machines.map(m => (
                  <option key={m.id} value={m.id} className="bg-[#18191c]">
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-zinc-500">Real Supabase data</span>
          </div>
          {loading ? <Skeleton className="h-40"/> : <SensorChart data={sensorTrend}/>}
          <div className="flex gap-4 mt-3">
            {[{label:"Temperature",color:"bg-red-500"},{label:"Vibration×100",color:"bg-amber-400"},{label:"Noise",color:"bg-blue-500"}].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`w-2.5 h-0.5 rounded-full ${s.color}`}/>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-medium text-zinc-300">Alerts from Prediction Model</p>
          <span className="text-[10px] text-zinc-500">Real-time via FastAPI + Supabase</span>
        </div>
        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({length:2}).map((_,i) => <Skeleton key={i} className="h-14"/>)}</div>
        ) : alerts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[13px] text-green-400 font-medium">✅ No alerts</p>
            <p className="text-[11px] text-zinc-500 mt-1">All machines are in normal condition</p>
          </div>
        ) : (
          alerts.map((m) => (
            <Link key={m.id} href={`/machines/${m.id}`} className="block">
              <div className="flex items-start justify-between py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] rounded-lg px-1 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`w-[3px] h-9 rounded-full shrink-0 mt-0.5 ${m.status === "critical" ? "bg-red-500" : "bg-amber-400"}`}/>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${m.status === "critical" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"}`}>
                        {m.status === "critical" ? "CRITICAL" : "WARNING"}
                      </span>
                      <span className="text-[11px] text-zinc-400">{m.id}</span>
                      <span className="text-[10px] text-zinc-600">Prob: {(m.failureProb * 100).toFixed(1)}%</span>
                    </div>
                    <p className="text-[12px] text-zinc-500">{m.recommendation}</p>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 pt-0.5">Health: {m.healthScore}%</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}