"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.NEXT_PUBLIC_GROQ_API_KEY ?? "";

// ── Types ──────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface MachineContext {
  id: string;
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  health_label: string;
  failure_probability: number;
  risk_level: string;
  recommendation: string;
}

interface CostContext {
  machine: string;
  emergency: number;
  corrective: number;
  preventive: number;
  total: number;
  downtimeHours: number;
  emergencyCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded ${className}`} />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} last day`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return "Rp " + (n / 1_000_000_000).toFixed(1) + "M";
  if (n >= 1_000_000)     return "Rp " + (n / 1_000_000).toFixed(1) + " jt";
  return "Rp " + n.toLocaleString("id-ID");
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages]              = useState<Message[]>([]);
  const [input, setInput]                    = useState("");
  const [loading, setLoading]                = useState(false);
  const [loadingContext, setLoadingContext]   = useState(true);
  const [loadingHistory, setLoadingHistory]  = useState(true);
  const [machineContext, setMachineContext]   = useState<MachineContext[]>([]);
  const [costContext, setCostContext]         = useState<CostContext[]>([]);
  const [sessions, setSessions]              = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [userId, setUserId]                  = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen]        = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Get current user ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // ── next js ngambil data ke supabase buat AI ──────────────────────────────────────
  useEffect(() => {
    async function fetchContext() {
      // Sensor readings
      const { data: sensors } = await supabase
        .from("sensor_readings")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(2000);

      // Predictions
      const { data: predictions } = await supabase
        .from("predictions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (sensors && predictions) {
        const latestSensor: Record<string, any> = {};
        for (const s of sensors) {
          if (!latestSensor[s.machine_id]) latestSensor[s.machine_id] = s;
        }
        const latestPred: Record<string, any> = {};
        for (const p of predictions) {
          if (!latestPred[p.machine_id]) latestPred[p.machine_id] = p;
        }
        setMachineContext(
          Object.keys(latestSensor).sort().map(id => ({
            id,
            temperature        : latestSensor[id]?.temperature ?? 0,
            vibration          : latestSensor[id]?.vibration ?? 0,
            pressure           : latestSensor[id]?.pressure ?? 0,
            rpm                : latestSensor[id]?.rpm ?? 0,
            health_label       : latestPred[id]?.health_label ?? "Unknown",
            failure_probability: latestPred[id]?.failure_probability ?? 0,
            risk_level         : latestPred[id]?.risk_level ?? "Unknown",
            recommendation     : latestPred[id]?.recommendation ?? "-",
          }))
        );
      }

      // Maintenance logs → cost analysis
      const { data: maintData } = await supabase
        .from("maintenance_logs")
        .select("*");

      if (maintData && maintData.length > 0) {
        const costMap: Record<string, CostContext> = {};
        for (const row of maintData) {
          const mid = row.machine_id;
          if (!costMap[mid]) {
            costMap[mid] = { machine: mid, emergency: 0, corrective: 0, preventive: 0, total: 0, downtimeHours: 0, emergencyCount: 0 };
          }
          const cost = Number(row.cost_idr) || 0;
          costMap[mid].total         += cost;
          costMap[mid].downtimeHours += Number(row.downtime_hours) || 0;
          if (row.maintenance_type === "Emergency")  { costMap[mid].emergency += cost; costMap[mid].emergencyCount++; }
          if (row.maintenance_type === "Corrective") costMap[mid].corrective += cost;
          if (row.maintenance_type === "Preventive") costMap[mid].preventive += cost;
        }
        // Simpan sorted by total DESC agar ranking sudah benar sejak awal
        setCostContext(
          Object.values(costMap).sort((a, b) => b.total - a.total)
        );
      }

      setLoadingContext(false);
    }
    fetchContext();
  }, []);

  // ── Fetch chat sessions ───────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setSessions(data ?? []);
    setLoadingHistory(false);
  }, [userId]);

  useEffect(() => {
    if (userId) fetchSessions();
  }, [userId, fetchSessions]);

  // ── Load session messages ─────────────────────────────────────────────
  async function loadSession(sessionId: string) {
    setActiveSessionId(sessionId);
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) ?? []);
  }

  // ── New chat ──────────────────────────────────────────────────────────
  function newChat() {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }

  // ── Delete session ────────────────────────────────────────────────────
  async function deleteSession(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    await supabase.from("chat_sessions").delete().eq("id", sessionId);
    if (activeSessionId === sessionId) newChat();
    fetchSessions();
  }

  // ── Auto scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── System Prompt ─────────────────────────────────────────────────────
  function buildSystemPrompt(): string {
    // Machine data — sorted by failure probability DESC
    const sortedByRisk = [...machineContext].sort(
      (a, b) => b.failure_probability - a.failure_probability
    );
    const machineList = sortedByRisk.map((m, idx) =>
      `- Rank#${idx + 1} ${m.id}: Temp=${m.temperature.toFixed(1)}°C, Vib=${m.vibration.toFixed(2)}, ` +
      `Press=${m.pressure.toFixed(1)}bar, RPM=${m.rpm}, Status=${m.health_label}, ` +
      `FailureProb=${(m.failure_probability * 100).toFixed(1)}%, Risk=${m.risk_level}, ` +
      `Rekomendasi="${m.recommendation}"`
    ).join("\n");

    // Cost data — already sorted by total DESC, add explicit rank
    const costList = costContext.length > 0
      ? costContext.map((c, idx) =>
          `- Rank#${idx + 1} ${c.machine}: Total=${fmtRp(c.total)}, ` +
          `Emergency=${fmtRp(c.emergency)} (${c.emergencyCount}x), ` +
          `Corrective=${fmtRp(c.corrective)}, Preventive=${fmtRp(c.preventive)}, ` +
          `Downtime=${c.downtimeHours.toFixed(1)} jam`
        ).join("\n")
      : "Tidak ada data.";

    // Summary
    const totalPreventive   = costContext.reduce((a, c) => a + c.preventive, 0);
    const grandTotal        = costContext.reduce((a, c) => a + c.total, 0);
    const totalDowntime     = costContext.reduce((a, c) => a + c.downtimeHours, 0);
    const totalEmergencies  = costContext.reduce((a, c) => a + c.emergencyCount, 0);
    const preventedFailures = Math.round(totalPreventive / 1_500_000 * 0.8);
    const totalSavings      = preventedFailures * 8_500_000;
    const roi               = totalPreventive > 0 ? Math.round((totalSavings / totalPreventive) * 100) : 0;

    const criticalList = machineContext
      .filter(m => m.health_label === "Critical")
      .map(m => m.id).join(", ") || "Tidak ada";

    const warningList = machineContext
      .filter(m => m.health_label === "Warning")
      .map(m => m.id).join(", ") || "Tidak ada";

    return `Kamu adalah asisten AI untuk sistem Predictive Maintenance industri milik Cassava Group.
Kamu memiliki akses ke data real-time sensor, prediksi model ML, dan data cost analysis untuk ${machineContext.length} mesin industri.

PENTING — CARA MEMBACA DATA:
- Data mesin diurutkan berdasarkan failure probability TERTINGGI ke terendah (Rank#1 = paling berisiko)
- Data cost diurutkan berdasarkan total biaya TERTINGGI ke terendah (Rank#1 = paling mahal)
- Selalu gunakan rank ini saat menjawab pertanyaan tentang ranking/urutan

MESIN KRITIS SAAT INI:
- Status Critical : ${criticalList}
- Status Warning  : ${warningList}

DATA SENSOR + PREDIKSI ML (urut: failure prob tertinggi → terendah):
${machineList}

DATA COST ANALYSIS (urut: biaya tertinggi → terendah):
${costList}

RINGKASAN FINANSIAL:
- Grand Total Biaya : ${fmtRp(grandTotal)}
- Total Downtime    : ${totalDowntime.toFixed(1)} jam
- Total Emergency   : ${totalEmergencies} kejadian
- Estimated Savings : ${fmtRp(totalSavings)}
- ROI               : ${roi}%
- Failures Prevented: ${preventedFailures} (estimasi)

PANDUAN MENJAWAB:
- Jawab dalam Bahasa Indonesia, singkat dan to the point
- Untuk pertanyaan ranking/urutan, gunakan rank yang sudah ada di data
- Untuk pertanyaan biaya, gunakan DATA COST ANALYSIS
- Untuk pertanyaan kondisi/status, gunakan DATA SENSOR + PREDIKSI ML
- Tekankan urgensi jika failure probability > 50% atau emergency cost sangat tinggi
- Jika ditanya mesin tertentu, fokus ke data mesin itu saja`;
  }

  // ── Send Message ──────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading || !userId) return;

    const userText    = input.trim();
    const userMessage: Message = { role: "user", content: userText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Buat session baru jika belum ada
    let sessionId = activeSessionId;
    if (!sessionId) {
      const title = userText.length > 50 ? userText.slice(0, 50) + "…" : userText;
      const { data: newSession } = await supabase
        .from("chat_sessions")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      sessionId = newSession?.id ?? null;
      if (sessionId) {
        setActiveSessionId(sessionId);
        fetchSessions();
      }
    }

    // Simpan pesan user
    if (sessionId) {
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role      : "user",
        content   : userText,
      });
    }

    try {
      const response = await fetch(GROQ_API_URL, {
        method : "POST",
        headers: {
          "Content-Type" : "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model      : "llama-3.3-70b-versatile",
          messages   : [
            { role: "system", content: buildSystemPrompt() },
            ...newMessages,
          ],
          temperature: 0.3,
          max_tokens : 1024,
        }),
      });

      if (!response.ok) throw new Error(`Groq error ${response.status}`);

      const data             = await response.json();
      const assistantContent = data.choices[0].message.content;
      setMessages(prev => [...prev, { role: "assistant", content: assistantContent }]);

      // Simpan balasan AI
      if (sessionId) {
        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          role      : "assistant",
          content   : assistantContent,
        });
      }
    } catch {
      const errMsg = "❌ Gagal terhubung ke AI. Pastikan GROQ_API_KEY sudah benar di .env.local.";
      setMessages(prev => [...prev, { role: "assistant", content: errMsg }]);
      if (sessionId) {
        await supabase.from("chat_messages").insert({
          session_id: sessionId,
          role      : "assistant",
          content   : errMsg,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const criticalMachines = machineContext.filter(m => m.health_label === "Critical");
  const warningMachines  = machineContext.filter(m => m.health_label === "Warning");

  const suggestedQuestions = [
    "Which machines are most at risk of failure?",
    "Which machine has the highest maintenance costs?",
    "What is the total ROI of predictive maintenance?",
    "Which machines need immediate attention?",
    "What is the total downtime of all machines?",
    "Which machine is the safest to operate?",
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── History Sidebar ─────────────────────────────────────────── */}
      <div className={`${sidebarOpen ? "w-56" : "w-0"} transition-all duration-200 overflow-hidden shrink-0 border-r border-white/5 bg-[#111214] flex flex-col`}>
        <div className="p-3 border-b border-white/5 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-medium text-zinc-500 tracking-wider">CHAT HISTORY</span>
          <button
            onClick={newChat}
            className="text-[10px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white px-2 py-1 rounded-md transition-colors"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loadingHistory ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg mb-1" />
            ))
          ) : sessions.length === 0 ? (
            <p className="text-[11px] text-zinc-600 text-center mt-6 px-3">
              Belum ada riwayat chat
            </p>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`group flex items-start justify-between gap-1 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  activeSessionId === s.id
                    ? "bg-white/10 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate leading-tight">{s.title}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{formatDate(s.created_at)}</p>
                </div>
                <button
                  onClick={e => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-[12px] mt-0.5 shrink-0"
                  title="Hapus"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main Chat Area ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden p-6 pb-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="text-zinc-500 hover:text-white transition-colors text-[14px] p-1 rounded-md hover:bg-white/5"
              title="Toggle history"
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <div>
              <h1 className="text-lg font-medium text-white">AI Assistant — Llama 3.3</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!loadingContext && (
              <>
                {criticalMachines.length > 0 && (
                  <span className="text-[11px] bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full">
                    {criticalMachines.length} Critical
                  </span>
                )}
                {warningMachines.length > 0 && (
                  <span className="text-[11px] bg-amber-400/20 text-amber-400 border border-amber-400/30 px-2.5 py-1 rounded-full">
                    {warningMachines.length} Warning
                  </span>
                )}
                <span className="text-[11px] text-zinc-500">{machineContext.length} machines</span>
              </>
            )}
          </div>
        </div>

        {/* Suggested questions */}
        {messages.length === 0 && !loadingContext && (
          <div className="mb-4 shrink-0">
            <p className="text-[11px] text-zinc-600 mb-2">example questions
</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1">
          {loadingContext ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-[14px] text-zinc-400 font-medium mb-1">AI Maintenance Assistant</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-white/10 text-white rounded-br-sm"
                    : "bg-[#18191c] border border-white/5 text-zinc-300 rounded-bl-sm"
                }`}>
                  {m.role === "assistant" && (
                    <p className="text-[10px] text-zinc-500 mb-1.5 font-medium">🤖 AI Assistant</p>
                  )}
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#18191c] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-[10px] text-zinc-500 mb-1.5 font-medium">🤖 AI Assistant</p>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 pb-6">
          <div className="flex gap-2 bg-[#18191c] border border-white/10 rounded-2xl p-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ask something..."
              rows={1}
              disabled={loading || loadingContext}
              className="flex-1 bg-transparent text-[13px] text-white placeholder-zinc-600 outline-none resize-none px-2 py-1.5 max-h-32"
            />
            <button
              onClick={sendMessage}
              disabled={loading || loadingContext || !input.trim()}
              className="bg-green-500 hover:bg-green-400 disabled:bg-white/10 disabled:text-zinc-600 text-white px-4 py-2 rounded-xl text-[12px] font-medium transition-colors shrink-0"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}