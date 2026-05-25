"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const navItems = [
  { label: "Dashboard",    href: "/",             icon: "⊞" },
  { label: "Machines",     href: "/machines",     icon: "⚙" },
  { label: "Alerts",       href: "/alerts",       icon: "🔔" },
  { label: "History",      href: "/history",      icon: "🕐" },
  { label: "Cost Analysis",href: "/cost-analysis",icon: "$" },
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

  useEffect(() => {
    async function fetchMachineStatuses() {
      // Ambil prediksi terbaru per mesin dari Supabase
      const { data } = await supabase
        .from("predictions")
        .select("machine_id, health_label, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!data) return;

      // Ambil 1 prediksi terbaru per mesin
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
    }

    fetchMachineStatuses();
  }, []);

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
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <p className="text-[10px] font-medium tracking-widest text-zinc-600 px-4 mt-6 mb-2">
          MESIN
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
            <span className="text-base leading-none">↩</span>
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

