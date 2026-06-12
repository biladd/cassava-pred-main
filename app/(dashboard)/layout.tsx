"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const navItems = [
  {
    label: "Dashboard", href: "/",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    label: "Machines", href: "/machines",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3m-3.22-6.78-2.12 2.12M7.34 16.66l-2.12 2.12m0-12.9 2.12 2.12m9.32 9.32 2.12 2.12"/>
      </svg>
    ),
  },
  {
    label: "Alerts", href: "/alerts",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
  {
    label: "History", href: "/history",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    label: "Cost Analysis", href: "/cost-analysis",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    label: "AI Chat", href: "/chat",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

interface MachineStatus {
  id: string;
  status: "critical" | "warning" | "good";
}

function dotColor(status: string) {
  if (status === "critical") return "bg-red-500";
  if (status === "warning")  return "bg-amber-400";
  return "bg-green-500";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [machines, setMachines] = useState<MachineStatus[]>([]);

  const fetchMachineStatuses = useCallback(async () => {
    const { data } = await supabase
      .from("predictions")
      .select("machine_id, health_label, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (!data) return;

    const latest: Record<string, string> = {};
    for (const row of data) {
      if (!latest[row.machine_id]) {
        latest[row.machine_id] = row.health_label;
      }
    }

    const rows: MachineStatus[] = Object.entries(latest)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, label]) => ({
        id,
        status: label === "Critical" ? "critical" : label === "Warning" ? "warning" : "good",
      }));

    setMachines(rows);
  }, []);

  useEffect(() => {
    fetchMachineStatuses();

    const channel = supabase
      .channel("predictions-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "predictions" },
        () => {
          fetchMachineStatuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMachineStatuses]);

  return (
    <div className="flex h-screen bg-[#111214] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-44 min-w-[176px] bg-[#18191c] border-r border-white/5 flex flex-col py-5 shrink-0">
        <p className="text-[10px] font-medium tracking-widest text-zinc-500 px-4 mb-5">
          CASSAVA GROUP
        </p>

        <nav className="flex flex-col gap-0.5 px-2">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              }`}
            >
              <span className="flex items-center justify-center w-4 h-4 shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <p className="text-[10px] font-medium tracking-widest text-zinc-600 px-4 mt-6 mb-2">
          MACHINES
        </p>

        {/* Machine list — scrollable */}
        <div className="flex flex-col px-2 overflow-y-auto flex-1">
          {machines.length === 0 ? (
            // Skeleton loading
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5">
                <div className="w-10 h-3 bg-white/5 rounded animate-pulse"/>
                <div className="w-2 h-2 rounded-full bg-white/5 animate-pulse"/>
              </div>
            ))
            
          ) : (
            machines.map((m) => (
              <Link
                key={m.id}
                href={`/machines/${m.id}`}
                className={`flex items-center justify-between px-3 py-1.5 text-[12px] rounded-md transition-colors ${
                  pathname === `/machines/${m.id}`
                    ? "text-white bg-white/10"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                <span>{m.id}</span>
                <span className={`w-2 h-2 rounded-full ${dotColor(m.status)}`}/>
              </Link>
            ))
          )}
        </div>

        <div className="px-2 py-3 border-t border-white/5 mt-2 shrink-0">
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors w-full"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
        
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}