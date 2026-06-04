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

  // Task B probabilities
  probHealthy: number;
  probWarning: number;
  probCritical: number;

  // Task C — LSTM RUL
  rulHours: number;
  rulDays: number;
  rulCapped: boolean;

  // Anomaly — IsolationForest
  isAnomaly: boolean;
  anomalyScore: number;

  // latest sensor
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

  // Extended with real data from Supabase (notebook Stage 3)
  nlp: {
    totalLogs: number;
    emergencyCount: number;
    correctiveCount: number;
    preventiveCount: number;
    avgDowntime: number;
    totalCost: number;
    daysSinceLastMaint: number;
    hasUrgentRecent: boolean;

    // From Supabase nlp_sentiment_summary
    avgSeverity: number;
    maxSeverity: number;
    riskLevel: string;
    urgentRate: number;
    dominantTopic: number;
    avgTechTerms: number;
    avgProblemKw: number;

    // From Supabase nlp_summary_keywords
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

// ── Skeleton ───────────────────────────────────────────────────────────────
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

  const fetchDetail = useCallback(async () => {
    try {
      setError(null);

      // 1. Fetch latest sensor data for this machine
      const { data: sensorData, error: sErr } = await supabase
        .from("sensor_readings")
        .select("*")
        .eq("machine_id", id)
        .order("timestamp", { ascending: false })
        .limit(48);

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);
      if (!sensorData || sensorData.length === 0) throw new Error(`Sensor data for ${id} not found`);

      const latest = sensorData[0];

      // 2. Prediction from FastAPI
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

      // 3. Fetch maintenance logs (full history, max 100)
      const { data: maintData } = await supabase
        .from("maintenance_logs")
        .select("*")
        .eq("machine_id", id)
        .order("date", { ascending: false })
        .limit(100);

      // Fetch NLP sentiment summary from Supabase (Stage 3 NLP data)
      const { data: nlpSentiment } = await supabase
        .from("nlp_sentiment_summary")
        .select("*")
        .eq("machine_id", id)
        .single();

      // Fetch top 5 keywords from Supabase
      const { data: nlpKeywords } = await supabase
        .from("nlp_summary_keywords")
        .select("keyword, tfidf_score, rank")
        .eq("machine_id", id)
        .order("rank", { ascending: true });

      // Fetch maintenance summary (action counts, cost, downtime) from notebook
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

      // Compute NLP summary from maintenance_logs
      const allLogs = maintData ?? [];
      const correctiveCount = allLogs.filter(m => m.maintenance_type === "Corrective").length;
      const preventiveCount = allLogs.filter(m => m.maintenance_type === "Preventive").length;
      const totalDowntime = allLogs.reduce((s, m) => s + (Number(m.downtime_hours) || 0), 0);
      const totalCost = allLogs.reduce((s, m) => s + (Number(m.cost_idr) || 0), 0);
      const avgDowntime = allLogs.length ? totalDowntime / allLogs.length : 0;

      // Days since last maintenance
      const daysSince = allLogs[0]
        ? Math.floor((Date.now() - new Date(allLogs[0].date).getTime()) / (1000 * 60 * 60 * 24))
        : -1;

      // Urgent flag = Emergency within last 30 days
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

        // Task B probabilities
        probHealthy : pred.task_B.probabilities.Healthy,
        probWarning : pred.task_B.probabilities.Warning,
        probCritical: pred.task_B.probabilities.Critical,

        // Task C
        rulHours    : pred.task_C?.rul_hours ?? 168,
        rulDays     : pred.task_C?.rul_days ?? 7,
        rulCapped   : pred.task_C?.rul_capped ?? false,

        // Anomaly
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

        // NLP summary — using REAL data from notebook Stage 3 (Supabase tables)
        nlp: {
          // Using data from nlp_top_actions (full history) not allLogs (limit 10)
          totalLogs      : nlpActions?.total_logs ?? allLogs.length,
          emergencyCount : nlpActions?.emergency_count ?? emergencyCount,
          correctiveCount: nlpActions?.corrective_count ?? correctiveCount,
          preventiveCount: nlpActions?.preventive_count ?? preventiveCount,
          avgDowntime    : nlpActions?.avg_downtime_hrs ?? avgDowntime,
          totalCost      : nlpActions?.total_cost_idr ?? totalCost,

          // Computed from allLogs — for "last 30 days"
          daysSinceLastMaint: daysSince,
          hasUrgentRecent,

          // From nlp_sentiment_summary (notebook Stage 3)
          avgSeverity   : nlpSentiment?.avg_severity ?? 0,
          maxSeverity   : nlpSentiment?.max_severity ?? 0,
          riskLevel     : nlpSentiment?.risk_level ?? "Unknown",
          urgentRate    : nlpSentiment?.urgent_rate ?? 0,
          dominantTopic : nlpSentiment?.dominant_topic ?? 0,
          avgTechTerms  : nlpSentiment?.avg_tech_terms ?? 0,
          avgProblemKw  : nlpSentiment?.avg_problem_kw ?? 0,

          // From nlp_summary_keywords (notebook Stage 3)
          topKeywords: (nlpKeywords ?? []).map(k => ({
            keyword: k.keyword,
            score  : k.tfidf_score,
          })),
        },
      });

      console.log("NLP Sentiment:", nlpSentiment);
      console.log("NLP Keywords:", nlpKeywords);

      // 4. Sensor trend (last 24 data points, reversed)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDetail();
  }, [fetchDetail]);

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
        <p className="text-[13px] text-red-400 font-medium mb-2">Failed to load machine data</p>
        <p className="text-[11px] text-red-400/70 mb-4">{error}</p>
        <button onClick={fetchDetail} className="text-[11px] text-red-400 border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/10">
          Try Again
        </button>
      </div>
    </div>
  );

  // Pagination logic for Maintenance History
  const HISTORY_PAGE_SIZE = 10;
  const totalHistoryPages = Math.max(1, Math.ceil(machine.history.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages);
  const historyStart = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const historyEnd = historyStart + HISTORY_PAGE_SIZE;
  const paginatedHistory = machine.history.slice(historyStart, historyEnd);

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
              WILL FAIL IN 7 DAYS
            </span>
          )}
        </div>
        <button onClick={fetchDetail} className="text-[11px] text-zinc-500 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
          Refresh
        </button>
      </div>
      <p className="text-[12px] text-zinc-500 mb-6">
        Latest data: <span className="text-zinc-400">{machine.lastTimestamp}</span> ·
        Latest Maintenance: <span className="text-amber-400">{machine.lastMaintenance}</span>
      </p>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Health Score</p>
          <p className={`text-2xl font-medium ${scoreColor(machine.healthScore)}`}>{machine.healthScore}%</p>
          <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor(machine.healthScore)}`} style={{width:`${machine.healthScore}%`}}/>
          </div>
        </div>

        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Failure Prob (Task A)</p>
          <p className={`text-2xl font-medium ${machine.failureProb >= 0.5 ? "text-red-400" : machine.failureProb >= 0.2 ? "text-amber-400" : "text-green-400"}`}>
            {(machine.failureProb * 100).toFixed(1)}%
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Risk: <span className={machine.riskLevel === "HIGH" ? "text-red-400" : machine.riskLevel === "MEDIUM" ? "text-amber-400" : "text-green-400"}>{machine.riskLevel}</span>
          </p>
        </div>

        {/* RUL Card */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">RUL (Task C)</p>
          <p className={`text-2xl font-medium ${
            machine.rulHours < 24 ? "text-red-500" :
            machine.rulHours < 72 ? "text-red-400" :
            machine.rulHours < 168 ? "text-amber-400" :
            "text-green-400"
          }`}>
            {formatRUL(machine.rulHours)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {machine.rulHours >= 999 ? "More than 7 days" : `${machine.rulHours}h`}
            {machine.rulCapped ? " (> 7d)" : ""}
          </p>
        </div>

        {/* Anomaly Card */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Anomaly</p>
          <p className={`text-2xl font-medium ${machine.isAnomaly ? "text-purple-400" : "text-green-400"}`}>
            {machine.anomalyScore.toFixed(2)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {machine.isAnomaly ? <span className="text-purple-400">Detected</span> : "Normal"}
          </p>
        </div>

        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Maintenance</p>
          <p className="text-2xl font-medium text-white">{machine.nlp.totalLogs}x</p>
          <p className="text-[11px] text-red-400">{machine.nlp.emergencyCount} emergency</p>
        </div>
      </div>

      {/* Sensor values */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "Temperature", value: `${machine.temperature.toFixed(1)}°C`,        warn: machine.temperature >= 85  },
          { label: "Vibration",   value: machine.vibration.toFixed(2),                 warn: machine.vibration >= 1.0   },
          { label: "Pressure",    value: `${machine.pressure.toFixed(1)} bar`,         warn: machine.pressure >= 110    },
          { label: "RPM",         value: machine.rpm.toString(),                       warn: false                      },
          { label: "Power",       value: `${machine.power_consumption.toFixed(1)} kW`, warn: false                      },
          { label: "Noise",       value: `${machine.noise_level.toFixed(1)} dB`,       warn: machine.noise_level >= 80  },
          { label: "Humidity",    value: `${machine.humidity.toFixed(1)}%`,            warn: false                      },
          { label: "Op. Hours",   value: `${machine.operating_hours.toFixed(0)} h`,    warn: false                      },
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
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Sensor Trend (last 24 readings)</p>
          <SensorChart data={sensorTrend}/>
          <div className="flex gap-4 mt-3">
            {[
              { label: "Temperature",   color: "bg-red-500"   },
              { label: "Vibration×100", color: "bg-amber-400" },
              { label: "Noise",         color: "bg-blue-500"  },
            ].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`w-2.5 h-0.5 ${s.color}`}/>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Failure Prediction (Gauge) */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-3">Failure Prediction</p>
          <div className="flex items-center gap-4">
            <Gauge score={machine.healthScore}/>
            <div>
              <p className={`text-[13px] font-semibold mb-1 ${scoreColor(machine.healthScore)}`}>{machine.healthLabel}</p>
              <p className="text-[11px] text-zinc-500">Failure prob: <span className="text-red-400">{(machine.failureProb * 100).toFixed(1)}%</span></p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Risk:{" "}
                <span className={machine.riskLevel === "HIGH" ? "text-red-400" : machine.riskLevel === "MEDIUM" ? "text-amber-400" : "text-green-400"}>
                  {machine.riskLevel}
                </span>
              </p>
              {machine.willFail && <p className="text-[11px] text-red-400 font-semibold mt-1">⚠️ Will fail within 7 days!</p>}
            </div>
          </div>
        </div>
      </div>

      {/* AI Model Output Detail — full width */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl p-5 mb-4">
        <p className="text-[13px] font-medium text-zinc-300 mb-4">AI Model Output Detail</p>
        <div className="space-y-4">

          {/* Task A */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-zinc-400">Task A · Failure Probability (Random Forest)</span>
              <span className={`text-[11px] font-semibold ${machine.failureProb >= 0.5 ? "text-red-400" : machine.failureProb >= 0.2 ? "text-amber-400" : "text-green-400"}`}>
                {(machine.failureProb * 100).toFixed(1)}% · {machine.riskLevel}
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 w-px bg-amber-500/60" style={{ left: "20%" }}/>
              <div className="absolute top-0 bottom-0 w-px bg-red-500/60" style={{ left: "50%" }}/>
              <div
                className={`h-full transition-all duration-500 ${machine.failureProb >= 0.5 ? "bg-red-500" : machine.failureProb >= 0.2 ? "bg-amber-400" : "bg-green-500"}`}
                style={{ width: `${machine.failureProb * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>0%</span><span>20% (thr)</span><span>50% (high)</span><span>100%</span>
            </div>
          </div>

          {/* Task B */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-zinc-400">Task B · Health Status Distribution (Random Forest)</span>
              <span className="text-[11px] text-zinc-500">{machine.healthLabel}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden flex">
              <div className="bg-green-500" style={{ width: `${machine.probHealthy * 100}%` }}/>
              <div className="bg-amber-400" style={{ width: `${machine.probWarning * 100}%` }}/>
              <div className="bg-red-500"   style={{ width: `${machine.probCritical * 100}%` }}/>
            </div>
            <div className="flex justify-between text-[9px] mt-1">
              <span className="text-green-500">● Healthy {(machine.probHealthy * 100).toFixed(0)}%</span>
              <span className="text-amber-400">● Warning {(machine.probWarning * 100).toFixed(0)}%</span>
              <span className="text-red-500">● Critical {(machine.probCritical * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Task C */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-zinc-400">Task C · Remaining Useful Life (LSTM)</span>
              <span className={`text-[11px] font-semibold ${machine.rulHours < 24 ? "text-red-500" : machine.rulHours < 72 ? "text-red-400" : machine.rulHours < 168 ? "text-amber-400" : "text-green-400"}`}>
                {formatRUL(machine.rulHours)}
                {machine.rulHours < 999 && ` (${machine.rulHours}h)`}
                {machine.rulCapped && " · > 7d"}
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 w-px bg-red-500/60"   style={{ left: "14.3%" }}/>
              <div className="absolute top-0 bottom-0 w-px bg-amber-500/60" style={{ left: "42.9%" }}/>
              <div
                className={`h-full transition-all duration-500 ${machine.rulHours < 24 ? "bg-red-500" : machine.rulHours < 72 ? "bg-red-400" : machine.rulHours < 168 ? "bg-amber-400" : "bg-green-500"}`}
                style={{ width: `${Math.min((machine.rulHours / 168) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>0h</span><span>24h (critical)</span><span>72h (warning)</span><span>168h (max)</span>
            </div>
          </div>

          {/* Anomaly */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-zinc-400">Anomaly Detection (IsolationForest)</span>
              <span className={`text-[11px] font-semibold ${machine.isAnomaly ? "text-purple-400" : "text-green-400"}`}>
                Score {machine.anomalyScore.toFixed(3)} · {machine.isAnomaly ? "DETECTED" : "Normal"}
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden relative">
              <div className="absolute top-0 bottom-0 w-0.5 bg-purple-400" style={{left: "62%"}} title="Threshold 0.62"/>
              <div
                className={`h-full transition-all duration-500 ${machine.isAnomaly ? "bg-purple-500" : "bg-zinc-500"}`}
                style={{ width: `${Math.min(machine.anomalyScore * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-zinc-600 mt-1">
              <span>0</span><span className="text-purple-400">↑ threshold 0.62</span><span>1.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* NLP Summary — full width */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-medium text-zinc-300">NLP Summary · Maintenance Log Analysis</p>
          <div className="flex items-center gap-2">
            {machine.nlp.hasUrgentRecent && (
              <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-medium">
                URGENT 30D
              </span>
            )}
            <span className="text-[10px] text-zinc-500">{machine.nlp.totalLogs} records</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Distribution */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] text-zinc-500">Average Severity (NLP)</span>
                <span className="text-[11px] text-zinc-400">
                  {machine.nlp.avgSeverity.toFixed(2)}/5 · max {machine.nlp.maxSeverity}
                </span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                <div className="absolute top-0 bottom-0 w-px bg-amber-500/40" style={{left: "40%"}} title="Medium 2/5"/>
                <div className="absolute top-0 bottom-0 w-px bg-red-500/40"   style={{left: "80%"}} title="High 4/5"/>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    machine.nlp.riskLevel === "High"   ? "bg-red-500"   :
                    machine.nlp.riskLevel === "Medium" ? "bg-amber-400" :
                    "bg-green-500"
                  }`}
                  style={{ width: `${(machine.nlp.avgSeverity / 5) * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-1 text-[9px]">
                <span className="text-zinc-600">0</span>
                <span className={`font-semibold ${
                  machine.nlp.riskLevel === "High"   ? "text-red-400"   :
                  machine.nlp.riskLevel === "Medium" ? "text-amber-400" :
                  "text-green-400"
                }`}>
                  {machine.nlp.riskLevel} Risk
                </span>
                <span className="text-zinc-600">5</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Type Distribution</p>
              {[
                { label: "Emergency",  count: machine.nlp.emergencyCount,  color: "bg-red-500",   textColor: "text-red-400"   },
                { label: "Corrective", count: machine.nlp.correctiveCount, color: "bg-amber-400", textColor: "text-amber-400" },
                { label: "Preventive", count: machine.nlp.preventiveCount, color: "bg-green-500", textColor: "text-green-400" },
              ].map(t => (
                <div key={t.label} className="flex items-center gap-2">
                  <span className={`text-[10px] w-16 ${t.textColor}`}>{t.label}</span>
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${t.color}`}
                      style={{ width: machine.nlp.totalLogs > 0 ? `${(t.count / machine.nlp.totalLogs) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 w-4 text-right">{t.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Bullet Insights */}
          <div className="space-y-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Insights (NLP Analysis)</p>
            <div className="space-y-1.5">

              {/* Risk level from notebook */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${
                  machine.nlp.riskLevel === "High"   ? "text-red-400"   :
                  machine.nlp.riskLevel === "Medium" ? "text-amber-400" :
                  "text-green-400"
                }`}>•</span>
                <p className="text-[11px] text-zinc-400">
                  Risk level:{" "}
                  <span className={`font-semibold ${
                    machine.nlp.riskLevel === "High"   ? "text-red-400"   :
                    machine.nlp.riskLevel === "Medium" ? "text-amber-400" :
                    "text-green-400"
                  }`}>
                    {machine.nlp.riskLevel}
                  </span>{" "}
                  (avg severity {machine.nlp.avgSeverity.toFixed(2)}/5)
                </p>
              </div>

              {/* Urgent rate */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${machine.nlp.urgentRate > 0.3 ? "text-red-400" : "text-zinc-600"}`}>•</span>
                <p className="text-[11px] text-zinc-400">
                  Urgent rate:{" "}
                  <span className={`font-semibold ${machine.nlp.urgentRate > 0.3 ? "text-red-400" : "text-zinc-300"}`}>
                    {(machine.nlp.urgentRate * 100).toFixed(1)}%
                  </span>{" "}
                  of all maintenance logs
                </p>
              </div>

              {/* Dominant topic + tech terms */}
              <div className="flex items-start gap-2">
                <span className="text-zinc-600 text-[10px] mt-0.5">•</span>
                <p className="text-[11px] text-zinc-400">
                  Dominant topic: <span className="font-medium text-zinc-300">Topic #{machine.nlp.dominantTopic}</span>
                  {" · "}
                  Avg <span className="text-white">{machine.nlp.avgTechTerms.toFixed(1)}</span> tech terms,
                  {" "}
                  <span className="text-white">{machine.nlp.avgProblemKw.toFixed(1)}</span> problem keywords
                </p>
              </div>

              {/* Total logs */}
              <div className="flex items-start gap-2">
                <span className="text-zinc-600 text-[10px] mt-0.5">•</span>
                <p className="text-[11px] text-zinc-400">
                  Total <span className="text-white font-medium">{machine.nlp.totalLogs}</span> maintenance records logged
                </p>
              </div>

              {/* Emergency count */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${machine.nlp.emergencyCount > 0 ? "text-red-400" : "text-zinc-600"}`}>•</span>
                <p className="text-[11px] text-zinc-400">
                  {machine.nlp.emergencyCount > 0
                    ? <><span className="text-red-400 font-medium">{machine.nlp.emergencyCount}x emergency</span> recorded in history</>
                    : "No emergencies recorded in history"
                  }
                </p>
              </div>

              {/* Urgent recent */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${machine.nlp.hasUrgentRecent ? "text-red-400" : "text-zinc-600"}`}>•</span>
                <p className="text-[11px] text-zinc-400">
                  {machine.nlp.hasUrgentRecent
                    ? <><span className="text-red-400 font-medium">Emergency occurred within the last 30 days</span></>
                    : "No emergency within the last 30 days"
                  }
                </p>
              </div>

              {/* Avg downtime */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${machine.nlp.avgDowntime > 5 ? "text-amber-400" : "text-zinc-600"}`}>•</span>
                <p className="text-[11px] text-zinc-400">
                  Average downtime{" "}
                  <span className={`font-medium ${machine.nlp.avgDowntime > 5 ? "text-amber-400" : "text-white"}`}>
                    {machine.nlp.avgDowntime.toFixed(1)} hrs
                  </span>{" "}
                  per maintenance
                </p>
              </div>

              {/* Days since last */}
              <div className="flex items-start gap-2">
                <span className={`text-[10px] mt-0.5 ${machine.nlp.daysSinceLastMaint > 60 ? "text-red-400" : machine.nlp.daysSinceLastMaint > 30 ? "text-amber-400" : "text-zinc-600"}`}>•</span>
                <p className="text-[11px] text-zinc-400">
                  Last maintenance{" "}
                  {machine.nlp.daysSinceLastMaint < 0 ? "unknown" : (
                    <>
                      <span className={`font-medium ${machine.nlp.daysSinceLastMaint > 60 ? "text-red-400" : machine.nlp.daysSinceLastMaint > 30 ? "text-amber-400" : "text-white"}`}>
                        {machine.nlp.daysSinceLastMaint} days
                      </span>{" "}ago
                    </>
                  )}
                </p>
              </div>

            </div>
            <div className="mt-3 pt-2 border-t border-white/5">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-500">Total historical cost:</span>
                <span className="text-zinc-300 font-medium">Rp {machine.nlp.totalCost.toLocaleString("en-US")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Keywords NLP (from TF-IDF analysis in Stage 3) */}
      {machine.nlp.topKeywords.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-medium text-zinc-300">Top Keywords from Maintenance Notes</p>
            <span className="text-[9px] text-zinc-500">TF-IDF · Stage 3 NLP</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {machine.nlp.topKeywords.map((kw, i) => {
              const intensity = kw.score / (machine.nlp.topKeywords[0]?.score || 1);
              return (
                <div
                  key={i}
                  className="px-2.5 py-1.5 rounded-lg border flex items-center gap-2"
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
          <p className="text-[10px] text-zinc-600 mt-2">
            Most frequently occurring keywords in technician notes for this machine, ranked by TF-IDF importance.
          </p>
        </div>
      )}

      {/* Technician Notes by Maintenance Type */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <p className="text-[12px] font-medium text-zinc-300 mb-3">Technician Notes by Maintenance Type</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Emergency Column */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded">
                EMERGENCY
              </span>
              <span className="text-[10px] text-zinc-500">{machine.nlp.emergencyCount} records</span>
            </div>
            {machine.history.filter(h => h.type === "Emergency").length > 0 ? (
              <div className="space-y-2">
                {machine.history.filter(h => h.type === "Emergency").map((rec, i) => (
                  <div key={i} className="border-l-2 border-red-500 pl-2">
                    <p className="text-[11px] text-zinc-300 leading-4">&ldquo;{rec.note}&rdquo;</p>
                    <p className="text-[9px] text-zinc-500 mt-1">
                      {rec.date} · {rec.downtime} · {rec.cost}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600 italic">No emergency records</p>
            )}
          </div>

          {/* Corrective Column */}
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded">
                CORRECTIVE
              </span>
              <span className="text-[10px] text-zinc-500">{machine.nlp.correctiveCount} records</span>
            </div>
            {machine.history.filter(h => h.type === "Corrective").length > 0 ? (
              <div className="space-y-2">
                {machine.history.filter(h => h.type === "Corrective").map((rec, i) => (
                  <div key={i} className="border-l-2 border-amber-400 pl-2">
                    <p className="text-[11px] text-zinc-300 leading-4">&ldquo;{rec.note}&rdquo;</p>
                    <p className="text-[9px] text-zinc-500 mt-1">
                      {rec.date} · {rec.downtime} · {rec.cost}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600 italic">No corrective records</p>
            )}
          </div>

          {/* Preventive Column */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold bg-green-500/80 text-white px-1.5 py-0.5 rounded">
                PREVENTIVE
              </span>
              <span className="text-[10px] text-zinc-500">{machine.nlp.preventiveCount} records</span>
            </div>
            {machine.history.filter(h => h.type === "Preventive").length > 0 ? (
              <div className="space-y-2">
                {machine.history.filter(h => h.type === "Preventive").map((rec, i) => (
                  <div key={i} className="border-l-2 border-green-500 pl-2">
                    <p className="text-[11px] text-zinc-300 leading-4">&ldquo;{rec.note}&rdquo;</p>
                    <p className="text-[9px] text-zinc-500 mt-1">
                      {rec.date} · {rec.downtime} · {rec.cost}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600 italic">No preventive records</p>
            )}
          </div>

        </div>
      </div>

      {/* AI Recommendation */}
      {machine.recommendation && (
        <div className={`border rounded-xl p-4 mb-4 mt-4 ${
          machine.status === "critical" ? "bg-red-500/5 border-red-500/20" :
          machine.status === "warning"  ? "bg-amber-400/5 border-amber-400/20" :
          "bg-green-500/5 border-green-500/20"
        }`}>
          <p className="text-[11px] text-zinc-500 mb-1.5">AI Model Recommendation</p>
          <p className="text-[13px] text-zinc-300 leading-relaxed">{machine.recommendation}</p>
          <button className="mt-3 w-full bg-green-500 hover:bg-green-400 text-white text-[12px] font-semibold py-2.5 rounded-lg transition-colors">
            Schedule Maintenance
          </button>
        </div>
      )}

      {/* Maintenance History — with Pagination */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <p className="text-[13px] font-medium text-zinc-300">Maintenance History</p>
          <span className="text-[11px] text-zinc-500">
            {machine.history.length > 0 ? (
              <>Showing {historyStart + 1}–{Math.min(historyEnd, machine.history.length)} of {machine.history.length}</>
            ) : "From Supabase"}
          </span>
        </div>

        {machine.history.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-zinc-500">No maintenance history yet</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Date", "Type", "Downtime", "Cost", "Notes"].map(h => (
                    <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((r, i) => (
                  <tr key={`${currentHistoryPage}-${i}`} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-[12px] text-zinc-400">{r.date}</td>
                    <td className="px-4 py-3"><TypeBadge type={r.type}/></td>
                    <td className="px-4 py-3 text-[12px] text-zinc-400">{r.downtime}</td>
                    <td className="px-4 py-3 text-[12px] text-zinc-400">{r.cost}</td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalHistoryPages > 1 && (
              <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">
                  Page {currentHistoryPage} of {totalHistoryPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    disabled={currentHistoryPage === 1}
                    className={`text-[11px] px-3 py-1 rounded-lg border transition-colors ${
                      currentHistoryPage === 1
                        ? "border-white/5 text-zinc-700 cursor-not-allowed"
                        : "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    ← Prev
                  </button>
                  <div className="flex items-center gap-1 mx-1">
                    {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map(pageNum => (
                      <button
                        key={pageNum}
                        onClick={() => setHistoryPage(pageNum)}
                        className={`text-[11px] w-7 h-7 rounded-lg transition-colors ${
                          pageNum === currentHistoryPage
                            ? "bg-white/10 text-white font-medium"
                            : "text-zinc-500 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                    disabled={currentHistoryPage === totalHistoryPages}
                    className={`text-[11px] px-3 py-1 rounded-lg border transition-colors ${
                      currentHistoryPage === totalHistoryPages
                        ? "border-white/5 text-zinc-700 cursor-not-allowed"
                        : "border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
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