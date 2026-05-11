"use client";

import React from "react";

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
  {
    id: 1,
    severity: "CRITICAL",
    machine: "M-01",
    message: "Health score turun drastis, RUL < 10 jam",
    time: "2 menit lalu",
    resolved: false,
  },
  {
    id: 2,
    severity: "WARNING",
    machine: "M-02",
    message: "Vibrasi melebihi batas normal",
    time: "15 menit lalu",
    resolved: false,
  },
  {
    id: 3,
    severity: "WARNING",
    machine: "M-05",
    message: "Suhu operasi mendekati batas maksimum",
    time: "1 jam lalu",
    resolved: false,
  },
  {
    id: 4,
    severity: "INFO",
    machine: "M-03",
    message: "Jadwal maintenance preventif dalam 2 hari",
    time: "3 jam lalu",
    resolved: false,
  },
  {
    id: 5,
    severity: "CRITICAL",
    machine: "M-01",
    message: "Bearing noise terdeteksi pada frekuensi tinggi",
    time: "5 jam lalu",
    resolved: true,
  },
  {
    id: 6,
    severity: "WARNING",
    machine: "M-04",
    message: "Pressure drop tidak normal",
    time: "1 hari lalu",
    resolved: true,
  },
];

function severityStyle(s: Severity) {
  if (s === "CRITICAL") {
    return {
      badge: "bg-red-500 text-white",
      stripe: "bg-red-500",
    };
  }

  if (s === "WARNING") {
    return {
      badge: "bg-yellow-400 text-black",
      stripe: "bg-yellow-400",
    };
  }

  return {
    badge: "bg-blue-500 text-white",
    stripe: "bg-blue-500",
  };
}

export default function AlertsPage() {
  const active = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);

  // =========================
  // EXPORT CSV
  // =========================
  const exportCSV = () => {
    const headers = [
      "ID",
      "Severity",
      "Machine",
      "Message",
      "Time",
      "Resolved",
    ];

    const rows = alerts.map((item) => [
      item.id,
      item.severity,
      item.machine,
      item.message,
      item.time,
      item.resolved ? "Yes" : "No",
    ]);

    const csvContent =
      headers.join(",") +
      "\n" +
      rows.map((row) => row.join(",")).join("\n");

    const encodedUri = encodeURI(
      "data:text/csv;charset=utf-8," + csvContent
    );

    const link = document.createElement("a");

    link.setAttribute("href", encodedUri);

    link.setAttribute("download", "alerts-report.csv");

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Alerts
          </h1>

          <p className="text-zinc-500 text-sm">
            {active.length} aktif · {resolved.length} resolved
          </p>
        </div>

        {/* EXPORT BUTTON */}
        <button
          onClick={exportCSV}
          className="
            px-4 py-2
            rounded-lg
            bg-cyan-500
            text-black
            text-sm
            font-medium
            hover:opacity-80
            active:scale-95
            transition
            cursor-pointer
          "
        >
          Export CSV
        </button>
      </div>

      {/* ACTIVE */}
      <h2 className="text-zinc-500 text-xs tracking-[3px] mb-3">
        ACTIVE
      </h2>

      <div className="bg-[#18191c] rounded-xl border border-white/5 overflow-hidden mb-6">
        {active.map((a, i) => {
          const s = severityStyle(a.severity);

          return (
            <div
              key={a.id}
              className={`
                flex items-start justify-between
                px-4 py-4
                ${
                  i !== active.length - 1
                    ? "border-b border-white/5"
                    : ""
                }
              `}
            >
              <div className="flex gap-3">
                {/* STRIPE */}
                <div
                  className={`w-1 rounded-full ${s.stripe}`}
                />

                {/* CONTENT */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`
                        text-[10px]
                        px-2 py-1
                        rounded
                        font-bold
                        ${s.badge}
                      `}
                    >
                      {a.severity}
                    </span>

                    <span className="text-xs text-zinc-400">
                      {a.machine}
                    </span>
                  </div>

                  <p className="text-sm text-zinc-300">
                    {a.message}
                  </p>
                </div>
              </div>

              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {a.time}
              </span>
            </div>
          );
        })}
      </div>

      {/* RESOLVED */}
      <h2 className="text-zinc-500 text-xs tracking-[3px] mb-3">
        RESOLVED
      </h2>

      <div className="bg-[#18191c] rounded-xl border border-white/5 overflow-hidden opacity-70">
        {resolved.map((a, i) => {
          const s = severityStyle(a.severity);

          return (
            <div
              key={a.id}
              className={`
                flex items-start justify-between
                px-4 py-4
                ${
                  i !== resolved.length - 1
                    ? "border-b border-white/5"
                    : ""
                }
              `}
            >
              <div className="flex gap-3">
                {/* STRIPE */}
                <div
                  className={`w-1 rounded-full ${s.stripe}`}
                />

                {/* CONTENT */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`
                        text-[10px]
                        px-2 py-1
                        rounded
                        font-bold
                        ${s.badge}
                      `}
                    >
                      {a.severity}
                    </span>

                    <span className="text-xs text-zinc-400">
                      {a.machine}
                    </span>

                    <span className="text-[10px] px-2 py-1 rounded border border-green-500/30 text-green-400">
                      Resolved
                    </span>
                  </div>

                  <p className="text-sm text-zinc-500">
                    {a.message}
                  </p>
                </div>
              </div>

              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {a.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}