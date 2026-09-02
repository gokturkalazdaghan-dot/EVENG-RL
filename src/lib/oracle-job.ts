import type { OracleKind, OracleLetter } from "./oracle";

export const ORACLE_WAIT_MS: Record<OracleKind, number> = {
  coffee: 3 * 60 * 1000,
  palm: 3 * 60 * 1000,
  dream: 1 * 60 * 1000,
};

export function waitMs(kind: OracleKind) {
  return ORACLE_WAIT_MS[kind] || ORACLE_WAIT_MS.coffee;
}
const KEY = "evengirl-oracle-job";

export type OracleJob = {
  id: string;
  kind: OracleKind;
  submittedAt: number;
  readyAt: number;
  status: "waiting" | "ready" | "failed";
  notified?: boolean;
  letter?: OracleLetter;
  spark?: { glow: string; tarot: string; meaning: string; coffee: string };
  error?: string;
};

export function loadOracleJob(): OracleJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as OracleJob;
    if (!job?.id || !job.readyAt) return null;
    return job;
  } catch {
    return null;
  }
}

export function saveOracleJob(job: OracleJob) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(job));
  } catch {
    /* quota */
  }
}

export function clearOracleJob() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function askOracleNotify() {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export function pingOracleReady(title: string, body: string) {
  if (typeof window === "undefined") return;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* webview */
  }
  window.dispatchEvent(new CustomEvent("even:oracle-ready"));
}

export function remainMs(job: OracleJob, now = Date.now()) {
  return Math.max(0, job.readyAt - now);
}

export function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
