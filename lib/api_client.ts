// lib/api.ts — Wrapper untuk FastAPI backend

const API_URL = (process.env.NEXT_PUBLIC_RAILWAY_URL || "http://localhost:8000").replace(/\/$/, "");

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
export interface MachinePrediction {
  machine_id: string;
  timestamp: string;
  overall_health_score: number;
  task_A: {
    will_fail_within_7days: boolean;
    failure_probability: number;
    risk_level: "LOW" | "MEDIUM" | "HIGH";
  };
  task_B: {
    health_status: 0 | 1 | 2;
    health_label: "Healthy" | "Warning" | "Critical";
    probabilities: {
      Healthy: number;
      Warning: number;
      Critical: number;
    };
  };
  task_C: {
    rul_hours: number;
    rul_days: number;
    rul_capped: boolean;
  };
  anomaly: {
    score: number;
    is_anomaly: boolean;
  };
  recommendation: string;
}

export interface DashboardSummary {
  total_machines: number;
  critical_count: number;
  warning_count: number;
  will_fail_count: number;
  anomaly_count: number;
  avg_health_score: number;
  most_critical_machine: string;
  most_critical_score: number;
  updated_at: string;
  machines: MachinePrediction[];
  errors?: { machine_id: string; error: string }[];
}

export interface SensorInput {
  machine_id: string;
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  power_consumption: number;
  noise_level: number;
  humidity: number;
  operating_hours: number;
  threshold?: number;
}

// ────────────────────────────────────────────────────────────────
// API Functions
// ────────────────────────────────────────────────────────────────

/** Predict full untuk satu mesin dari data sensor manual. */
export async function predictFull(
  sensor: SensorInput
): Promise<MachinePrediction> {
  const res = await fetch(`${API_URL}/predict/full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sensor),
  });
  if (!res.ok) {
    throw new Error(`predictFull failed: ${res.status}`);
  }
  return res.json();
}

/** Auto-fetch dari Supabase & predict untuk satu mesin. */
export async function predictByMachineId(
  machineId: string
): Promise<MachinePrediction> {
  const res = await fetch(`${API_URL}/predict/${machineId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`predictByMachineId failed: ${res.status}`);
  }
  return res.json();
}

/** KPI summary semua mesin (untuk halaman dashboard utama). */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${API_URL}/dashboard/summary`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`fetchDashboardSummary failed: ${res.status}`);
  }
  return res.json();
}

/** Info model & threshold (untuk halaman About / Settings). */
export async function fetchModelInfo() {
  const res = await fetch(`${API_URL}/model/info`);
  if (!res.ok) throw new Error("fetchModelInfo failed");
  return res.json();
}

/** Health check sederhana. */
export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
