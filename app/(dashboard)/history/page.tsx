"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────
type RecordType = "Emergency" | "Corrective" | "Preventive";

interface HistoryRecord {
  id: number;
  date: string;
  machine: string;
  type: RecordType;
  downtime: number;
  cost: number;
  note: string;
  technician: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function TypeBadge({ type }: { type: RecordType }) {
  const styles = {
    Emergency:  "bg-red-500 text-white",
    Corrective: "bg-amber-400 text-amber-900",
    Preventive: "bg-green-500/80 text-white",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${styles[type]}`}>{type}</span>;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`}/>;
}

// ── Export CSV ─────────────────────────────────────────────────────────────
function exportToCSV(records: HistoryRecord[]) {
  const headers = ["Tanggal","Mesin","Tipe","Downtime (jam)","Biaya (Rp)","Catatan","Teknisi"];
  const rows = records.map(r => [
    r.date, r.machine, r.type,
    r.downtime.toString(),
    r.cost.toString(),
    `"${r.note}"`,
    r.technician,
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `maintenance_history_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Monthly Bar Chart ──────────────────────────────────────────────────────
function MonthlyChart({ records }: { records: HistoryRecord[] }) {
  const monthMap: Record<string, { Emergency: number; Corrective: number; Preventive: number }> = {};
  for (const r of records) {
    const m = new Date(r.date).toLocaleDateString("id-ID", { month: "short" });
    if (!monthMap[m]) monthMap[m] = { Emergency: 0, Corrective: 0, Preventive: 0 };
    monthMap[m][r.type]++;
  }

  const months  = Object.entries(monthMap).slice(-6);
  const maxVal  = Math.max(...months.map(([, v]) => v.Emergency + v.Corrective + v.Preventive), 1);
  const W = 300, H = 140, padL = 20, padB = 20, barW = 28, gap = 12;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, Math.round(maxVal/2), maxVal].map(v => (
        <g key={v}>
          <line x1={padL} y1={H - padB - (v/maxVal)*(H-padB-8)} x2={W} y2={H - padB - (v/maxVal)*(H-padB-8)} stroke="#ffffff08" strokeWidth="0.5"/>
          <text x={padL-2} y={H - padB - (v/maxVal)*(H-padB-8) + 3} textAnchor="end" fill="#555" fontSize="7">{v}</text>
        </g>
      ))}
      {months.map(([month, v], i) => {
        const x    = padL + i * (barW + gap) + gap;
        const total = v.Emergency + v.Corrective + v.Preventive;
        const hE   = (v.Emergency  / maxVal) * (H - padB - 8);
        const hC   = (v.Corrective / maxVal) * (H - padB - 8);
        const hP   = (v.Preventive / maxVal) * (H - padB - 8);
        const base = H - padB;
        return (
          <g key={month}>
            <rect x={x} y={base - hP}      width={barW} height={hP} fill="#22c55e" rx="2"/>
            <rect x={x} y={base - hP - hC} width={barW} height={hC} fill="#f59e0b" rx="2"/>
            <rect x={x} y={base - hP - hC - hE} width={barW} height={hE} fill="#ef4444" rx="2"/>
            <text x={x + barW/2} y={H - 6} textAnchor="middle" fill="#555" fontSize="8">{month}</text>
            {total > 0 && <text x={x + barW/2} y={base - hP - hC - hE - 3} textAnchor="middle" fill="#888" fontSize="7">{total}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut Chart ────────────────────────────────────────────────────────────
function DonutChart({ emergency, corrective, preventive }: { emergency: number; corrective: number; preventive: number }) {
  const total = emergency + corrective + preventive || 1;
  const r = 45, cx = 60, cy = 60;
  const circumference = 2 * Math.PI * r;

  const pE = emergency  / total;
  const pC = corrective / total;
  const pP = preventive / total;

  const dE = pE * circumference;
  const dC = pC * circumference;
  const dP = pP * circumference;

  const offsetE = 0;
  const offsetC = circumference - dE;
  const offsetP = circumference - dE - dC;

  return (
    <svg viewBox="0 0 120 120" className="w-32">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff08" strokeWidth="16"/>
      {pE > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth="16"
        strokeDasharray={`${dE} ${circumference - dE}`} strokeDashoffset={offsetE}
        transform={`rotate(-90 ${cx} ${cy})`}/>}
      {pC > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f59e0b" strokeWidth="16"
        strokeDasharray={`${dC} ${circumference - dC}`} strokeDashoffset={offsetC}
        transform={`rotate(-90 ${cx} ${cy})`}/>}
      {pP > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth="16"
        strokeDasharray={`${dP} ${circumference - dP}`} strokeDashoffset={offsetP}
        transform={`rotate(-90 ${cx} ${cy})`}/>}
      <text x={cx} y={cy+4} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="500">{total}</text>
    </svg>
  );
}

const PAGE_SIZE = 10;

// ── Page ───────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [records, setRecords]   = useState<HistoryRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filterType, setFilterType] = useState<"all" | RecordType>("all");
  const [page, setPage]         = useState(1);

  const fetchHistory = useCallback(async () => {
    try {
      setError(null);
      const { data, error: sErr } = await supabase
        .from("maintenance_logs")
        .select("*")
        .order("date", { ascending: false });

      if (sErr) throw new Error(`Supabase: ${sErr.message}`);

      const rows: HistoryRecord[] = (data ?? []).map((r, i) => ({
        id         : i + 1,
        date       : new Date(r.date).toLocaleDateString("id-ID"),
        machine    : r.machine_id,
        type       : r.maintenance_type as RecordType,
        downtime   : Number(r.downtime_hours) || 0,
        cost       : Number(r.cost_idr) || 0,
        note       : r.technician_notes ?? "-",
        technician : r.parts_replaced ?? "-",
      }));

      setRecords(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // ── Filter & Pagination ──
  const filtered = records.filter(r => {
    const matchSearch = search === "" ||
      r.machine.toLowerCase().includes(search.toLowerCase()) ||
      r.note.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || r.type === filterType;
    return matchSearch && matchType;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Stats ──
  const totalCost      = records.reduce((a, r) => a + r.cost, 0);
  const totalDowntime  = records.reduce((a, r) => a + r.downtime, 0);
  const emergencyCount = records.filter(r => r.type === "Emergency").length;
  const preventiveCount= records.filter(r => r.type === "Preventive").length;
  const correctiveCount= records.filter(r => r.type === "Corrective").length;
  const emergencyRate  = records.length > 0 ? Math.round((emergencyCount / records.length) * 100) : 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-white">Maintenance History</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">Data real dari Supabase</p>
        </div>
        <button
          onClick={() => exportToCSV(filtered)}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-[12px] font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <span>↓</span> Export Data
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {loading ? Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-24 rounded-xl"/>) : (
          <>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Total Maintenance</p>
              <p className="text-2xl font-medium text-white">{records.length}</p>
              <p className="text-[11px] text-zinc-600">Semua aktivitas</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Total Downtime</p>
              <p className="text-2xl font-medium text-white">{totalDowntime.toFixed(0)} jam</p>
              <p className="text-[11px] text-zinc-600">Akumulasi semua mesin</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Total Cost</p>
              <p className="text-2xl font-medium text-white">{fmt(totalCost)}</p>
              <p className="text-[11px] text-zinc-600">Semua tipe maintenance</p>
            </div>
            <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
              <p className="text-[11px] text-zinc-500 mb-1">Emergency Rate</p>
              <p className={`text-2xl font-medium ${emergencyRate > 20 ? "text-red-400" : "text-amber-400"}`}>{emergencyRate}%</p>
              <p className="text-[11px] text-zinc-600">{emergencyCount} dari {records.length} total</p>
            </div>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Monthly trend */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Monthly Maintenance Trend</p>
          {loading ? <Skeleton className="h-36"/> : <MonthlyChart records={records}/>}
          <div className="flex gap-4 mt-2">
            {[{label:"Emergency",color:"bg-red-500"},{label:"Corrective",color:"bg-amber-400"},{label:"Preventive",color:"bg-green-500"}].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`w-2 h-2 rounded-sm ${s.color}`}/>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Donut */}
        <div className="bg-[#18191c] border border-white/5 rounded-xl p-4">
          <p className="text-[13px] font-medium text-zinc-300 mb-4">Maintenance Types</p>
          {loading ? <Skeleton className="h-36"/> : (
            <div className="flex items-center gap-6">
              <DonutChart emergency={emergencyCount} corrective={correctiveCount} preventive={preventiveCount}/>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Emergency",  count: emergencyCount,  color: "text-red-400",   dot: "bg-red-500"   },
                  { label: "Corrective", count: correctiveCount, color: "text-amber-400", dot: "bg-amber-400" },
                  { label: "Preventive", count: preventiveCount, color: "text-green-400", dot: "bg-green-500" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`}/>
                    <span className="text-[12px] text-zinc-400">{s.label}</span>
                    <span className={`text-[12px] font-medium ml-auto ${s.color}`}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#18191c] border border-white/5 rounded-xl overflow-hidden">
        {/* Filter bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <p className="text-[13px] font-medium text-zinc-300">All Records</p>
          <div className="flex items-center gap-2">
            {/* Filter type */}
            <div className="flex gap-1">
              {(["all","Emergency","Corrective","Preventive"] as const).map(t => (
                <button key={t} onClick={() => { setFilterType(t); setPage(1); }}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    filterType === t ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"
                  }`}>
                  {t === "all" ? "Semua" : t}
                </button>
              ))}
            </div>
            {/* Search */}
            <input
              type="text"
              placeholder="Cari..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none w-32"
            />
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Tanggal","Mesin","Tipe","Downtime","Biaya","Catatan","Teknisi"].map(h => (
                <th key={h} className="text-left text-[11px] font-medium text-zinc-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({length:8}).map((_,i) => (
              <tr key={i} className="border-b border-white/5">
                {Array.from({length:7}).map((_,j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4"/></td>
                ))}
              </tr>
            )) : paginated.map(r => (
              <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-[12px] text-zinc-400">{r.date}</td>
                <td className="px-4 py-3 text-[12px] font-medium text-blue-400">{r.machine}</td>
                <td className="px-4 py-3"><TypeBadge type={r.type}/></td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{r.downtime.toFixed(1)} jam</td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">{fmt(r.cost)}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500 max-w-[200px] truncate">{r.note}</td>
                <td className="px-4 py-3 text-[12px] text-zinc-500">{r.technician}</td>
              </tr>
            ))}
          </tbody>
          {!loading && (
            <tfoot>
              <tr className="border-t border-white/10">
                <td colSpan={3} className="px-4 py-3 text-[12px] font-medium text-zinc-400">
                  Total ({filtered.length} records)
                </td>
                <td className="px-4 py-3 text-[12px] text-zinc-400">
                  {filtered.reduce((a,r) => a + r.downtime, 0).toFixed(1)} jam
                </td>
                <td className="px-4 py-3 text-[12px] font-medium text-white">
                  {fmt(filtered.reduce((a,r) => a + r.cost, 0))}
                </td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/5">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded border border-white/10 transition-colors">
              Previous
            </button>
            {Array.from({length: totalPages}).map((_, i) => (
              <button key={i} onClick={() => setPage(i+1)}
                className={`text-[11px] px-3 py-1.5 rounded border transition-colors ${
                  page === i+1 ? "bg-white/15 text-white border-white/20" : "text-zinc-400 hover:text-white border-white/10"
                }`}>
                {i+1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
              className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-30 px-3 py-1.5 rounded border border-white/10 transition-colors">
              Next
            </button>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-8 text-center text-[12px] text-zinc-500">Tidak ada data ditemukan</div>
        )}
      </div>
    </div>
  );
}