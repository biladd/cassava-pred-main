"use client";

import Link from "next/link";
import { use } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface MaintenanceRecord {
  date: string;
  type: "Emergency" | "Corrective" | "Preventive";
  downtime: string;
  cost: string;
  note: string;
}

interface MachineDetail {
  id: string;
  name: string;
  type: string;
  location: string;
  line: string;
  lastMaintenance: string;
  healthScore: number;
  rul: string;
  maintenanceCount: number;
  emergencyCount: number;
  status: "critical" | "warning" | "good";
  nlpCategory: string;
  riskLevel: number;
  issues: { label: string; count: number; color: string }[];
  technicianNote: string;
  aiRecommendation: string;
  history: MaintenanceRecord[];
}

// ── Static data (ganti dengan fetch dari database berdasarkan id) ──────────
const machineData: Record<string, MachineDetail> = {
  "M-01": {
    id: "M-01", name: "Compressor A", type: "Compressor", location: "Line A", line: "Line A",
    lastMaintenance: "3 hari lalu", healthScore: 28, rul: "8.3 jam",
    maintenanceCount: 12, emergencyCount: 3, status: "critical",
    nlpCategory: "Mechanical", riskLevel: 80,
    issues: [
      { label: "Bearing",    count: 64, color: "bg-red-500"   },
      { label: "Overheating",count: 30, color: "bg-amber-400" },
      { label: "Emergency",  count: 28, color: "bg-red-400"   },
      { label: "Electrical", count: 10, color: "bg-zinc-500"  },
    ],
    technicianNote: "Bearing aus, perlu penggantian segera.",
    aiRecommendation: "Segera lakukan maintenance preventif dalam 6 jam ke depan. Prioritas penggantian bearing dan inspeksi motor untuk mencegah kepaduan total.",
    history: [
      { date: "2026-04-28", type: "Emergency",  downtime: "4.2 jam", cost: "Rp 8.500.000", note: "Bearing replacement" },
      { date: "2026-04-22", type: "Corrective", downtime: "2.1 jam", cost: "Rp 3.200.000", note: "Vibration adjustment" },
      { date: "2026-04-15", type: "Preventive", downtime: "1.5 jam", cost: "Rp 1.800.000", note: "Routine inspection"  },
      { date: "2026-04-10", type: "Emergency",  downtime: "5.3 jam", cost: "Rp 9.100.000", note: "Motor repair"        },
      { date: "2026-04-05", type: "Preventive", downtime: "1.2 jam", cost: "Rp 1.500.000", note: "Lubrication"         },
    ],
  },
  "M-02": {
    id: "M-02", name: "Conveyor B", type: "Conveyor", location: "Line B", line: "Line B",
    lastMaintenance: "5 hari lalu", healthScore: 61, rul: "31 jam",
    maintenanceCount: 7, emergencyCount: 1, status: "warning",
    nlpCategory: "Mechanical", riskLevel: 45,
    issues: [
      { label: "Vibration", count: 40, color: "bg-amber-400" },
      { label: "Belt wear",  count: 25, color: "bg-zinc-500"  },
    ],
    technicianNote: "Vibrasi meningkat, perlu pengecekan belt.",
    aiRecommendation: "Lakukan inspeksi belt dalam 24 jam ke depan. Pantau level vibrasi secara berkala.",
    history: [
      { date: "2026-04-20", type: "Preventive", downtime: "1.0 jam", cost: "Rp 1.200.000", note: "Belt inspection"    },
      { date: "2026-04-10", type: "Corrective", downtime: "2.5 jam", cost: "Rp 2.800.000", note: "Vibration fix"      },
    ],
  },
};

// ── Sensor chart ───────────────────────────────────────────────────────────
const sensorData = {
  labels: ["00:00","04:00","08:00","12:00","16:00","20:00","24:00"],
  temperature: [55, 58, 60, 62, 65, 70, 78],
  vibration:   [50, 52, 54, 56, 58, 62, 68],
  noise:       [48, 50, 53, 55, 57, 60, 65],
};

function SensorChart() {
  const W = 340, H = 160, padL = 28, padR = 8, padT = 8, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const toX = (i: number) => padL + (i / (sensorData.labels.length - 1)) * innerW;
  const toY = (v: number) => padT + innerH - (v / 100) * innerH;
  const makePath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Sensor trends">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line x1={padL} y1={toY(t)} x2={W - padR} y2={toY(t)} stroke="#ffffff10" strokeWidth="0.5"/>
          <text x={padL - 4} y={toY(t) + 3.5} textAnchor="end" fill="#555" fontSize="8">{t}</text>
        </g>
      ))}
      {sensorData.labels.map((l, i) => (
        <text key={l} x={toX(i)} y={H - 6} textAnchor="middle" fill="#555" fontSize="8">{l}</text>
      ))}
      <path d={makePath(sensorData.temperature)} fill="none" stroke="#e24b4a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={makePath(sensorData.vibration)}   fill="none" stroke="#ef9f27" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2"/>
      <path d={makePath(sensorData.noise)}       fill="none" stroke="#378add" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 3"/>
    </svg>
  );
}

// ── Gauge ──────────────────────────────────────────────────────────────────
function Gauge({ score }: { score: number }) {
  const r = 60, cx = 80, cy = 80;
  const startAngle = Math.PI * 0.75;
  const endAngle = Math.PI * 2.25;
  const angle = startAngle + (score / 100) * (endAngle - startAngle);
  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
  const px = cx + r * Math.cos(angle),       py = cy + r * Math.sin(angle);
  const color = score < 40 ? "#e24b4a" : score < 70 ? "#ef9f27" : "#63aa22";

  return (
    <svg viewBox="0 0 160 120" className="w-40">
      <path d={`M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 1 1 ${x2.toFixed(1)},${y2.toFixed(1)}`}
        fill="none" stroke="#ffffff10" strokeWidth="8" strokeLinecap="round"/>
      <path d={`M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${score > 50 ? 1 : 0} 1 ${px.toFixed(1)},${py.toFixed(1)}`}
        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"/>
      <text x={cx} y={cy + 8} textAnchor="middle" fill={color} fontSize="22" fontWeight="500">{score}%</text>
    </svg>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: MaintenanceRecord["type"] }) {
  const styles = {
    Emergency:  "bg-red-500 text-white",
    Corrective: "bg-amber-400 text-amber-900",
    Preventive: "bg-green-500/80 text-white",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${styles[type]}`}>{type}</span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const machine = machineData[id] ?? machineData["M-01"];

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-zinc-500 mb-4">
        <Link href="/dashboard" className="hover:text-zinc-300">Dashboard</Link>
        <span>/</span>
        <Link href="/dashboard/machines" className="hover:text-zinc-300">Machines</Link>
        <span>/</span>
        <span className="text-zinc-300">{machine.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-lg font-medium text-white">Machine {machine.id}</h1>
        <span className="bg-red-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded">
          {machine.status.toUpperCase()}
        </span>
      </div>
      <p className="text-[12px] text-zinc-500 -mt-4 mb-6">
        {machine.type} · {machine.line} · Last maintenance{" "}
        <span className="text-amber-400">{machine.lastMaintenance}</span>
      </p>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Health Score</p>
          <p className="text-2xl font-medium text-red-400">{machine.healthScore}%</p>
          <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${machine.healthScore}%` }}/>
          </div>
        </div>
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">RUL (Remaining Useful Life)</p>
          <p className="text-2xl font-medium text-white">{machine.rul}</p>
        </div>
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[11px] text-zinc-500 mb-1">Maintenance</p>
          <p className="text-2xl font-medium text-white">{machine.maintenanceCount}x</p>
          <p className="text-[11px] text-red-400">{machine.emergencyCount} emergency</p>
        </div>
      </div>

      {/* Charts + NLP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Sensor Trend */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Sensor Trend</p>
          <SensorChart />
          <div className="flex gap-4 mt-3">
            {[
              { label: "Temperature", color: "bg-red-500"   },
              { label: "Vibration",   color: "bg-amber-400" },
              { label: "Noise",       color: "bg-blue-500"  },
            ].map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`w-2.5 h-0.5 ${s.color}`}/>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* NLP Analysis */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">NLP Analysis</p>
          <p className="text-[11px] text-zinc-500 mb-1">Dominant Category</p>
          <p className="text-[13px] font-medium text-white mb-3">{machine.nlpCategory}</p>

          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-zinc-500">Risk Level</p>
            <p className="text-[13px] font-medium text-red-400">TINGGI ({machine.riskLevel}%)</p>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${machine.riskLevel}%` }}/>
          </div>

          <p className="text-[11px] text-zinc-500 mb-2">Issue Frequency</p>
          <div className="flex flex-col gap-2 mb-4">
            {machine.issues.map((issue) => (
              <div key={issue.label} className="flex items-center justify-between">
                <span className="text-[12px] text-zinc-400">{issue.label}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded text-white ${issue.color}`}>
                  {issue.count}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-zinc-500 mb-1">Technician Note</p>
          <p className="text-[12px] text-zinc-400 italic">&ldquo;{machine.technicianNote}&rdquo;</p>
        </div>
      </div>

      {/* Failure Prediction + AI Recommendation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Failure Prediction */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Failure Prediction</p>
          <div className="flex items-center gap-4">
            <Gauge score={machine.healthScore} />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-amber-400 text-amber-900 text-[10px] font-semibold px-2 py-0.5 rounded">
                  RUL: {machine.rul}
                </span>
              </div>
              <p className="text-[11px] text-red-400 mt-1">↘ Trend menurun</p>
              <p className="text-[11px] text-red-400 font-semibold mt-0.5">CRITICAL</p>
            </div>
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="bg-[#18191c] border border-l-2 border-l-green-500 border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-3">AI Recommendation</p>
          <p className="text-[12px] text-zinc-400 leading-5 mb-4">{machine.aiRecommendation}</p>
          <button className="w-full bg-green-500 hover:bg-green-400 text-white text-[12px] font-semibold py-2.5 rounded-lg transition-colors">
            Schedule Maintenance
          </button>
        </div>
      </div>

      {/* Maintenance History */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-[13px] font-medium text-zinc-300">Maintenance History</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Tanggal", "Tipe", "Downtime", "Biaya", "Catatan"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {machine.history.map((record, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-[12px] text-zinc-400">{record.date}</td>
                <td className="px-4 py-3"><TypeBadge type={record.type}/></td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{record.downtime}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{record.cost}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{record.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}