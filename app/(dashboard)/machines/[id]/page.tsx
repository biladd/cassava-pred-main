"use client";

import Link from "next/link";
import { use, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────
interface SensorTrend {
  label: string;
  temperature: number;
  vibration: number;
  noise_level: number;
}

interface MaintenanceRecord {
  date: string;
  type: "Emergency" | "Corrective" | "Preventive";
  downtime: string;
  cost: string;
  note: string;
}

interface MachineDetail {
  id: string;
  status: "critical" | "warning" | "good";
  healthScore: number;
  failureProb: number;
  willFail: boolean;
  riskLevel: string;
  recommendation: string;
  healthLabel: string;
  // sensor terbaru
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  power_consumption: number;
  noise_level: number;
  humidity: number;
  operating_hours: number;
  lastTimestamp: string;
  // maintenance
  maintenanceCount: number;
  emergencyCount: number;
  lastMaintenance: string;
  history: MaintenanceRecord[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function healthScoreFromProb(probs: { Healthy: number; Warning: number; Critical: number }) {
  return Math.round(probs.Healthy * 100 + probs.Warning * 50);
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

function statusColor(status: string) {
  if (status === "critical") return "bg-red-500 text-white";
  if (status === "warning")  return "bg-amber-400 text-amber-900";
  return "bg-green-500 text-white";
}

// ── Gauge ──────────────────────────────────────────────────────────────────
function Gauge({ score }: { score: number }) {
  const r = 60, cx = 80, cy = 80;
  const startAngle = Math.PI * 0.75;
  const endAngle   = Math.PI * 2.25;
  const angle = startAngle + (score / 100) * (endAngle - startAngle);
  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
  const px = cx + r * Math.cos(angle),       py = cy + r * Math.sin(angle);
  const color = score < 40 ? "#e24b4a" : score < 70 ? "#ef9f27" : "#63aa22";
  return (
    <svg viewBox="0 0 160 120" className="w-36">
      <path d={`M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 1 1 ${x2.toFixed(1)},${y2.toFixed(1)}`}
        fill="none" stroke="#ffffff10" strokeWidth="8" strokeLinecap="round"/>
      <path d={`M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${score > 50 ? 1 : 0} 1 ${px.toFixed(1)},${py.toFixed(1)}`}
        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"/>
      <text x={cx} y={cy + 8} textAnchor="middle" fill={color} fontSize="22" fontWeight="500">{score}%</text>
    </svg>
  );
}

// ── Sensor Chart ───────────────────────────────────────────────────────────
function SensorChart({ data }: { data: SensorTrend[] }) {
  const W = 340, H = 160, padL = 28, padR = 8, padT = 8, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  if (data.length === 0) return (
    <div className="h-40 flex items-center justify-center">
      <p className="text-[11px] text-zinc-600">Tidak ada data sensor</p>
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

// ── TypeBadge ──────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: MaintenanceRecord["type"] }) {
  const styles = {
    Emergency:  "bg-red-500 text-white",
    Corrective: "bg-amber-400 text-amber-900",
    Preventive: "bg-green-500/80 text-white",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${styles[type]}`}>{type}</span>;
}

// ── Skeleton ───────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`}/>;
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [machine, setMachine]       = useState<MachineDetail | null>(null);
  const [sensorTrend, setSensorTrend] = useState<SensorTrend[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      setError(null);

      // 1. Ambil sensor terbaru mesin ini
      const { data: sensorData, error: sErr } = await supabase
        .from("sensor_readings")
        .select("*")
        .eq("machine_id", id)
        .order("timestamp", { ascending: false })
        .limit(48);

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);
      if (!sensorData || sensorData.length === 0) throw new Error(`Data sensor untuk ${id} tidak ditemukan`);

      const latest = sensorData[0];

      // 2. Prediksi dari FastAPI
      const predRes = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_id: latest.machine_id,
          temperature: latest.temperature,
          vibration: latest.vibration,
          pressure: latest.pressure,
          rpm: latest.rpm,
          power_consumption: latest.power_consumption,
          noise_level: latest.noise_level,
          humidity: latest.humidity,
          operating_hours: latest.operating_hours,
        }),
      });
      if (!predRes.ok) throw new Error(`FastAPI error ${predRes.status}`);
      const pred = await predRes.json();

      // 3. Ambil maintenance logs
      const { data: maintData } = await supabase
        .from("maintenance_logs")
        .select("*")
        .eq("machine_id", id)
        .order("date", { ascending: false })
        .limit(10);

      const history: MaintenanceRecord[] = (maintData ?? []).map(m => ({
        date    : new Date(m.date).toLocaleDateString("id-ID"),
        type    : m.maintenance_type as MaintenanceRecord["type"],
        downtime: m.downtime_hours ? `${m.downtime_hours} jam` : "-",
        cost    : m.cost_idr ? `Rp ${Number(m.cost_idr).toLocaleString("id-ID")}` : "-",
        note    : m.technician_notes ?? "-",
      }));

      const emergencyCount = (maintData ?? []).filter(m => m.maintenance_type === "Emergency").length;
      const lastMaint = maintData?.[0]
        ? new Date(maintData[0].date).toLocaleDateString("id-ID")
        : "Belum ada data";

      const score = healthScoreFromProb(pred.task_B.probabilities);
      const label = pred.task_B.health_label;

      setMachine({
        id,
        status       : label === "Critical" ? "critical" : label === "Warning" ? "warning" : "good",
        healthScore  : score,
        failureProb  : pred.task_A.failure_probability,
        willFail     : pred.task_A.will_fail_within_7days,
        riskLevel    : pred.task_A.risk_level,
        recommendation: pred.recommendation,
        healthLabel  : label,
        temperature  : latest.temperature,
        vibration    : latest.vibration,
        pressure     : latest.pressure,
        rpm          : latest.rpm,
        power_consumption: latest.power_consumption,
        noise_level  : latest.noise_level,
        humidity     : latest.humidity,
        operating_hours: latest.operating_hours,
        lastTimestamp: new Date(latest.timestamp).toLocaleString("id-ID"),
        maintenanceCount: (maintData ?? []).length,
        emergencyCount,
        lastMaintenance: lastMaint,
        history,
      });

      // 4. Sensor trend (24 data terakhir, dibalik)
      setSensorTrend(
        [...sensorData].reverse().slice(-24).map(r => ({
          label      : new Date(r.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
          temperature: r.temperature,
          vibration  : r.vibration,
          noise_level: r.noise_level,
        }))
      );

    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal fetch data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // ── Loading ──
  if (loading) return (
    <div className="p-6">
      <Skeleton className="h-4 w-48 mb-6"/>
      <Skeleton className="h-8 w-32 mb-2"/>
      <Skeleton className="h-4 w-64 mb-6"/>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl"/>)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1,2].map(i => <Skeleton key={i} className="h-56 rounded-xl"/>)}
      </div>
    </div>
  );

  // ── Error ──
  if (error || !machine) return (
    <div className="p-6">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-6 text-center">
        <p className="text-[13px] text-red-400 font-medium mb-2">Gagal load data mesin</p>
        <p className="text-[11px] text-red-400/70 mb-4">{error}</p>
        <button onClick={fetchDetail} className="text-[11px] text-red-400 border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/10">
          Coba Lagi
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-zinc-500 mb-4">
        <Link href="/" className="hover:text-zinc-300">Dashboard</Link>
        <span>/</span>
        <Link href="/machines" className="hover:text-zinc-300">Machines</Link>
        <span>/</span>
        <span className="text-zinc-300">{id}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-medium text-white">Machine {id}</h1>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusColor(machine.status)}`}>
            {machine.status.toUpperCase()}
          </span>
          {machine.willFail && (
            <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-medium">
              AKAN GAGAL 7 HARI
            </span>
          )}
        </div>
        <button onClick={fetchDetail} className="text-[11px] text-zinc-500 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
          Refresh
        </button>
      </div>
      <p className="text-[12px] text-zinc-500 mb-6">
        Data terakhir: <span className="text-zinc-400">{machine.lastTimestamp}</span> ·
        Maintenance terakhir: <span className="text-amber-400">{machine.lastMaintenance}</span>
      </p>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Health Score</p>
          <p className={`text-2xl font-medium ${scoreColor(machine.healthScore)}`}>{machine.healthScore}%</p>
          <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor(machine.healthScore)}`} style={{width:`${machine.healthScore}%`}}/>
          </div>
        </div>
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Failure Probability</p>
          <p className={`text-2xl font-medium ${machine.failureProb >= 0.5 ? "text-red-400" : machine.failureProb >= 0.2 ? "text-amber-400" : "text-green-400"}`}>
            {(machine.failureProb * 100).toFixed(1)}%
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Risk: <span className={machine.riskLevel === "HIGH" ? "text-red-400" : machine.riskLevel === "MEDIUM" ? "text-amber-400" : "text-green-400"}>{machine.riskLevel}</span></p>
        </div>
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Maintenance</p>
          <p className="text-2xl font-medium text-white">{machine.maintenanceCount}x</p>
          <p className="text-[11px] text-red-400">{machine.emergencyCount} emergency</p>
        </div>
      </div>

      {/* Sensor values */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "Temperature", value: `${machine.temperature.toFixed(1)}°C`,   warn: machine.temperature >= 85  },
          { label: "Vibration",   value: machine.vibration.toFixed(2),            warn: machine.vibration >= 1.0   },
          { label: "Pressure",    value: `${machine.pressure.toFixed(1)} bar`,    warn: machine.pressure >= 110    },
          { label: "RPM",         value: machine.rpm.toString(),                  warn: false                      },
          { label: "Power",       value: `${machine.power_consumption.toFixed(1)} kW`, warn: false                },
          { label: "Noise",       value: `${machine.noise_level.toFixed(1)} dB`,  warn: machine.noise_level >= 80  },
          { label: "Humidity",    value: `${machine.humidity.toFixed(1)}%`,       warn: false                      },
          { label: "Op. Hours",   value: `${machine.operating_hours.toFixed(0)} h`, warn: false                   },
        ].map(s => (
          <div key={s.label} className="bg-[#18191c] border border-white/5 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 mb-0.5">{s.label}</p>
            <p className={`text-[13px] font-medium ${s.warn ? "text-red-400" : "text-zinc-200"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Sensor Trend */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Sensor Trend (24 data terakhir)</p>
          <SensorChart data={sensorTrend}/>
          <div className="flex gap-4 mt-3">
            {[{label:"Temperature",color:"bg-red-500"},{label:"Vibration×100",color:"bg-amber-400"},{label:"Noise",color:"bg-blue-500"}].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`w-2.5 h-0.5 ${s.color}`}/>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Failure Prediction + AI Recommendation */}
        <div className="flex flex-col gap-4">
          <div className="bg-[#18191c] border border-white/5 rounded-xl p-4 flex-1">
            <p className="text-[13px] font-medium text-zinc-300 mb-3">Failure Prediction</p>
            <div className="flex items-center gap-4">
              <Gauge score={machine.healthScore}/>
              <div>
                <p className={`text-[13px] font-semibold mb-1 ${scoreColor(machine.healthScore)}`}>{machine.healthLabel}</p>
                <p className="text-[11px] text-zinc-500">Prob gagal: <span className="text-red-400">{(machine.failureProb * 100).toFixed(1)}%</span></p>
                <p className="text-[11px] text-zinc-500 mt-1">Risk: <span className={machine.riskLevel === "HIGH" ? "text-red-400" : machine.riskLevel === "MEDIUM" ? "text-amber-400" : "text-green-400"}>{machine.riskLevel}</span></p>
                {machine.willFail && <p className="text-[11px] text-red-400 font-semibold mt-1">⚠️ Akan gagal 7 hari!</p>}
              </div>
            </div>
          </div>

          <div className="bg-[#18191c] border border-l-2 border-l-green-500 border-white/5 rounded-xl p-4">
            <p className="text-[13px] font-medium text-zinc-300 mb-2">AI Recommendation</p>
            <p className="text-[12px] text-zinc-400 leading-5 mb-3">{machine.recommendation}</p>
            <button className="w-full bg-green-500 hover:bg-green-400 text-white text-[12px] font-semibold py-2.5 rounded-lg transition-colors">
              Schedule Maintenance
            </button>
          </div>
        </div>
      </div>

      {/* Maintenance History */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <p className="text-[13px] font-medium text-zinc-300">Maintenance History</p>
          <span className="text-[11px] text-zinc-500">Dari Supabase</span>
        </div>
        {machine.history.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-zinc-500">Belum ada riwayat maintenance</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {["Tanggal","Tipe","Downtime","Biaya","Catatan"].map(h => (
                  <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {machine.history.map((r, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-[12px] text-zinc-400">{r.date}</td>
                  <td className="px-4 py-3"><TypeBadge type={r.type}/></td>
                  <td className="px-4 py-3 text-[12px] text-zinc-400">{r.downtime}</td>
                  <td className="px-4 py-3 text-[12px] text-zinc-400">{r.cost}</td>
                  <td className="px-4 py-3 text-[12px] text-zinc-500">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}