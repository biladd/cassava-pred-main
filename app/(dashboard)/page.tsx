"use client";

import Link from "next/link";

type MachineStatus = "critical" | "warning" | "good";

interface Machine {
  id: string;
  status: MachineStatus;
  healthScore: number;
  rul: string;
}

interface Alert {
  id: number;
  severity: "CRITICAL" | "WARNING";
  machine: string;
  message: string;
  time: string;
}

// ── Static data (ganti dengan fetch dari database) ─────────────────────────
const machines: Machine[] = [
  { id: "M-01", status: "critical", healthScore: 28, rul: "8.3 jam" },
  { id: "M-02", status: "warning",  healthScore: 61, rul: "31 jam"  },
  { id: "M-03", status: "good",     healthScore: 91, rul: "120+ jam"},
  { id: "M-04", status: "good",     healthScore: 85, rul: "120+ jam"},
  { id: "M-05", status: "good",     healthScore: 73, rul: "85 jam"  },
];

const alerts: Alert[] = [
  { id: 1, severity: "CRITICAL", machine: "M-01", message: "Health score turun drastis, RUL < 10 jam", time: "2 menit lalu" },
  { id: 2, severity: "WARNING",  machine: "M-02", message: "Vibrasi melebihi batas normal", time: "15 menit lalu" },
];

const stats = {
  totalMesin: 20,
  statusKritis: 2,
  avgHealthScore: 74,
  rulTerpendek: "8.3 jam",
  rulMachine: "M-01",
};

// ── Helpers ────────────────────────────────────────────────────────────────
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

// ── Sensor Chart (SVG) ─────────────────────────────────────────────────────
const sensorData = {
  labels: ["00:00","04:00","08:00","12:00","16:00","20:00","24:00"],
  temperature: [55, 58, 60, 62, 65, 70, 78],
  vibration:   [50, 52, 54, 56, 58, 62, 68],
  noise:       [48, 50, 53, 55, 57, 60, 65],
};

function SensorChart() {
  const W = 320, H = 160, padL = 28, padR = 8, padT = 8, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  function toX(i: number) { return padL + (i / (sensorData.labels.length - 1)) * innerW; }
  function toY(v: number) { return padT + innerH - ((v - 0) / 100) * innerH; }
  function makePath(data: number[]) {
    return data.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Sensor trends line chart">
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

// ── Page ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div className="p-6">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-medium text-white">Predictive Maintenance Dashboard</h1>
        <span className="bg-amber-400 text-amber-900 text-[11px] font-semibold px-3 py-1.5 rounded-full">
          {alerts.length} alert aktif
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total Mesin",      value: stats.totalMesin,      sub: "Semua terpantau",   color: "text-green-400" },
          { label: "Status Kritis",    value: stats.statusKritis,    sub: "Perlu maintenance", color: "text-red-400"   },
          { label: "Avg Health Score", value: `${stats.avgHealthScore}%`, sub: "Di bawah target",  color: "text-amber-400"},
          { label: "RUL Terpendek",    value: stats.rulTerpendek,    sub: `${stats.rulMachine} segera cek`, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[#18191c] border border-white/5 rounded-xl p-4">
            <p className="text-[11px] text-zinc-500 mb-1.5">{s.label}</p>
            <p className="text-2xl font-medium text-white leading-none mb-1">{s.value}</p>
            <p className={`text-[11px] ${s.color}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Health Score */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Health Score per Mesin</p>
          {machines.map((m) => (
            <Link key={m.id} href={`/machines/${m.id}`} className="block mb-3 group">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[12px] text-zinc-400 group-hover:text-white transition-colors">{m.id}</span>
                <span className={`text-[11px] font-medium ${scoreColor(m.healthScore)}`}>{m.healthScore}% ●</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor(m.healthScore)}`} style={{ width: `${m.healthScore}%` }}/>
              </div>
            </Link>
          ))}
          <div className="flex gap-4 mt-3">
            <span className="text-[10px] text-red-400">M-01: 8.3 jam</span>
            <span className="text-[10px] text-amber-400">M-02: 31 jam</span>
            <span className="text-[10px] text-green-400">M-03: 120+ jam</span>
          </div>
        </div>

        {/* Sensor Trends */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Sensor Trends M-01</p>
          <SensorChart />
          <div className="flex gap-4 mt-3">
            {[
              { label: "Temperature", color: "bg-red-500"   },
              { label: "Vibration",   color: "bg-amber-400" },
              { label: "Noise",       color: "bg-blue-500"  },
            ].map((s) => (
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
        <p className="text-[13px] font-medium text-zinc-300 mb-1">Alerts</p>
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start justify-between py-3 border-b border-white/5 last:border-0">
            <div className="flex items-start gap-3">
              <div className={`w-[3px] h-9 rounded-full shrink-0 mt-0.5 ${a.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-400"}`}/>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${a.severity === "CRITICAL" ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"}`}>
                    {a.severity}
                  </span>
                  <span className="text-[11px] text-zinc-400">{a.machine}</span>
                </div>
                <p className="text-[12px] text-zinc-500">{a.message}</p>
              </div>
            </div>
            <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 pt-0.5">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}