"use client";

type RecordType = "Emergency" | "Corrective" | "Preventive";

interface HistoryRecord {
  id: number;
  date: string;
  machine: string;
  type: RecordType;
  downtime: string;
  cost: string;
  note: string;
  technician: string;
}

const records: HistoryRecord[] = [
  { id: 1, date: "2026-04-28", machine: "M-01", type: "Emergency",  downtime: "4.2 jam", cost: "Rp 8.500.000", note: "Bearing replacement",   technician: "Budi S." },
  { id: 2, date: "2026-04-22", machine: "M-02", type: "Corrective", downtime: "2.1 jam", cost: "Rp 3.200.000", note: "Vibration adjustment",   technician: "Andi R." },
  { id: 3, date: "2026-04-20", machine: "M-03", type: "Preventive", downtime: "1.0 jam", cost: "Rp 1.200.000", note: "Routine inspection",     technician: "Sari W." },
  { id: 4, date: "2026-04-15", machine: "M-01", type: "Preventive", downtime: "1.5 jam", cost: "Rp 1.800.000", note: "Lubrication & check",    technician: "Budi S." },
  { id: 5, date: "2026-04-10", machine: "M-01", type: "Emergency",  downtime: "5.3 jam", cost: "Rp 9.100.000", note: "Motor repair",           technician: "Andi R." },
  { id: 6, date: "2026-04-08", machine: "M-04", type: "Corrective", downtime: "3.0 jam", cost: "Rp 4.500.000", note: "Pressure valve fix",     technician: "Sari W." },
  { id: 7, date: "2026-04-05", machine: "M-02", type: "Preventive", downtime: "1.2 jam", cost: "Rp 1.500.000", note: "Belt inspection",        technician: "Budi S." },
  { id: 8, date: "2026-04-01", machine: "M-05", type: "Preventive", downtime: "1.0 jam", cost: "Rp 1.000.000", note: "Temperature calibration", technician: "Andi R." },
];

function TypeBadge({ type }: { type: RecordType }) {
  const styles = {
    Emergency:  "bg-red-500 text-white",
    Corrective: "bg-amber-400 text-amber-900",
    Preventive: "bg-green-500/80 text-white",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${styles[type]}`}>{type}</span>;
}

export default function HistoryPage() {
  const totalCost = records.reduce((acc, r) => {
    const num = parseInt(r.cost.replace(/[^0-9]/g, ""));
    return acc + num;
  }, 0);

  const emergency  = records.filter((r) => r.type === "Emergency").length;
  const preventive = records.filter((r) => r.type === "Preventive").length;

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium text-white mb-6">Maintenance History</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Records",   value: records.length,  sub: "Semua aktivitas",   color: "text-zinc-300" },
          { label: "Emergency",       value: emergency,        sub: "Perlu perhatian",   color: "text-red-400"  },
          { label: "Preventive",      value: preventive,       sub: "Terjadwal",          color: "text-green-400"},
        ].map((s) => (
          <div key={s.label} className="bg-[#18191c] border border-white/5 rounded-xl p-4">
            <p className="text-[11px] text-zinc-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-medium mb-1 ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-zinc-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Tanggal", "Mesin", "Tipe", "Downtime", "Biaya", "Catatan", "Teknisi"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-[12px] text-zinc-400">{r.date}</td>
                <td className="px-4 py-3 text-[12px] font-medium text-blue-400">{r.machine}</td>
                <td className="px-4 py-3"><TypeBadge type={r.type}/></td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{r.downtime}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{r.cost}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{r.note}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{r.technician}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td colSpan={4} className="px-4 py-3 text-[12px] font-medium text-zinc-400">Total Biaya</td>
              <td className="px-4 py-3 text-[12px] font-medium text-white">
                Rp {totalCost.toLocaleString("id-ID")}
              </td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}