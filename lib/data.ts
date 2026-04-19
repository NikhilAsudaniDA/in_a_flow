import rawData from './inaflow_output.json';

export type Signal = "Optimal" | "Underutilized" | "Overloaded"
export type EffortLevel = "Low effort" | "Medium effort" | "High effort" | "Need to scope" | string
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
  effortName: string
  effortPoints: number
  statusGroup: string
  client: string
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
  unscoped: { tasks: number }
  blocked: { tasks: number }
  review: { tasks: number }
  loadRatio: { ratio: number; avgThroughput: number; signal: Signal }
  window: { start: string; end: string }
}

export interface Analyst {
  id: string
  name: string
  initials: string
  role: string
  signal: Signal
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

export const analysts: Analyst[] = Object.entries(rawData).map(([gid, data]: [string, any]) => ({
  id: gid,
  name: data.analyst,
  initials: getInitials(data.analyst),
  role: "Analyst",
  signal: data.metrics.loadRatio.signal as Signal,
  metrics: data.metrics,
  throughput: data.throughput,
  chartData: {
    days: data.chart.days,
    backlog: data.chart.backlog,
  },
  tasks: data.taskList,
  upcomingPTO: data.upcomingPTO,
  calendarDays: data.calendarDays,
}));
