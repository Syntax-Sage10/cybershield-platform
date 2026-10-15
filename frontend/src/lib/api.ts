import type { Agent, ApiEvent, Job, JobKind } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  agents: () => request<Agent[]>("/api/agents"),
  jobs: () => request<Job[]>("/api/jobs"),
  events: (limit = 600) => request<ApiEvent[]>(`/api/events?limit=${limit}`),
  startJob: (agent_id: string, kind: JobKind, params: Record<string, unknown>) =>
    request<Job>("/api/jobs", { method: "POST", body: JSON.stringify({ agent_id, kind, params }) }),
  stopJob: (id: string) => request<{ ok: boolean }>(`/api/jobs/${id}/stop`, { method: "POST" }),
};
