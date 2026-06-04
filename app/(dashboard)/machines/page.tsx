"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type MachineStatus = "critical" | "warning" | "good";

interface Machine {
  id: string;
  status: MachineStatus;
  healthScore: number;
  failureProb: number;
  willFail: boolean;
  riskLevel: string;
  temperature: number;
  vibration: number;
  rpm: number;
  lastTimestamp: string;
  isAnomaly: boolean;
  anomalyScore: number;
}

interface SensorReading {
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

function statusBadge(status: MachineStatus) {
  if (status === "critical") return "bg-red-500/10 text-red-400 border border-red-500/20";
  if (status === "warning")  return "bg-amber-400/10 text-amber-400 border border-amber-400/20";
  return "bg-green-500/10 text-green-400 border border-green-500/20";
}

function statusLabel(status: MachineStatus) {
  if (status === "critical") return "Critical";
  if (status === "warning")  return "Warning";
  return "Normal";
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

function healthScoreFromProb(probs: { Healthy: number; Warning: number; Critical: number }) {
  return Math.round(probs.Healthy * 100 + probs.Warning * 50);
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`}/>;
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState("");
  const [search, setSearch]     = useState("");

  const fetchMachines = useCallback(async () => {
    try {
      setError(null);

      const { data: sensorData, error: sErr } = await supabase
        .from("sensor_readings")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);

      const latest: Record<string, SensorReading> = {};
      for (const row of (sensorData ?? [])) {
        if (!latest[row.machine_id]) latest[row.machine_id] = row;
      }

      const machineIds = Object.keys(latest).sort();

      const predictions = await Promise.all(
        machineIds.map(id => {
          const s = latest[id];
          return fetch(`${API_URL}/predict/full`, {
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

      const rows: Machine[] = predictions.map((p, i) => {
        const s = latest[machineIds[i]];
        const label = p.task_B.health_label;
        return {
          id: p.machine_id,
          status: label === "Critical" ? "critical" : label === "Warning" ? "warning" : "good",
          healthScore: p.overall_health_score ?? healthScoreFromProb(p.task_B.probabilities),
          failureProb: p.task_A.failure_probability,
          willFail: p.task_A.will_fail_within_7days,
          riskLevel: p.task_A.risk_level,
          temperature: s.temperature,
          vibration: s.vibration,
          rpm: s.rpm,
          lastTimestamp: new Date(s.timestamp).toLocaleDateString("en-US"),
          isAnomaly: p.anomaly?.is_anomaly ?? false,
          anomalyScore: p.anomaly?.score ?? 0,
        };
      });

      setMachines(rows);
      setLastUpdate(new Date().toLocaleTimeString("en-US"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const filtered = machines.filter(m =>
    m.id.toLowerCase().includes(search.toLowerCase())
  );

  const criticalCount = machines.filter(m => m.status === "critical").length;
  const warningCount  = machines.filter(m => m.status === "warning").length;
  const willFailCount = machines.filter(m => m.willFail).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Machines</h1>
          {lastUpdate ? (
            <p className="text-[12px] text-zinc-500 mt-0.5">
              {machines.length} machines · {criticalCount} critical · {warningCount} warning · {willFailCount} will fail in 7 days ·{" "}
              <button onClick={fetchMachines} className="text-zinc-400 hover:text-white underline underline-offset-2 transition-colors">
                Refresh
              </button>
            </p>
          ) : (
            <p className="text-[12px] text-zinc-500 mt-0.5">Loading data...</p>
          )}
        </div>

        <input
          type="text"
          placeholder="Search machines..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-white/20 w-40"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-[12px] text-red-400">{error}</p>
          <button onClick={fetchMachines} className="text-[11px] text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10">
            Try Again
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Machines",       value: machines.length, color: "text-white"     },
          { label: "Critical",             value: criticalCount,   color: "text-red-400"   },
          { label: "Warning",              value: warningCount,    color: "text-amber-400" },
          { label: "Will Fail in 7 Days",  value: willFailCount,   color: "text-red-400"   },
        ].map(s => (
          <div key={s.label} className="bg-[#18191c] border border-white/5 rounded-xl p-4">
            <p className="text-[11px] text-zinc-500 mb-1">{s.label}</p>
            {loading ? <Skeleton className="h-7 w-12"/> :
              <p className={`text-2xl font-medium ${s.color}`}>{s.value}</p>
            }
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["ID","Status","Health Score","Failure Prob","Risk","Anomaly","Temp (°C)","Vibration","RPM","Last Data"].map(h => (
                <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({length: 8}).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  {Array.from({length: 10}).map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full"/></td>
                  ))}
                </tr>
              ))
            ) : filtered.map(m => (
              <tr key={m.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                {/* ID */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/machines/${m.id}`} className="text-[13px] font-medium text-blue-400 hover:text-blue-300">
                      {m.id}
                    </Link>
                    {m.willFail && (
                      <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-medium">7D</span>
                    )}
                  </div>
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(m.status)}`}>
                    {statusLabel(m.status)}
                  </span>
                </td>

                {/* Health Score */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(m.healthScore)}`} style={{width:`${m.healthScore}%`}}/>
                    </div>
                    <span className={`text-[12px] ${scoreColor(m.healthScore)}`}>{m.healthScore}%</span>
                  </div>
                </td>

                {/* Failure Prob */}
                <td className="px-4 py-3">
                  <span className={`text-[12px] ${m.failureProb >= 0.5 ? "text-red-400" : m.failureProb >= 0.2 ? "text-amber-400" : "text-zinc-400"}`}>
                    {(m.failureProb * 100).toFixed(1)}%
                  </span>
                </td>

                {/* Risk */}
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    m.riskLevel === "HIGH" ? "bg-red-500/20 text-red-400" :
                    m.riskLevel === "MEDIUM" ? "bg-amber-400/20 text-amber-400" :
                    "bg-green-500/20 text-green-400"
                  }`}>{m.riskLevel}</span>
                </td>

                {/* Anomaly */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[12px] ${m.isAnomaly ? "text-purple-400" : "text-zinc-500"}`}>
                      {m.anomalyScore.toFixed(2)}
                    </span>
                    {m.isAnomaly && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-medium">
                        ANOM
                      </span>
                    )}
                  </div>
                </td>

                {/* Temp */}
                <td className="px-4 py-3 text-[12px] text-zinc-400">{m.temperature.toFixed(1)}</td>

                {/* Vibration */}
                <td className="px-4 py-3 text-[12px] text-zinc-400">{m.vibration.toFixed(2)}</td>

                {/* RPM */}
                <td className="px-4 py-3 text-[12px] text-zinc-400">{m.rpm}</td>

                {/* Last data */}
                <td className="px-4 py-3 text-[12px] text-zinc-500">{m.lastTimestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <div className="py-8 text-center text-[12px] text-zinc-500">
            No machines found
          </div>
        )}
      </div>
    </div>
  );
}