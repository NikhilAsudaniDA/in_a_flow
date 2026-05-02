export type Signal = "Optimal" | "Underutilized" | "Overloaded"
export type EffortLevel = "Low effort" | "Medium effort" | "High effort" | "Very High" | "Need to scope" | string
export type TaskStatus = "working" | "overdue" | "blocked" | "unscoped"
export type CalendarEventType = string

export interface CalendarEvent {
  date: string
  type: CalendarEventType
  label?: string
}

export interface Task {
  gid: string
  name: string
  dueOn: string | null
  startOn: string | null
  effortName: string
  effortPoints: number
  statusGroup: string
  statusName: string
  client: string
  priorityRank: string | null
  clientPriority: string | null
}

export interface ChartDay {
  date: string
  points: number
  barColor: "light" | "moderate" | "heavy" | "overdue"
  isToday: boolean
  calendar: { type: string; color: string; capacity: number } | null
}

export interface Metrics {
  activeLoad: { tasks: number; points: number }
  overdue: { tasks: number; points: number }
  staleOverdue?: { tasks: number; points: number }
  unscoped: { tasks: number }
  blocked: { tasks: number }
  review: { tasks: number }
  loadRatio: { ratio: number; totalLoad?: number; triWeekCapacity?: number; avgThroughput: number; signal: Signal }
  window: { overdueStart?: string; activeStart?: string; activeEnd?: string; start?: string; end?: string }
}

export type AnalystPod = "pod-2" | "pod-3" | "shared"
export type AnalystStatus = "active" | "ramping" | "on-leave" | "offboarded"

export interface Analyst {
  id: string
  name: string
  initials: string
  role: string
  signal: Signal
  pod: AnalystPod
  status: AnalystStatus
  email: string
  clients: string[]
  metrics: Metrics
  throughput: { avgThroughput: number; weekDetails: any[] }
  chartData: {
    days: ChartDay[]
    backlog: { tasks: number; points: number }
  }
  tasks: {
    overdue: Task[]
    working: Task[]
    blocked: Task[]
    unscoped: Task[]
  }
  upcomingPTO: { date: string; type: string }[]
  calendarDays: Record<string, { type: string; capacity: number }>
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase();
}

function mapRawToAnalysts(data: Record<string, any>): Analyst[] {
  return Object.entries(data).map(([gid, d]: [string, any]) => ({
    id: gid,
    name: d.analyst,
    initials: getInitials(d.analyst),
    role: "Analyst",
    signal: d.metrics.loadRatio.signal as Signal,
    pod: (d.pod || "pod-3") as AnalystPod,
    status: (d.status || "active") as AnalystStatus,
    email: d.email || "",
    clients: d.clients || [],
    metrics: d.metrics,
    throughput: d.throughput,
    chartData: { days: d.chart.days, backlog: d.chart.backlog },
    tasks: d.taskList,
    upcomingPTO: d.upcomingPTO,
    calendarDays: d.calendarDays,
  }));
}

// Static data from build time (fallback)
export const analysts: Analyst[] = [];

// API data fetcher (for client-side refresh)
export async function fetchAnalystsFromAPI(): Promise<{ analysts: Analyst[]; syncedAt: string }> {
  const res = await fetch("/api/data");
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error || `Failed to load data (${res.status})`);
  }
  const json = await res.json();
  return {
    analysts: mapRawToAnalysts(json.data),
    syncedAt: json.syncedAt,
  };
}

// Trigger a sync and return fresh data
export async function triggerSync(): Promise<{ analysts: Analyst[]; syncedAt: string } | null> {
  try {
    const res = await fetch("/api/sync", {
      headers: { "x-manual-refresh": "true" },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Sync failed");
    }
    // After sync completes, fetch the fresh data
    return await fetchAnalystsFromAPI();
  } catch (error) {
    console.error("Sync error:", error);
    return null;
  }
}
