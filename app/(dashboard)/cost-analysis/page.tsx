"use client";

interface CostItem {
  machine: string;
  emergency: number;
  corrective: number;
  preventive: number;
  total: number;
  downtimeHours: number;
}

const costData: CostItem[] = [
  { machine: "M-01", emergency: 17600000, corrective: 3200000, preventive: 3300000, total: 24100000, downtimeHours: 11.0 },
  { machine: "M-02", emergency: 0,        corrective: 2800000, preventive: 2700000, total: 5500000,  downtimeHours: 3.3  },
  { machine: "M-03", emergency: 0,        corrective: 0,       preventive: 1200000, total: 1200000,  downtimeHours: 1.0  },
  { machine: "M-04", emergency: 0,        corrective: 4500000, preventive: 0,       total: 4500000,  downtimeHours: 3.0  },
  { machine: "M-05", emergency: 0,        corrective: 0,       preventive: 1000000, total: 1000000,  downtimeHours: 1.0  },
];

function fmt(n: number) {
  return "Rp " + (n / 1000000).toFixed(1) + " jt";
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }}/>
    </div>
  );
}

export default function CostAnalysisPage() {
  const totalEmergency  = costData.reduce((a, c) => a + c.emergency, 0);
  const totalCorrective = costData.reduce((a, c) => a + c.corrective, 0);
  const totalPreventive = costData.reduce((a, c) => a + c.preventive, 0);
  const grandTotal      = costData.reduce((a, c) => a + c.total, 0);
  const maxTotal        = Math.max(...costData.map((c) => c.total));

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium text-white mb-6">Cost Analysis</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Biaya",    value: fmt(grandTotal),      color: "text-white"      },
          { label: "Emergency",      value: fmt(totalEmergency),  color: "text-red-400"    },
          { label: "Corrective",     value: fmt(totalCorrective), color: "text-amber-400"  },
          { label: "Preventive",     value: fmt(totalPreventive), color: "text-green-400"  },
        ].map((s) => (
          <div key={s.label} className="bg-[#18191c] border border-white/5 rounded-xl p-4">
            <p className="text-[11px] text-zinc-500 mb-1">{s.label}</p>
            <p className={`text-xl font-medium ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Per machine */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl p-4 mb-4">
        <p className="text-[13px] font-medium text-zinc-300 mb-4">Biaya per Mesin</p>
        <div className="flex flex-col gap-4">
          {costData.map((c) => (
            <div key={c.machine}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[12px] font-medium text-zinc-300">{c.machine}</span>
                <span className="text-[12px] text-zinc-400">{fmt(c.total)}</span>
              </div>
              <Bar value={c.total} max={maxTotal} color={c.emergency > 0 ? "bg-red-500" : c.corrective > 0 ? "bg-amber-400" : "bg-green-500"}/>
              <div className="flex gap-3 mt-1">
                {c.emergency > 0  && <span className="text-[10px] text-red-400">Emergency: {fmt(c.emergency)}</span>}
                {c.corrective > 0 && <span className="text-[10px] text-amber-400">Corrective: {fmt(c.corrective)}</span>}
                {c.preventive > 0 && <span className="text-[10px] text-green-400">Preventive: {fmt(c.preventive)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Mesin", "Emergency", "Corrective", "Preventive", "Total", "Downtime"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {costData.map((c) => (
              <tr key={c.machine} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-[12px] font-medium text-blue-400">{c.machine}</td>
                <td className="px-4 py-3 text-[12px] text-red-400">{c.emergency > 0 ? fmt(c.emergency) : "-"}</td>
                <td className="px-4 py-3 text-[12px] text-amber-400">{c.corrective > 0 ? fmt(c.corrective) : "-"}</td>
                <td className="px-4 py-3 text-[12px] text-green-400">{c.preventive > 0 ? fmt(c.preventive) : "-"}</td>
                <td className="px-4 py-3 text-[12px] font-medium text-white">{fmt(c.total)}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{c.downtimeHours} jam</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td className="px-4 py-3 text-[12px] font-medium text-zinc-400">Total</td>
              <td className="px-4 py-3 text-[12px] text-red-400">{fmt(totalEmergency)}</td>
              <td className="px-4 py-3 text-[12px] text-amber-400">{fmt(totalCorrective)}</td>
              <td className="px-4 py-3 text-[12px] text-green-400">{fmt(totalPreventive)}</td>
              <td className="px-4 py-3 text-[12px] font-medium text-white">{fmt(grandTotal)}</td>
              <td className="px-4 py-3 text-[12px] text-zinc-400">
                {costData.reduce((a, c) => a + c.downtimeHours, 0).toFixed(1)} jam
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}