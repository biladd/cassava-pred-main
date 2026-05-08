"use client";

import Link from "next/link";

type MachineStatus = "critical" | "warning" | "good";

interface Machine {
  id: string;
  name: string;
  type: string;
  location: string;
  status: MachineStatus;
  healthScore: number;
  rul: string;
  lastMaintenance: string;
}

// ── Static data (ganti dengan fetch dari database) ─────────────────────────
const machines: Machine[] = [
  { id: "M-01", name: "Compressor A",  type: "Compressor", location: "Line A", status: "critical", healthScore: 28, rul: "8.3 jam",  lastMaintenance: "3 hari lalu" },
  { id: "M-02", name: "Conveyor B",    type: "Conveyor",   location: "Line B", status: "warning",  healthScore: 61, rul: "31 jam",   lastMaintenance: "5 hari lalu" },
  { id: "M-03", name: "Mixer C",       type: "Mixer",      location: "Line A", status: "good",     healthScore: 91, rul: "120+ jam", lastMaintenance: "1 hari lalu" },
  { id: "M-04", name: "Pump D",        type: "Pump",       location: "Line C", status: "good",     healthScore: 85, rul: "120+ jam", lastMaintenance: "2 hari lalu" },
  { id: "M-05", name: "Dryer E",       type: "Dryer",      location: "Line B", status: "good",     healthScore: 73, rul: "85 jam",   lastMaintenance: "4 hari lalu" },
];

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

export default function MachinesPage() {
  const critical = machines.filter((m) => m.status === "critical").length;
  const warning  = machines.filter((m) => m.status === "warning").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Machines</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">
            {machines.length} mesin terpantau · {critical} critical · {warning} warning
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["ID", "Nama", "Tipe", "Lokasi", "Status", "Health Score", "RUL", "Maintenance Terakhir"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {machines.map((m) => (
              <tr key={m.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`//machines/${m.id}`} className="text-[13px] font-medium text-blue-400 hover:text-blue-300">
                    {m.id}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[13px] text-zinc-300">{m.name}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{m.type}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{m.location}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(m.status)}`}>
                    {statusLabel(m.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(m.healthScore)}`} style={{ width: `${m.healthScore}%` }}/>
                    </div>
                    <span className="text-[12px] text-zinc-400">{m.healthScore}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{m.rul}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{m.lastMaintenance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}