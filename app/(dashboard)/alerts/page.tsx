"use client";

type Severity = "CRITICAL" | "WARNING" | "INFO";

interface Alert {
  id: number;
  severity: Severity;
  machine: string;
  message: string;
  time: string;
  resolved: boolean;
}

const alerts: Alert[] = [
  { id: 1, severity: "CRITICAL", machine: "M-01", message: "Health score turun drastis, RUL < 10 jam",   time: "2 menit lalu",  resolved: false },
  { id: 2, severity: "WARNING",  machine: "M-02", message: "Vibrasi melebihi batas normal",              time: "15 menit lalu", resolved: false },
  { id: 3, severity: "WARNING",  machine: "M-05", message: "Suhu operasi mendekati batas maksimum",      time: "1 jam lalu",    resolved: false },
  { id: 4, severity: "INFO",     machine: "M-03", message: "Jadwal maintenance preventif dalam 2 hari",  time: "3 jam lalu",    resolved: false },
  { id: 5, severity: "CRITICAL", machine: "M-01", message: "Bearing noise terdeteksi pada frekuensi tinggi", time: "5 jam lalu", resolved: true  },
  { id: 6, severity: "WARNING",  machine: "M-04", message: "Pressure drop tidak normal",                 time: "1 hari lalu",   resolved: true  },
];

function severityStyle(s: Severity) {
  if (s === "CRITICAL") return { badge: "bg-red-500 text-white",    stripe: "bg-red-500",    ring: "border-red-500/20"   };
  if (s === "WARNING")  return { badge: "bg-amber-400 text-amber-900", stripe: "bg-amber-400", ring: "border-amber-400/20" };
  return                       { badge: "bg-blue-500 text-white",   stripe: "bg-blue-500",   ring: "border-blue-500/20"  };
}

export default function AlertsPage() {
  const active   = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) =>  a.resolved);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Alerts</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">{active.length} aktif · {resolved.length} resolved</p>
        </div>
        <span className="bg-amber-400 text-amber-900 text-[11px] font-semibold px-3 py-1.5 rounded-full">
          {active.length} alert aktif
        </span>
      </div>

      {/* Active */}
      <p className="text-[11px] font-medium text-zinc-500 mb-3 tracking-widest">AKTIF</p>
      <div className="bg-[#18191c] border border-white/5 rounded-xl mb-5">
        {active.map((a, i) => {
          const s = severityStyle(a.severity);
          return (
            <div key={a.id} className={`flex items-start justify-between px-4 py-4 ${i < active.length - 1 ? "border-b border-white/5" : ""}`}>
              <div className="flex items-start gap-3">
                <div className={`w-[3px] h-10 rounded-full shrink-0 mt-0.5 ${s.stripe}`}/>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.badge}`}>{a.severity}</span>
                    <span className="text-[11px] text-zinc-400">{a.machine}</span>
                  </div>
                  <p className="text-[12px] text-zinc-400">{a.message}</p>
                </div>
              </div>
              <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 pt-0.5">{a.time}</span>
            </div>
          );
        })}
      </div>

      {/* Resolved */}
      <p className="text-[11px] font-medium text-zinc-500 mb-3 tracking-widest">RESOLVED</p>
      <div className="bg-[#18191c] border border-white/5 rounded-xl opacity-60">
        {resolved.map((a, i) => {
          const s = severityStyle(a.severity);
          return (
            <div key={a.id} className={`flex items-start justify-between px-4 py-4 ${i < resolved.length - 1 ? "border-b border-white/5" : ""}`}>
              <div className="flex items-start gap-3">
                <div className={`w-[3px] h-10 rounded-full shrink-0 mt-0.5 ${s.stripe}`}/>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.badge}`}>{a.severity}</span>
                    <span className="text-[11px] text-zinc-400">{a.machine}</span>
                    <span className="text-[10px] text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded">Resolved</span>
                  </div>
                  <p className="text-[12px] text-zinc-500">{a.message}</p>
                </div>
              </div>
              <span className="text-[11px] text-zinc-600 whitespace-nowrap ml-4 pt-0.5">{a.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}