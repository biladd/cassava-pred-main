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

  probHealthy: number;
  probWarning: number;
  probCritical: number;

  rulHours: number;
  rulDays: number;
  rulCapped: boolean;

  isAnomaly: boolean;
  anomalyScore: number;

  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  power_consumption: number;
  noise_level: number;
  humidity: number;
  operating_hours: number;
  lastTimestamp: string;

  maintenanceCount: number;
  emergencyCount: number;
  lastMaintenance: string;
  history: MaintenanceRecord[];

  nlp: {
    totalLogs: number;
    emergencyCount: number;
    correctiveCount: number;
    preventiveCount: number;
    avgDowntime: number;
    totalCost: number;
    daysSinceLastMaint: number;
    hasUrgentRecent: boolean;
    avgSeverity: number;
    maxSeverity: number;
    riskLevel: string;
    urgentRate: number;
    dominantTopic: number;
    avgTechTerms: number;
    avgProblemKw: number;
    topKeywords: { keyword: string; score: number }[];
  };
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
      <p className="text-[11px] text-zinc-600">No sensor data available</p>
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

function formatRUL(rulHours: number): string {
  if (rulHours >= 999) return "> 7.0d";
  if (rulHours >= 168) return "7.0d";
  if (rulHours >= 24) return `${(rulHours / 24).toFixed(1)}d`;
  return `${Math.round(rulHours)}h`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`}/>;
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [machine, setMachine]           = useState<MachineDetail | null>(null);
  const [sensorTrend, setSensorTrend]   = useState<SensorTrend[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [historyPage, setHistoryPage]   = useState(1);

  // Accordions default CLOSED
  const [emergencyOpen, setEmergencyOpen]   = useState(false);
  const [correctiveOpen, setCorrectiveOpen] = useState(false);
  const [preventiveOpen, setPreventiveOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setError(null);

      const { data: sensorData, error: sErr } = await supabase
        .from("sensor_readings")
        .select("*")
        .eq("machine_id", id)
        .order("timestamp", { ascending: false })
        .limit(48);

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);
      if (!sensorData || sensorData.length === 0) throw new Error(`Sensor data for ${id} not found`);

      const latest = sensorData[0];

      const predRes = await fetch(`${API_URL}/predict/full`, {
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

      const { data: maintData } = await supabase
        .from("maintenance_logs")
        .select("*")
        .eq("machine_id", id)
        .order("date", { ascending: false })
        .limit(100);

      const { data: nlpSentiment } = await supabase
        .from("nlp_sentiment_summary")
        .select("*")
        .eq("machine_id", id)
        .single();

      const { data: nlpKeywords } = await supabase
        .from("nlp_summary_keywords")
        .select("keyword, tfidf_score, rank")
        .eq("machine_id", id)
        .order("rank", { ascending: true });

      const { data: nlpActions } = await supabase
        .from("nlp_top_actions")
        .select("*")
        .eq("machine_id", id)
        .single();

      const history: MaintenanceRecord[] = (maintData ?? []).map(m => ({
        date    : new Date(m.date).toLocaleDateString("en-US"),
        type    : m.maintenance_type as MaintenanceRecord["type"],
        downtime: m.downtime_hours ? `${m.downtime_hours} hrs` : "-",
        cost    : m.cost_idr ? `Rp ${Number(m.cost_idr).toLocaleString("en-US")}` : "-",
        note    : m.technician_notes ?? "-",
      }));

      const emergencyCount = (maintData ?? []).filter(m => m.maintenance_type === "Emergency").length;
      const lastMaint = maintData?.[0]
        ? new Date(maintData[0].date).toLocaleDateString("en-US")
        : "No data available";

      const label = pred.task_B.health_label;

      const allLogs = maintData ?? [];
      const correctiveCount = allLogs.filter(m => m.maintenance_type === "Corrective").length;
      const preventiveCount = allLogs.filter(m => m.maintenance_type === "Preventive").length;
      const totalDowntime = allLogs.reduce((s, m) => s + (Number(m.downtime_hours) || 0), 0);
      const totalCost = allLogs.reduce((s, m) => s + (Number(m.cost_idr) || 0), 0);
      const avgDowntime = allLogs.length ? totalDowntime / allLogs.length : 0;

      const daysSince = allLogs[0]
        ? Math.floor((Date.now() - new Date(allLogs[0].date).getTime()) / (1000 * 60 * 60 * 24))
        : -1;

      const hasUrgentRecent = allLogs.some(m => {
        if (m.maintenance_type !== "Emergency") return false;
        const daysAgo = (Date.now() - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= 30;
      });

      setMachine({
        id,
        status       : label === "Critical" ? "critical" : label === "Warning" ? "warning" : "good",
        healthScore  : pred.overall_health_score ?? healthScoreFromProb(pred.task_B.probabilities),
        failureProb  : pred.task_A.failure_probability,
        willFail     : pred.task_A.will_fail_within_7days,
        riskLevel    : pred.task_A.risk_level,
        recommendation: pred.recommendation,
        healthLabel  : label,

        probHealthy : pred.task_B.probabilities.Healthy,
        probWarning : pred.task_B.probabilities.Warning,
        probCritical: pred.task_B.probabilities.Critical,

        rulHours    : pred.task_C?.rul_hours ?? 168,
        rulDays     : pred.task_C?.rul_days ?? 7,
        rulCapped   : pred.task_C?.rul_capped ?? false,

        isAnomaly   : pred.anomaly?.is_anomaly ?? false,
        anomalyScore: pred.anomaly?.score ?? 0,

        temperature      : latest.temperature,
        vibration        : latest.vibration,
        pressure         : latest.pressure,
        rpm              : latest.rpm,
        power_consumption: latest.power_consumption,
        noise_level      : latest.noise_level,
        humidity         : latest.humidity,
        operating_hours  : latest.operating_hours,
        lastTimestamp    : new Date(latest.timestamp).toLocaleString("en-US"),
        maintenanceCount : nlpActions?.total_logs ?? allLogs.length,
        emergencyCount,
        lastMaintenance  : nlpActions?.emergency_count ?? emergencyCount,
        history,

        nlp: {
          totalLogs      : nlpActions?.total_logs ?? allLogs.length,
          emergencyCount : nlpActions?.emergency_count ?? emergencyCount,
          correctiveCount: nlpActions?.corrective_count ?? correctiveCount,
          preventiveCount: nlpActions?.preventive_count ?? preventiveCount,
          avgDowntime    : nlpActions?.avg_downtime_hrs ?? avgDowntime,
          totalCost      : nlpActions?.total_cost_idr ?? totalCost,
          daysSinceLastMaint: daysSince,
          hasUrgentRecent,
          avgSeverity   : nlpSentiment?.avg_severity ?? 0,
          maxSeverity   : nlpSentiment?.max_severity ?? 0,
          riskLevel     : nlpSentiment?.risk_level ?? "Unknown",
          urgentRate    : nlpSentiment?.urgent_rate ?? 0,
          dominantTopic : nlpSentiment?.dominant_topic ?? 0,
          avgTechTerms  : nlpSentiment?.avg_tech_terms ?? 0,
          avgProblemKw  : nlpSentiment?.avg_problem_kw ?? 0,
          topKeywords: (nlpKeywords ?? []).map(k => ({
            keyword: k.keyword,
            score  : k.tfidf_score,
          })),
        },
      });

      setSensorTrend(
        [...sensorData].reverse().slice(-24).map(r => ({
          label      : new Date(r.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          temperature: r.temperature,
          vibration  : r.vibration,
          noise_level: r.noise_level,
        }))
      );

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

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

  if (error || !machine) return (
    <div className="p-6">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-6 text-center">
        <p className="text-[13px] text-red-400 font-medium mb-2">Failed to load machine data</p>
        <p className="text-[11px] text-red-400/70 mb-4">{error}</p>
        <button onClick={fetchDetail} className="text-[11px] text-red-400 border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/10">
          Try Again
        </button>
      </div>
    </div>
  );

  const HISTORY_PAGE_SIZE = 10;
  const totalHistoryPages = Math.max(1, Math.ceil(machine.history.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages);
  const historyStart = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const historyEnd = historyStart + HISTORY_PAGE_SIZE;
  const paginatedHistory = machine.history.slice(historyStart, historyEnd);

  const statusBg    = machine.status === "critical" ? "bg-red-500/10 border-red-500/30"   : machine.status === "warning" ? "bg-amber-400/10 border-amber-400/30" : "bg-green-500/10 border-green-500/30";
  const statusAccent = machine.status === "critical" ? "text-red-400"  : machine.status === "warning" ? "text-amber-400"  : "text-green-400";

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
        <Link href="/" className="hover:text-zinc-400 transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href="/machines" className="hover:text-zinc-400 transition-colors">Machines</Link>
        <span>/</span>
        <span className="text-zinc-300 font-medium">{id}</span>
      </div>

      {/* Will-Fail Alert Banner */}
      {machine.willFail && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3">
          <span className="text-red-400 text-lg">⚠</span>
          <div>
            <p className="text-[13px] font-semibold text-red-400">High Failure Risk Detected</p>
            <p className="text-[11px] text-red-400/70">This machine is predicted to fail within 7 days. Immediate inspection recommended.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`border rounded-2xl p-5 ${statusBg}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">Machine {id}</h1>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusColor(machine.status)}`}>
                {machine.status.toUpperCase()}
              </span>
              {machine.isAnomaly && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  ANOMALY
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              Updated <span className="text-zinc-400">{machine.lastTimestamp}</span>
              {" · "}Last maintenance <span className="text-zinc-400">{machine.lastMaintenance}</span>
            </p>
          </div>
          <button
            onClick={fetchDetail}
            className="text-[11px] text-zinc-400 hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 mb-1">Health Score</p>
            <p className={`text-2xl font-bold ${scoreColor(machine.healthScore)}`}>{machine.healthScore}<span className="text-sm font-normal">%</span></p>
            <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor(machine.healthScore)} transition-all duration-700`} style={{ width: `${machine.healthScore}%` }}/>
            </div>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 mb-1">Failure Prob</p>
            <p className={`text-2xl font-bold ${machine.failureProb >= 0.5 ? "text-red-400" : machine.failureProb >= 0.2 ? "text-amber-400" : "text-green-400"}`}>
              {(machine.failureProb * 100).toFixed(0)}<span className="text-sm font-normal">%</span>
            </p>
            <p className={`text-[10px] mt-1 font-medium ${machine.riskLevel === "HIGH" ? "text-red-400" : machine.riskLevel === "MEDIUM" ? "text-amber-400" : "text-green-400"}`}>
              {machine.riskLevel} RISK
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 mb-1">Remaining Life</p>
            <p className={`text-2xl font-bold ${machine.rulHours < 24 ? "text-red-500" : machine.rulHours < 72 ? "text-red-400" : machine.rulHours < 168 ? "text-amber-400" : "text-green-400"}`}>
              {formatRUL(machine.rulHours)}
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">{machine.rulCapped ? "Capped > 7d" : `${machine.rulHours}h exact`}</p>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 mb-1">Anomaly Score</p>
            <p className={`text-2xl font-bold ${machine.isAnomaly ? "text-purple-400" : "text-zinc-300"}`}>{machine.anomalyScore.toFixed(2)}</p>
            <p className={`text-[10px] mt-1 font-medium ${machine.isAnomaly ? "text-purple-400" : "text-zinc-600"}`}>
              {machine.isAnomaly ? "DETECTED" : "Normal"}
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 mb-1">Total Logs</p>
            <p className="text-2xl font-bold text-white">{machine.nlp.totalLogs}</p>
            <p className="text-[10px] text-red-400 mt-1">{machine.nlp.emergencyCount} emergency</p>
          </div>
        </div>
      </div>

      {/* Live Sensors + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider"></p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Temperature", value: `${machine.temperature.toFixed(1)}°C`,        warn: machine.temperature >= 85, icon: "🌡" },
              { label: "Vibration",   value: machine.vibration.toFixed(2),                 warn: machine.vibration >= 1.0,  icon: "📳" },
              { label: "Pressure",    value: `${machine.pressure.toFixed(1)} bar`,         warn: machine.pressure >= 110,   icon: "⏱" },
              { label: "RPM",         value: machine.rpm.toString(),                       warn: false,                     icon: "⚙" },
              { label: "Power",       value: `${machine.power_consumption.toFixed(1)} kW`, warn: false,                     icon: "⚡" },
              { label: "Noise",       value: `${machine.noise_level.toFixed(1)} dB`,       warn: machine.noise_level >= 80, icon: "🔊" },
              { label: "Humidity",    value: `${machine.humidity.toFixed(1)}%`,            warn: false,                     icon: "💧" },
              { label: "Op. Hours",   value: `${machine.operating_hours.toFixed(0)} h`,    warn: false,                     icon: "🕐" },
            ].map(s => (
              <div key={s.label} className={`bg-[#18191c] border rounded-xl p-3 ${s.warn ? "border-red-500/30 bg-red-500/5" : "border-white/5"}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12px]">{s.icon}</span>
                  <p className="text-[10px] text-zinc-500">{s.label}</p>
                </div>
                <p className={`text-[15px] font-semibold ${s.warn ? "text-red-400" : "text-zinc-200"}`}>{s.value}</p>
                {s.warn && <p className="text-[9px] text-red-400/70 mt-0.5">Above threshold</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider"></p>
          <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
            <SensorChart data={sensorTrend}/>
            <div className="flex gap-4 mt-3 pt-2 border-t border-white/5">
              {[
                { label: "Temperature", color: "bg-red-500"   },
                { label: "Vibration×100", color: "bg-amber-400" },
                { label: "Noise",       color: "bg-blue-500"  },
              ].map(s => (
                <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className={`w-3 h-0.5 rounded ${s.color} inline-block`}/>
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[#18191c] border border-white/5 rounded-xl p-4 flex items-center gap-5">
            <Gauge score={machine.healthScore}/>
            <div className="flex-1">
              <p className="text-[10px] text-zinc-500 mb-1">Health Classification</p>
              <p className={`text-[18px] font-bold mb-2 ${scoreColor(machine.healthScore)}`}>{machine.healthLabel}</p>
              <div className="h-2.5 rounded-full overflow-hidden flex mb-1.5">
                <div className="bg-green-500 transition-all duration-700" style={{ width: `${machine.probHealthy * 100}%` }}/>
                <div className="bg-amber-400 transition-all duration-700" style={{ width: `${machine.probWarning * 100}%` }}/>
                <div className="bg-red-500   transition-all duration-700" style={{ width: `${machine.probCritical * 100}%` }}/>
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-green-500">Healthy {(machine.probHealthy * 100).toFixed(0)}%</span>
                <span className="text-amber-400">Warning {(machine.probWarning * 100).toFixed(0)}%</span>
                <span className="text-red-500">Critical {(machine.probCritical * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Model Output */}
      <div className="bg-[#18191c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-zinc-200">AI Model Output</p>
          <span className="text-[10px] text-zinc-600">Random Forest · LSTM · IsolationForest</span>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-[11px] font-medium text-zinc-300">Task A</span>
                <span className="text-[10px] text-zinc-600 ml-2">Failure Probability · Random Forest</span>
              </div>
              <span className={`text-[12px] font-bold ${machine.failureProb >= 0.5 ? "text-red-400" : machine.failureProb >= 0.2 ? "text-amber-400" : "text-green-400"}`}>
                {(machine.failureProb * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 w-px bg-amber-500/50" style={{ left: "20%" }}/>
              <div className="absolute top-0 bottom-0 w-px bg-red-500/50"   style={{ left: "50%" }}/>
              <div className={`h-full rounded-full transition-all duration-700 ${machine.failureProb >= 0.5 ? "bg-red-500" : machine.failureProb >= 0.2 ? "bg-amber-400" : "bg-green-500"}`}
                style={{ width: `${machine.failureProb * 100}%` }}/>
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>0%</span><span className="text-amber-500/60">20% low</span><span className="text-red-500/60">50% high</span><span>100%</span>
            </div>
          </div>

          <div className="border-t border-white/5"/>

          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-[11px] font-medium text-zinc-300">Task C</span>
                <span className="text-[10px] text-zinc-600 ml-2">Remaining Useful Life · LSTM</span>
              </div>
              <span className={`text-[12px] font-bold ${machine.rulHours < 24 ? "text-red-500" : machine.rulHours < 72 ? "text-red-400" : machine.rulHours < 168 ? "text-amber-400" : "text-green-400"}`}>
                {formatRUL(machine.rulHours)}{machine.rulCapped ? " · capped" : ""}
              </span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 w-px bg-red-500/50"   style={{ left: "14.3%" }}/>
              <div className="absolute top-0 bottom-0 w-px bg-amber-500/50" style={{ left: "42.9%" }}/>
              <div className={`h-full rounded-full transition-all duration-700 ${machine.rulHours < 24 ? "bg-red-500" : machine.rulHours < 72 ? "bg-red-400" : machine.rulHours < 168 ? "bg-amber-400" : "bg-green-500"}`}
                style={{ width: `${Math.min((machine.rulHours / 168) * 100, 100)}%` }}/>
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>0h</span><span className="text-red-500/60">24h</span><span className="text-amber-500/60">72h</span><span>168h</span>
            </div>
          </div>

          <div className="border-t border-white/5"/>

          <div>
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-[11px] font-medium text-zinc-300">Anomaly</span>
                <span className="text-[10px] text-zinc-600 ml-2">IsolationForest · threshold 0.62</span>
              </div>
              <span className={`text-[12px] font-bold ${machine.isAnomaly ? "text-purple-400" : "text-green-400"}`}>
                {machine.anomalyScore.toFixed(3)} · {machine.isAnomaly ? "DETECTED" : "Normal"}
              </span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 w-0.5 bg-purple-400/50" style={{ left: "62%" }}/>
              <div className={`h-full rounded-full transition-all duration-700 ${machine.isAnomaly ? "bg-purple-500" : "bg-zinc-600"}`}
                style={{ width: `${Math.min(machine.anomalyScore * 100, 100)}%` }}/>
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>0</span><span className="text-purple-400/60">threshold 0.62</span><span>1.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* NLP + Keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-[#18191c] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-zinc-200">NLP Summary</p>
            {machine.nlp.hasUrgentRecent && (
              <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold animate-pulse">
                URGENT 30D
              </span>
            )}
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-1.5">
              <span className="text-zinc-500">Avg Severity</span>
              <span className="text-zinc-400">{machine.nlp.avgSeverity.toFixed(2)} / 5</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${machine.nlp.riskLevel === "High" ? "bg-red-500" : machine.nlp.riskLevel === "Medium" ? "bg-amber-400" : "bg-green-500"}`}
                style={{ width: `${(machine.nlp.avgSeverity / 5) * 100}%` }}/>
            </div>
            <p className={`text-[10px] mt-1 font-semibold ${machine.nlp.riskLevel === "High" ? "text-red-400" : machine.nlp.riskLevel === "Medium" ? "text-amber-400" : "text-green-400"}`}>
              {machine.nlp.riskLevel} Risk
            </p>
          </div>
          <div className="space-y-2">
            {[
              { label: "Emergency",  count: machine.nlp.emergencyCount,  bar: "bg-red-500",   text: "text-red-400"   },
              { label: "Corrective", count: machine.nlp.correctiveCount, bar: "bg-amber-400", text: "text-amber-400" },
              { label: "Preventive", count: machine.nlp.preventiveCount, bar: "bg-green-500", text: "text-green-400" },
            ].map(t => (
              <div key={t.label}>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className={t.text}>{t.label}</span>
                  <span className="text-zinc-500">{t.count} / {machine.nlp.totalLogs}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${t.bar} transition-all duration-700`}
                    style={{ width: machine.nlp.totalLogs > 0 ? `${(t.count / machine.nlp.totalLogs) * 100}%` : "0%" }}/>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
            {[
              { label: "Urgent Rate",   value: `${(machine.nlp.urgentRate * 100).toFixed(0)}%`,   warn: machine.nlp.urgentRate > 0.3 },
              { label: "Avg Downtime",  value: `${machine.nlp.avgDowntime.toFixed(1)} h`,         warn: machine.nlp.avgDowntime > 5  },
              { label: "Days Since",    value: machine.nlp.daysSinceLastMaint < 0 ? "—" : `${machine.nlp.daysSinceLastMaint}d`, warn: machine.nlp.daysSinceLastMaint > 60 },
              { label: "Total Cost",    value: `Rp ${(machine.nlp.totalCost / 1_000_000).toFixed(1)}M`, warn: false },
            ].map(s => (
              <div key={s.label} className="bg-white/3 rounded-lg p-2">
                <p className="text-[9px] text-zinc-600">{s.label}</p>
                <p className={`text-[12px] font-semibold ${s.warn ? "text-amber-400" : "text-zinc-300"}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#18191c] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-zinc-200">Maintenance Insights</p>
            <span className="text-[9px] text-zinc-600">TF-IDF · Stage 3 NLP</span>
          </div>
          {machine.nlp.topKeywords.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Top Keywords</p>
              <div className="flex flex-wrap gap-2">
                {machine.nlp.topKeywords.map((kw, i) => {
                  const intensity = kw.score / (machine.nlp.topKeywords[0]?.score || 1);
                  return (
                    <div key={i} className="px-2.5 py-1.5 rounded-lg border flex items-center gap-2"
                      style={{
                        borderColor    : `rgba(168, 85, 247, ${0.2 + intensity * 0.4})`,
                        backgroundColor: `rgba(168, 85, 247, ${0.05 + intensity * 0.1})`,
                      }}
                    >
                      <span className="text-[9px] text-zinc-500 font-mono">#{i + 1}</span>
                      <span className="text-[11px] text-zinc-200 font-medium">{kw.keyword}</span>
                      <span className="text-[9px] text-zinc-500">{kw.score.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-white/5">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Analysis</p>
            <div className="space-y-2">
              {[
                {
                  dot: machine.nlp.riskLevel === "High" ? "text-red-400" : machine.nlp.riskLevel === "Medium" ? "text-amber-400" : "text-green-400",
                  text: <>Risk level: <span className={`font-semibold ${machine.nlp.riskLevel === "High" ? "text-red-400" : machine.nlp.riskLevel === "Medium" ? "text-amber-400" : "text-green-400"}`}>{machine.nlp.riskLevel}</span> · avg severity {machine.nlp.avgSeverity.toFixed(2)}/5</>
                },
                {
                  dot: machine.nlp.urgentRate > 0.3 ? "text-red-400" : "text-zinc-600",
                  text: <>Urgent rate: <span className={`font-semibold ${machine.nlp.urgentRate > 0.3 ? "text-red-400" : "text-zinc-300"}`}>{(machine.nlp.urgentRate * 100).toFixed(1)}%</span> of all logs</>
                },
                {
                  dot: "text-zinc-600",
                  text: <>Dominant topic <span className="text-zinc-300 font-medium">#{machine.nlp.dominantTopic}</span> · avg <span className="text-zinc-300">{machine.nlp.avgTechTerms.toFixed(1)}</span> tech terms, <span className="text-zinc-300">{machine.nlp.avgProblemKw.toFixed(1)}</span> problem keywords</>
                },
                {
                  dot: machine.nlp.emergencyCount > 0 ? "text-red-400" : "text-zinc-600",
                  text: machine.nlp.emergencyCount > 0
                    ? <><span className="text-red-400 font-semibold">{machine.nlp.emergencyCount}× emergency</span> recorded in history</>
                    : <>No emergencies recorded</>
                },
                {
                  dot: machine.nlp.hasUrgentRecent ? "text-red-400" : "text-zinc-600",
                  text: machine.nlp.hasUrgentRecent
                    ? <span className="text-red-400 font-semibold">Emergency occurred within last 30 days</span>
                    : <>No emergency in the last 30 days</>
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`${item.dot} text-[10px] mt-0.5 shrink-0`}>●</span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Technician Notes — always visible, no hide button */}
      <div className="bg-[#18191c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <p className="text-[13px] font-semibold text-zinc-200">Technician Notes</p>
          <div className="flex gap-2">
            <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full">{machine.nlp.emergencyCount} emergency</span>
            <span className="text-[9px] bg-amber-400/20 text-amber-400 border border-amber-400/20 px-1.5 py-0.5 rounded-full">{machine.nlp.correctiveCount} corrective</span>
            <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full">{machine.nlp.preventiveCount} preventive</span>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-3 pt-4">

          {/* Emergency — default closed */}
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 overflow-hidden">
            <button
              onClick={() => setEmergencyOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-500/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold bg-red-500 text-white px-2.5 py-1 rounded-full">EMERGENCY</span>
                <span className="text-[11px] text-red-400/60">{machine.nlp.emergencyCount} records</span>
              </div>
              <span className="text-[10px] text-red-400/50 border border-red-500/20 px-2.5 py-0.5 rounded-lg">
                {emergencyOpen ? "▲ Hide" : "▼ Show"}
              </span>
            </button>
            {emergencyOpen && (
              <div className="px-4 pb-4 space-y-2.5 border-t border-red-500/10 pt-3">
                {machine.history.filter(h => h.type === "Emergency").length > 0 ? (
                  machine.history.filter(h => h.type === "Emergency").map((rec, i) => (
                    <div key={i} className="flex gap-3 bg-black/20 rounded-lg px-3 py-2.5">
                      <div className="w-0.5 bg-red-500 rounded-full shrink-0 self-stretch"/>
                      <div>
                        <p className="text-[12px] text-zinc-200 leading-relaxed">&ldquo;{rec.note}&rdquo;</p>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-zinc-500">
                          <span>📅 {rec.date}</span>
                          <span>⏱ {rec.downtime}</span>
                          <span>💰 {rec.cost}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-zinc-600 italic text-center py-3">No emergency records</p>
                )}
              </div>
            )}
          </div>

          {/* Corrective — default closed */}
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 overflow-hidden">
            <button
              onClick={() => setCorrectiveOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-400/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold bg-amber-400 text-amber-900 px-2.5 py-1 rounded-full">CORRECTIVE</span>
                <span className="text-[11px] text-amber-400/60">{machine.nlp.correctiveCount} records</span>
              </div>
              <span className="text-[10px] text-amber-400/50 border border-amber-400/20 px-2.5 py-0.5 rounded-lg">
                {correctiveOpen ? "▲ Hide" : "▼ Show"}
              </span>
            </button>
            {correctiveOpen && (
              <div className="px-4 pb-4 space-y-2.5 border-t border-amber-400/10 pt-3">
                {machine.history.filter(h => h.type === "Corrective").length > 0 ? (
                  machine.history.filter(h => h.type === "Corrective").map((rec, i) => (
                    <div key={i} className="flex gap-3 bg-black/20 rounded-lg px-3 py-2.5">
                      <div className="w-0.5 bg-amber-400 rounded-full shrink-0 self-stretch"/>
                      <div>
                        <p className="text-[12px] text-zinc-200 leading-relaxed">&ldquo;{rec.note}&rdquo;</p>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-zinc-500">
                          <span>📅 {rec.date}</span>
                          <span>⏱ {rec.downtime}</span>
                          <span>💰 {rec.cost}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-zinc-600 italic text-center py-3">No corrective records</p>
                )}
              </div>
            )}
          </div>

          {/* Preventive — default closed */}
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 overflow-hidden">
            <button
              onClick={() => setPreventiveOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-green-500/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold bg-green-500/80 text-white px-2.5 py-1 rounded-full">PREVENTIVE</span>
                <span className="text-[11px] text-green-400/60">{machine.nlp.preventiveCount} records</span>
              </div>
              <span className="text-[10px] text-green-400/50 border border-green-500/20 px-2.5 py-0.5 rounded-lg">
                {preventiveOpen ? "▲ Hide" : "▼ Show"}
              </span>
            </button>
            {preventiveOpen && (
              <div className="px-4 pb-4 space-y-2.5 border-t border-green-500/10 pt-3">
                {machine.history.filter(h => h.type === "Preventive").length > 0 ? (
                  machine.history.filter(h => h.type === "Preventive").map((rec, i) => (
                    <div key={i} className="flex gap-3 bg-black/20 rounded-lg px-3 py-2.5">
                      <div className="w-0.5 bg-green-500 rounded-full shrink-0 self-stretch"/>
                      <div>
                        <p className="text-[12px] text-zinc-200 leading-relaxed">&ldquo;{rec.note}&rdquo;</p>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-zinc-500">
                          <span>📅 {rec.date}</span>
                          <span>⏱ {rec.downtime}</span>
                          <span>💰 {rec.cost}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-zinc-600 italic text-center py-3">No preventive records</p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* AI Recommendation — text only, no button */}
      {machine.recommendation && (
        <div className={`border rounded-2xl p-5 ${statusBg}`}>
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-lg shrink-0">🤖</div>
            <div className="flex-1">
              <p className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">AI Recommendation</p>
              <p className={`text-[14px] font-medium leading-relaxed ${statusAccent}`}>{machine.recommendation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance History */}
      <div className="bg-[#18191c] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-zinc-200">Maintenance History</p>
          <span className="text-[11px] text-zinc-500">
            {machine.history.length > 0
              ? `${historyStart + 1}–${Math.min(historyEnd, machine.history.length)} of ${machine.history.length}`
              : "No records"}
          </span>
        </div>

        {machine.history.length === 0 ? (
          <div className="py-12 text-center text-[12px] text-zinc-600">No maintenance history yet</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/2">
                  {["Date", "Type", "Downtime", "Cost", "Notes"].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((r, i) => (
                  <tr key={`${currentHistoryPage}-${i}`} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3 text-[12px] text-zinc-400 font-mono">{r.date}</td>
                    <td className="px-5 py-3"><TypeBadge type={r.type}/></td>
                    <td className="px-5 py-3 text-[12px] text-zinc-400">{r.downtime}</td>
                    <td className="px-5 py-3 text-[12px] text-zinc-400">{r.cost}</td>
                    <td className="px-5 py-3 text-[12px] text-zinc-500 max-w-xs truncate" title={r.note}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalHistoryPages > 1 && (
              <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-600">Page {currentHistoryPage} of {totalHistoryPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    disabled={currentHistoryPage === 1}
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      onClick={() => setHistoryPage(pageNum)}
                      className={`text-[11px] w-7 h-7 rounded-lg transition-colors ${
                        pageNum === currentHistoryPage
                          ? "bg-white/15 text-white font-semibold"
                          : "text-zinc-500 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                    disabled={currentHistoryPage === totalHistoryPages}
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}