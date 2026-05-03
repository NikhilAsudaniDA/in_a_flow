"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, RefreshCw, ChevronDown, UserPlus, LogOut, X, Check, MoreHorizontal, LayoutGrid } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  analysts as staticAnalysts,
  fetchAnalystsFromAPI,
  triggerSync,
  type Analyst,
  type AnalystPod,
  type AnalystStatus,
  type Signal,
  type Task,
} from "@/lib/data"
import { cn } from "@/lib/utils"

// ─── Signal / effort / chart color helpers ─────────────────────────────────

function getSignalColor(signal: Signal) {
  switch (signal) {
    case "Optimal":
      return { dot: "bg-[#639922]", avatar: "bg-[#EAF3DE] text-[#27500A]", badge: "bg-[#EAF3DE] text-[#27500A]" }
    case "Underutilized":
      return { dot: "bg-[#EF9F27]", avatar: "bg-[#FAEEDA] text-[#633806]", badge: "bg-[#FAEEDA] text-[#633806]" }
    case "Overloaded":
      return { dot: "bg-[#E24B4A]", avatar: "bg-[#FCEBEB] text-[#791F1F]", badge: "bg-[#FCEBEB] text-[#791F1F]" }
    default:
      return { dot: "bg-muted", avatar: "bg-muted text-muted-foreground", badge: "bg-muted text-muted-foreground" }
  }
}

function getEffortColor(effort: string) {
  const e = effort.toLowerCase()
  if (e.includes("low")) return "bg-[#EAF3DE] text-[#27500A]"
  if (e.includes("medium")) return "bg-[#FAEEDA] text-[#633806]"
  if (e.includes("high") && !e.includes("very")) return "bg-[#FCEBEB] text-[#791F1F]"
  if (e.includes("very high")) return "bg-[#F7C1C1] text-[#791F1F]"
  return "bg-muted text-muted-foreground"
}

function getRatioColor(ratio: number) {
  if (ratio < 0.6) return "text-[#639922]"
  if (ratio <= 1.1) return "text-[#EF9F27]"
  return "text-[#E24B4A]"
}

function getStubColor(eventType: string | null): { fill: string; border: string } {
  if (!eventType) return { fill: "transparent", border: "#D3D1C7" }
  const type = eventType.toLowerCase()
  if (type.includes("pto") || type.includes("vto"))             return { fill: "#AFA9EC", border: "#AFA9EC" }
  if (type.includes("holiday") || type.includes("floater"))     return { fill: "#FAC775", border: "#FAC775" }
  if (type.includes("birthday"))                                 return { fill: "#ED93B1", border: "#ED93B1" }
  if (type.includes("event"))                                    return { fill: "#ED93B1", border: "#ED93B1" }
  if (type.includes("anniversary"))                              return { fill: "#85B7EB", border: "#85B7EB" }
  if (type.includes("appointment") || type.includes("qbr") || type.includes("qr")) return { fill: "#97C459", border: "#97C459" }
  return { fill: "transparent", border: "#D3D1C7" }
}

function getWorkloadColor(value: number, isPast: boolean) {
  if (isPast) return "#F09595"
  if (value >= 8) return "#991B1B"
  if (value >= 6) return "#E24B4A"
  if (value >= 3) return "#EF9F27"
  return "#B4B2A9"
}



// ─── KPI card components ────────────────────────────────────────────────────

function DualMetricCard({
  label, leftValue, leftUnit, rightValue, rightUnit, subtitle, valueClassName, accentBorder,
}: {
  label: string; leftValue: number; leftUnit: string; rightValue: number; rightUnit: string
  subtitle: string; valueClassName?: string; accentBorder?: "red" | "amber" | "gray"
}) {
  return (
    <div className={cn("bg-secondary p-3.5",
      accentBorder === "red" && "border-l-[3px] border-l-[#E24B4A] rounded-r-lg",
      accentBorder === "amber" && "border-l-[3px] border-l-[#EF9F27] rounded-r-lg",
      accentBorder === "gray" && "border-l-[3px] border-l-[#B4B2A9] rounded-r-lg",
      !accentBorder && "rounded-lg"
    )}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-3">
        <div className="flex items-baseline gap-1">
          <span className={cn("text-xl font-medium leading-none", valueClassName)}>{leftValue}</span>
          <span className="text-[13px] text-muted-foreground">{leftUnit}</span>
        </div>
        <span className="w-px h-4 bg-border self-center" />
        <div className="flex items-baseline gap-1">
          <span className={cn("text-xl font-medium leading-none", valueClassName)}>{rightValue}</span>
          <span className="text-[13px] text-muted-foreground">{rightUnit}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{subtitle}</p>
    </div>
  )
}

function MetricCard({
  label, value, unit, subtitle, valueClassName, accentBorder,
}: {
  label: string; value: string | number; unit: string; subtitle: string
  valueClassName?: string; accentBorder?: "red" | "amber" | "gray"
}) {
  return (
    <div className={cn("bg-secondary p-3.5",
      accentBorder === "red" && "border-l-[3px] border-l-[#E24B4A] rounded-r-lg",
      accentBorder === "amber" && "border-l-[3px] border-l-[#EF9F27] rounded-r-lg",
      accentBorder === "gray" && "border-l-[3px] border-l-[#B4B2A9] rounded-r-lg",
      !accentBorder && "rounded-lg"
    )}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-xl font-medium leading-none", valueClassName)}>{value}</span>
        <span className="text-[13px] text-muted-foreground">{unit}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{subtitle}</p>
    </div>
  )
}

// ─── Chart tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0].payload
  const hasEvent = data.eventType !== null
  const hasWorkload = data.workload > 0
  let conflictNote = ""
  if (hasWorkload && data.isPTODay) conflictNote = " (conflict — analyst is off)"
  else if (hasWorkload && data.isAppointmentDay) conflictNote = " (half-day out)"
  return (
    <div className="bg-popover border border-border rounded-md px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{data.dateLabel}</p>
      {hasEvent && <p className="text-muted-foreground">{data.eventType}</p>}
      {hasWorkload && <p className="text-muted-foreground">{data.workload.toFixed(1)} pts{conflictNote}</p>}
      {!hasEvent && !hasWorkload && <p className="text-muted-foreground">No tasks, no events</p>}
    </div>
  )
}

// ─── Daily load chart ───────────────────────────────────────────────────────

function DailyLoadChart({ analyst }: { analyst: Analyst }) {
  const chartData = useMemo(() => {
    const localToday = new Date()
    const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`
    const dueCountByDate: Record<string, number> = {}
    const allWorkingTasks = [
      ...(analyst.tasks.overdue || []),
      ...(analyst.tasks.working || []),
      ...(analyst.tasks.unscoped || []),
    ]
    for (const t of allWorkingTasks) {
      if (t.dueOn) dueCountByDate[t.dueOn] = (dueCountByDate[t.dueOn] || 0) + 1
    }
    return analyst.chartData.days.map((day) => {
      const isPast = day.date < todayStr
      const isToday = day.date === todayStr || day.isToday
      const eventType = day.calendar?.type || null
      const stubColors = getStubColor(eventType)
      const d = new Date(day.date)
      const isZeroCapacity = day.calendar?.capacity === 0
      const tasksDueOnDay = dueCountByDate[day.date] || 0
      return {
        dateLabel: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
        dateRaw: day.date,
        stub: 5,
        workload: day.points > 0 ? day.points : 0,
        isToday, isPast, eventType,
        stubFill: stubColors.fill,
        stubBorder: stubColors.border,
        isPTODay: eventType?.toLowerCase() === "pto" || eventType?.toLowerCase() === "vto",
        isAppointmentDay: eventType?.toLowerCase() === "appointment",
        isZeroCapacity, tasksDueOnDay,
        showPTOWarning: isZeroCapacity && tasksDueOnDay > 0,
      }
    })
  }, [analyst])

  const backlog = analyst.chartData.backlog
  const todayItem = chartData.find((d) => d.isToday)

  return (
    <div className="mb-8">
      <h3 className="text-[13px] text-muted-foreground uppercase tracking-wider mb-4 font-medium">
        Daily load — 30-day window
      </h3>
      {/* Main workload chart — no X-axis, Y-axis on left */}
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }} barGap={0} barCategoryGap="10%">
            <XAxis dataKey="dateLabel" hide height={0} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${v}`} width={45} domain={[0, 24]} ticks={[0, 4, 8, 12, 16, 20, 24]} />
            <Tooltip content={<ChartTooltip />} cursor={true} />
            {chartData.map((d) =>
              new Date(d.dateRaw).getUTCDay() === 1 ? (
                <ReferenceLine key={`div-${d.dateRaw}`} x={d.dateLabel} stroke="var(--border)" strokeOpacity={0.8} />
              ) : null
            )}
            {todayItem && (
              <ReferenceLine x={todayItem.dateLabel} stroke="var(--muted-foreground)" strokeDasharray="3 3"
                label={{ value: "Today", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />
            )}
            {chartData.map((d) =>
              d.showPTOWarning ? (
                <ReferenceLine key={`pto-warn-${d.dateRaw}`} x={d.dateLabel} stroke="#E24B4A" strokeWidth={1.5}
                  label={{ value: `${d.tasksDueOnDay} task${d.tasksDueOnDay === 1 ? "" : "s"} due`, position: "top", fontSize: 10, fill: "#E24B4A" }} />
              ) : null
            )}
            <Bar dataKey="workload" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`workload-${index}`} fill={entry.workload > 0 ? getWorkloadColor(entry.workload, entry.isPast) : "transparent"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Event stub chart — no Y-axis (hidden placeholder keeps column alignment), X-axis with day labels */}
      <div className="h-[70px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 2, right: 10, left: 45, bottom: 0 }} barGap={0} barCategoryGap="10%">
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={50} />
            <YAxis width={45} hide />
            <Tooltip content={<ChartTooltip />} cursor={false} />
            <Bar dataKey="stub" radius={[2, 2, 2, 2]}>
              {chartData.map((entry, index) => (
                <Cell key={`stub-${index}`} fill={entry.stubFill} stroke={entry.stubBorder} strokeWidth={1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#991B1B]" /><span>Very Heavy (8+)</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#E24B4A]" /><span>Heavy (6-8)</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#EF9F27]" /><span>Moderate (3-6)</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#B4B2A9]" /><span>Light (0-3)</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#F09595]" /><span>Overdue</span></div>
        <span className="w-px h-3 bg-border mx-1" />
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#AFA9EC]" /><span>PTO</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#FAC775]" /><span>Holiday</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#ED93B1]" /><span>Birthday</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#97C459]" /><span>Appt/QBR</span></div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#85B7EB]" /><span>Anniversary</span></div>
      </div>
      {backlog && backlog.tasks > 0 && (
        <p className="text-[11px] text-muted-foreground/70 italic mt-2">
          + {backlog.tasks} tasks overdue beyond 15 days ({backlog.points} pts not shown)
        </p>
      )}
    </div>
  )
}

// ─── Task table ─────────────────────────────────────────────────────────────

function formatLocalDateLabel(s: string) {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatTaskDateRange(startOn: string | null, dueOn: string | null) {
  if (!dueOn) return "—"
  const dueLabel = formatLocalDateLabel(dueOn)
  if (!startOn) return dueLabel
  return `${formatLocalDateLabel(startOn)} – ${dueLabel}`
}

const PRIORITY_ORDER = ["1","2","3","4","5","6","7","8","9","10","Flexible","Internal","Not Urgent"]
function getPrioritySortIndex(value: string | null) {
  if (!value) return PRIORITY_ORDER.length
  const index = PRIORITY_ORDER.indexOf(value)
  return index === -1 ? PRIORITY_ORDER.length : index
}
function sortByPriorityRank(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const diff = getPrioritySortIndex(a.priorityRank) - getPrioritySortIndex(b.priorityRank)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}

const TASK_TABLE_COLUMNS: { key: string; width: string }[] = [
  { key: "num", width: "4%" }, { key: "name", width: "32%" }, { key: "client", width: "11%" },
  { key: "priorityRank", width: "11%" }, { key: "clientPriority", width: "11%" },
  { key: "effort", width: "8%" }, { key: "dates", width: "12%" }, { key: "status", width: "11%" },
]

function TaskTableColgroup() {
  return (
    <colgroup>
      {TASK_TABLE_COLUMNS.map((col) => <col key={col.key} style={{ width: col.width }} />)}
    </colgroup>
  )
}

function TaskList({ tasks }: { tasks: Analyst["tasks"] }) {
  const [collapsedSections, setCollapsedSections] = useState({ Overdue: false, Active: false, Blocked: false })
  const overdueTasks = sortByPriorityRank(tasks.overdue || [])
  const activeTasks = sortByPriorityRank([...(tasks.working || []), ...(tasks.unscoped || [])])
  const blockedTasks = sortByPriorityRank(tasks.blocked || [])
  const toggleSection = (section: keyof typeof collapsedSections) =>
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }))

  const renderRows = (items: Task[]) =>
    items.map((task, index) => (
      <tr key={task.gid} className="border-b border-border last:border-b-0">
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap">{index + 1}</td>
        <td className="px-3 py-3 text-[13px] text-foreground truncate whitespace-nowrap" title={task.name}>{task.name}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.client}>{task.client}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.priorityRank || "—"}>{task.priorityRank || "—"}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.clientPriority || "—"}>{task.clientPriority || "—"}</td>
        <td className="px-3 py-3 text-[13px] text-foreground truncate whitespace-nowrap">
          <span className={cn("inline-flex rounded-full px-2 py-1 text-[11px] font-medium", getEffortColor(task.effortName))}>
            {task.effortName.replace(/ effort$/i, "")}
          </span>
        </td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={formatTaskDateRange(task.startOn, task.dueOn)}>{formatTaskDateRange(task.startOn, task.dueOn)}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.statusName}>{task.statusName}</td>
      </tr>
    ))

  const renderSection = (
    title: keyof typeof collapsedSections,
    items: Task[],
    accent: string,
    emptyMessage: string
  ) => {
    const collapsed = collapsedSections[title]
    return (
      <section className={cn("rounded-2xl border p-4", accent)}>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => toggleSection(title)}
            className="w-full flex items-center justify-between gap-3 text-left">
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] uppercase tracking-wider font-medium">{title}</span>
              <span className="text-[11px] text-muted-foreground">{items.length} tasks</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200",
              collapsed ? "-rotate-90" : "rotate-0")} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
        ) : (
          !collapsed && (
            <div>
              <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                <TaskTableColgroup />
                <thead className="bg-background/80 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">#</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Task Name</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Client</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Priority Rank</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Client Priority</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Effort</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Dates</th>
                    <th className="px-3 py-2 text-left truncate whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>{renderRows(items)}</tbody>
              </table>
            </div>
          )
        )}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {renderSection("Overdue", overdueTasks, "border border-[#F5D3D3] bg-[#FEF1F1]", "No overdue working tasks in the last 15 working days.")}
      {renderSection("Active", activeTasks, "border border-border bg-secondary", "No active working tasks in the next 15 working days.")}
      {renderSection("Blocked", blockedTasks, "border border-border bg-muted/10", "No blocked tasks.")}
    </div>
  )
}

// ─── Analyst detail panel ───────────────────────────────────────────────────

function AnalystDetail({ analyst, loadError, isLoadingData }: {
  analyst?: Analyst; loadError: string | null; isLoadingData: boolean
}) {
  if (isLoadingData) {
    return <main className="flex-1 bg-background flex items-center justify-center text-muted-foreground">Processing Data…</main>
  }
  if (loadError) {
    return (
      <main className="flex-1 bg-background flex items-center justify-center px-6">
        <div className="rounded-2xl border border-[#D0D5DD] bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-2">No data available</h2>
          <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
          <p className="text-sm text-muted-foreground">Click Refresh to retry the sync from Asana.</p>
        </div>
      </main>
    )
  }
  if (!analyst) return <main className="flex-1 bg-background flex items-center justify-center text-muted-foreground">Select an analyst</main>

  const colors = getSignalColor(analyst.signal)
  const { metrics } = analyst
  return (
    <main className="flex-1 bg-background overflow-y-scroll">
      <div className="p-6 px-7">
        <div className="flex items-center gap-4 mb-8">
          <span className={cn("w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-medium flex-shrink-0", colors.avatar)}>
            {analyst.initials}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-foreground">{analyst.name}</h2>
            <p className="text-[13px] text-muted-foreground">{analyst.role}</p>
          </div>
          <span className={cn("text-sm font-semibold px-4 py-2 rounded-full flex-shrink-0", colors.badge)}>
            {analyst.signal}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-8">
          <DualMetricCard label="Active load" leftValue={metrics.activeLoad.tasks} leftUnit="tasks"
            rightValue={metrics.activeLoad.points} rightUnit="pts" subtitle="due in next 15 working days" />
          <DualMetricCard label="Overdue" leftValue={metrics.overdue.tasks} leftUnit="tasks"
            rightValue={metrics.overdue.points} rightUnit="pts"
            subtitle={metrics.overdue.tasks > 0 ? "past due, still in progress" : "all caught up"}
            valueClassName={metrics.overdue.tasks > 0 ? "text-[#A32D2D]" : "text-[#27500A]"}
            accentBorder={metrics.overdue.tasks > 0 ? "red" : undefined} />
          <MetricCard label="Unscoped" value={metrics.unscoped.tasks} unit="tasks"
            subtitle="due soon, not yet scoped"
            valueClassName={metrics.unscoped.tasks > 0 ? "text-[#854F0B]" : undefined}
            accentBorder={metrics.unscoped.tasks > 0 ? "amber" : undefined} />
          <MetricCard label="Blocked" value={metrics.blocked.tasks} unit="tasks"
            subtitle="pending client / other team"
            accentBorder={metrics.blocked.tasks > 0 ? "gray" : undefined} />
          <MetricCard label="Load ratio" value={`${metrics.loadRatio.ratio.toFixed(2)}x`} unit=""
            subtitle={`${analyst.throughput.avgThroughput} pts/wk avg throughput`}
            valueClassName={getRatioColor(metrics.loadRatio.ratio)} />
        </div>
        <DailyLoadChart analyst={analyst} />
        <div><TaskList tasks={analyst.tasks} /></div>
      </div>
    </main>
  )
}

// ─── Add Analyst Modal ──────────────────────────────────────────────────────

interface LookupResult {
  gid: string
  name: string
  email: string
  jobTitle: string
  photoUrl: string
}

function AddAnalystModal({
  open,
  onClose,
  existingGids,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  existingGids: Set<string>
  onSuccess: () => void
}) {
  const [email, setEmail] = useState("")
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [pod, setPod] = useState("")
  const [status, setStatus] = useState("active")
  const [clientInput, setClientInput] = useState("")
  const [clients, setClients] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const reset = () => {
    setEmail("")
    setLookupResult(null)
    setLookupError(null)
    setIsLookingUp(false)
    setPod("")
    setStatus("active")
    setClientInput("")
    setClients([])
    setIsSaving(false)
    setSaveError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleLookup = async () => {
    if (!email.trim()) return
    setIsLookingUp(true)
    setLookupError(null)
    setLookupResult(null)
    try {
      const res = await fetch(`/api/lookup-analyst?email=${encodeURIComponent(email.trim())}`)
      const json = await res.json()
      if (!res.ok) {
        setLookupError(json.error || "Lookup failed")
        return
      }
      if (existingGids.has(json.gid)) {
        setLookupError("This analyst is already added")
        return
      }
      setLookupResult(json)
    } catch {
      setLookupError("Network error. Please try again.")
    } finally {
      setIsLookingUp(false)
    }
  }

  const addClient = () => {
    const val = clientInput.trim()
    if (val && !clients.includes(val)) {
      setClients((prev) => [...prev, val])
    }
    setClientInput("")
  }

  const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addClient()
    } else if (e.key === "Backspace" && !clientInput && clients.length > 0) {
      setClients((prev) => prev.slice(0, -1))
    }
  }

  const handleSave = async () => {
    if (!lookupResult || !pod) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/config/add-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gid: lookupResult.gid,
          name: lookupResult.name,
          email: lookupResult.email,
          jobTitle: lookupResult.jobTitle,
          photoUrl: lookupResult.photoUrl,
          pod,
          status,
          clients,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveError(json.error || "Save failed")
        return
      }
      handleClose()
      onSuccess()
    } catch {
      setSaveError("Network error. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Analyst</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Step 1: Asana lookup */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
              Asana Email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setLookupResult(null); setLookupError(null) }}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="analyst@acadia.io"
                className="flex-1 h-9 px-3 text-sm bg-muted/50 border border-border rounded-md placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={isLookingUp}
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={isLookingUp || !email.trim()}
                className="h-9 px-3 text-sm font-medium bg-secondary border border-border rounded-md hover:bg-muted/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLookingUp ? "Looking up…" : "Verify"}
              </button>
            </div>
            {lookupError && <p className="text-xs text-[#E24B4A] mt-1.5">{lookupError}</p>}
          </div>

          {/* Step 2: Show verified analyst + config */}
          {lookupResult && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[#EAF3DE] border border-[#C3DFA3]">
                {lookupResult.photoUrl ? (
                  <img src={lookupResult.photoUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[#EAF3DE] border border-[#C3DFA3] flex items-center justify-center text-[11px] font-medium text-[#27500A] flex-shrink-0">
                    {lookupResult.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{lookupResult.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{lookupResult.email}</p>
                </div>
                <Check className="h-4 w-4 text-[#639922] flex-shrink-0" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Pod <span className="text-[#E24B4A]">*</span>
                  </label>
                  <Select value={pod} onValueChange={setPod}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select pod" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pod-2">Pod-2</SelectItem>
                      <SelectItem value="pod-3">Pod-3</SelectItem>
                      <SelectItem value="shared">Shared Resource</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Status
                  </label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="ramping">Ramping</SelectItem>
                      <SelectItem value="on-leave">On Leave</SelectItem>
                      <SelectItem value="offboarded">Offboarded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Involved Clients <span className="text-muted-foreground/60 normal-case">(optional)</span>
                </label>
                <div className={cn(
                  "min-h-9 px-2 py-1.5 bg-muted/50 border border-border rounded-md flex flex-wrap gap-1.5 items-center",
                  "focus-within:ring-1 focus-within:ring-ring"
                )}>
                  {clients.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1 bg-background border border-border rounded-full px-2 py-0.5 text-xs">
                      {c}
                      <button type="button" onClick={() => setClients((prev) => prev.filter((x) => x !== c))}
                        className="text-muted-foreground hover:text-foreground">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={clientInput}
                    onChange={(e) => setClientInput(e.target.value)}
                    onKeyDown={handleClientKeyDown}
                    onBlur={addClient}
                    placeholder={clients.length === 0 ? "Type and press Enter to add" : ""}
                    className="flex-1 min-w-[120px] bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Press Enter or comma to add each client</p>
              </div>

              {saveError && <p className="text-xs text-[#E24B4A]">{saveError}</p>}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !pod}
                className="w-full h-9 bg-foreground text-background text-sm font-medium rounded-md hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? "Adding…" : "Add Analyst"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Analyst Modal ─────────────────────────────────────────────────────

function EditAnalystModal({
  analyst,
  onClose,
  onSaved,
}: {
  analyst: Analyst | null
  onClose: () => void
  onSaved: (gid: string, pod: string, status: string, clients: string[]) => void
}) {
  const [pod, setPod] = useState("")
  const [status, setStatus] = useState("active")
  const [clientInput, setClientInput] = useState("")
  const [clients, setClients] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (analyst) {
      setPod(analyst.pod)
      setStatus(analyst.status)
      setClients(analyst.clients || [])
      setClientInput("")
      setSaveError(null)
    }
  }, [analyst])

  const addClient = () => {
    const val = clientInput.trim()
    if (val && !clients.includes(val)) setClients((prev) => [...prev, val])
    setClientInput("")
  }

  const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addClient()
    } else if (e.key === "Backspace" && !clientInput && clients.length > 0) {
      setClients((prev) => prev.slice(0, -1))
    }
  }

  const handleSave = async () => {
    if (!analyst || !pod) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/config/update-analyst", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gid: analyst.id, pod, status, clients }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveError(json.error || "Save failed")
        return
      }
      onSaved(analyst.id, pod, status, clients)
      onClose()
    } catch {
      setSaveError("Network error. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={!!analyst} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Analyst</DialogTitle>
        </DialogHeader>
        {analyst && (
          <div className="space-y-4 pt-1">
            {/* Analyst identity — read-only */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border">
              <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground flex-shrink-0">
                {analyst.initials}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{analyst.name}</p>
                {analyst.email && (
                  <p className="text-xs text-muted-foreground truncate">{analyst.email}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Pod <span className="text-[#E24B4A]">*</span>
                </label>
                <Select value={pod} onValueChange={setPod}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select pod" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pod-2">Pod-2</SelectItem>
                    <SelectItem value="pod-3">Pod-3</SelectItem>
                    <SelectItem value="shared">Shared Resource</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Status
                </label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="ramping">Ramping</SelectItem>
                    <SelectItem value="on-leave">On Leave</SelectItem>
                    <SelectItem value="offboarded">Offboarded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
                Involved Clients
              </label>
              <div className={cn(
                "min-h-9 px-2 py-1.5 bg-muted/50 border border-border rounded-md flex flex-wrap gap-1.5 items-center",
                "focus-within:ring-1 focus-within:ring-ring"
              )}>
                {clients.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 bg-background border border-border rounded-full px-2 py-0.5 text-xs">
                    {c}
                    <button type="button" onClick={() => setClients((prev) => prev.filter((x) => x !== c))}
                      className="text-muted-foreground hover:text-foreground">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={clientInput}
                  onChange={(e) => setClientInput(e.target.value)}
                  onKeyDown={handleClientKeyDown}
                  onBlur={addClient}
                  placeholder={clients.length === 0 ? "Type and press Enter to add" : ""}
                  className="flex-1 min-w-[120px] bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Press Enter or comma to add each client</p>
            </div>

            {saveError && <p className="text-xs text-[#E24B4A]">{saveError}</p>}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !pod}
              className="w-full h-9 bg-foreground text-background text-sm font-medium rounded-md hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Workspaces Modal ───────────────────────────────────────────────────────

interface WorkspaceEntry {
  id: string
  name: string
  workspaceGid: string
  standUpProjectGid: string
  calendarProjectGid: string
  isDefault: boolean
}

const ACADIA_GID = "16282293647760"
const ACADIA_STANDUP_GID = "1204969864314028"
const ACADIA_CALENDAR_GID = "1207246447954463"

function WorkspacesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false)

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [asanaWorkspaces, setAsanaWorkspaces] = useState<{ gid: string; name: string }[]>([])
  const [isLoadingAsanaWorkspaces, setIsLoadingAsanaWorkspaces] = useState(false)
  const [asanaWorkspacesError, setAsanaWorkspacesError] = useState<string | null>(null)
  const [selectedWorkspace, setSelectedWorkspace] = useState<{ gid: string; name: string } | null>(null)
  const [projects, setProjects] = useState<{ gid: string; name: string }[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [standUpGid, setStandUpGid] = useState("")
  const [calendarGid, setCalendarGid] = useState("")
  const [projectError, setProjectError] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setIsLoadingWorkspaces(true)
    fetch("/api/config/workspaces")
      .then((r) => r.json())
      .then((d) => setWorkspaces(d.workspaces || []))
      .finally(() => setIsLoadingWorkspaces(false))
    // Auto-load all Asana workspaces
    setIsLoadingAsanaWorkspaces(true)
    setAsanaWorkspacesError(null)
    fetch("/api/lookup-workspace")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setAsanaWorkspaces(d.workspaces || [])
      })
      .catch((e) => setAsanaWorkspacesError(e.message))
      .finally(() => setIsLoadingAsanaWorkspaces(false))
  }, [open])

  const resetWizard = () => {
    setStep(1)
    setSelectedWorkspace(null); setProjects([]); setStandUpGid(""); setCalendarGid("")
    setProjectError(null); setWorkspaceName(""); setSaveError(null)
  }

  const handleSelectWorkspace = async (ws: { gid: string; name: string }) => {
    setSelectedWorkspace(ws)
    setWorkspaceName(ws.name)
    setStep(2)
    setIsLoadingProjects(true)
    setProjectError(null)
    // Pre-select Acadia defaults if applicable
    if (ws.gid === ACADIA_GID) {
      setStandUpGid(ACADIA_STANDUP_GID)
      setCalendarGid(ACADIA_CALENDAR_GID)
    } else {
      setStandUpGid(""); setCalendarGid("")
    }
    try {
      const res = await fetch(`/api/lookup-projects?workspaceGid=${ws.gid}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load projects")
      setProjects(data.projects)
    } catch (e: any) {
      setProjectError(e.message)
    } finally {
      setIsLoadingProjects(false)
    }
  }

  const handleProjectsNext = () => {
    if (!standUpGid || !calendarGid) { setProjectError("Please select both projects"); return }
    setProjectError(null); setStep(3)
  }

  const handleSave = async () => {
    if (!selectedWorkspace || !workspaceName.trim() || !standUpGid || !calendarGid) return
    setIsSaving(true); setSaveError(null)
    try {
      const res = await fetch("/api/config/add-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim(), workspaceGid: selectedWorkspace.gid, standUpProjectGid: standUpGid, calendarProjectGid: calendarGid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add workspace")
      setWorkspaces(data.config.workspaces)
      resetWizard()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this workspace?")) return
    try {
      const res = await fetch("/api/config/delete-workspace", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to remove workspace")
      setWorkspaces(data.config.workspaces)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const inputCls = "w-full h-9 px-3 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetWizard(); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Workspaces</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* Existing workspaces list */}
          <div className="space-y-2">
            {isLoadingWorkspaces ? (
              <p className="text-xs text-muted-foreground py-1">Loading…</p>
            ) : workspaces.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 border border-border">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {w.name}
                    {w.isDefault && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EAF3DE] text-[#27500A]">DEFAULT</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{w.workspaceGid}</p>
                </div>
                {!w.isDefault && (
                  <button onClick={() => handleRemove(w.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Wizard */}
          <div className="border-t border-border pt-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-4">
              {([1, 2, 3] as const).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold",
                    step === s ? "bg-foreground text-background" : step > s ? "bg-[#EAF3DE] text-[#27500A]" : "bg-muted text-muted-foreground"
                  )}>{step > s ? <Check className="h-2.5 w-2.5" /> : s}</div>
                  {s < 3 && <div className="w-6 h-px bg-border" />}
                </div>
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                {step === 1 ? "Select workspace" : step === 2 ? "Pick projects" : "Name & save"}
              </span>
            </div>

            {/* Step 1 — Pick workspace */}
            {step === 1 && (
              <div className="space-y-2">
                {isLoadingAsanaWorkspaces ? (
                  <p className="text-xs text-muted-foreground py-1">Loading workspaces…</p>
                ) : asanaWorkspacesError ? (
                  <p className="text-xs text-[#E24B4A]">{asanaWorkspacesError}</p>
                ) : (
                  asanaWorkspaces.map((ws) => (
                    <button key={ws.gid} onClick={() => handleSelectWorkspace(ws)}
                      className="w-full text-left px-3 py-2.5 rounded-md border border-border hover:bg-muted/50 transition-colors">
                      <p className="text-sm font-medium">{ws.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{ws.gid}</p>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Step 2 — Pick projects */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Workspace: <span className="font-medium text-foreground">{selectedWorkspace?.name}</span></p>
                {isLoadingProjects ? (
                  <p className="text-xs text-muted-foreground">Loading projects…</p>
                ) : (
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Add Project</label>
                    <Select value={standUpGid} onValueChange={(v) => {
                      const alreadyAdded = workspaces.some(w => w.standUpProjectGid === v || w.calendarProjectGid === v)
                      if (alreadyAdded) { setProjectError("This project is already added to another workspace"); return }
                      setProjectError(null); setStandUpGid(v); setCalendarGid(v)
                    }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select project…" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => <SelectItem key={p.gid} value={p.gid}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {projectError && <p className="text-xs text-[#E24B4A]">{projectError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setStep(1)}
                    className="flex-1 h-9 border border-border text-sm rounded-md hover:bg-muted/50 transition-colors">Back</button>
                  <button onClick={handleProjectsNext} disabled={isLoadingProjects}
                    className="flex-1 h-9 bg-foreground text-background text-sm font-medium rounded-md hover:bg-foreground/90 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}

            {/* Step 3 — Name and save */}
            {step === 3 && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">Workspace Label</label>
                  <input type="text" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="e.g. Acadia — Pod 4" className={inputCls} />
                </div>
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Project: <span className="text-foreground font-medium">{projects.find(p => p.gid === standUpGid)?.name}</span></p>
                </div>
                {saveError && <p className="text-xs text-[#E24B4A]">{saveError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setStep(2)}
                    className="flex-1 h-9 border border-border text-sm rounded-md hover:bg-muted/50 transition-colors">Back</button>
                  <button onClick={handleSave} disabled={isSaving || !workspaceName.trim()}
                    className="flex-1 h-9 bg-foreground text-background text-sm font-medium rounded-md hover:bg-foreground/90 disabled:opacity-50">
                    {isSaving ? "Saving…" : "Add Workspace"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pod label helper ───────────────────────────────────────────────────────

const POD_LABELS: Record<string, string> = {
  "pod-2": "POD-2",
  "pod-3": "POD-3",
  "shared": "SHARED RESOURCES",
}
const POD_ORDER: AnalystPod[] = ["pod-3", "pod-2", "shared"]

// ─── Dashboard ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [analysts, setAnalysts] = useState<Analyst[]>(staticAnalysts)
  const [selectedId, setSelectedId] = useState(staticAnalysts[0]?.id || "")
  const [searchQuery, setSearchQuery] = useState("")
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingAnalyst, setEditingAnalyst] = useState<Analyst | null>(null)
  const [workspacesModalOpen, setWorkspacesModalOpen] = useState(false)
  // Config state: pod/status/clients per analyst GID — always fresh from inaflow-config.json
  const [analystConfigs, setAnalystConfigs] = useState<Map<string, { pod: AnalystPod; status: AnalystStatus; clients: string[] }>>(new Map())

  useEffect(() => {
    let isActive = true
    const load = async () => {
      setIsLoadingData(true)
      setLoadError(null)
      try {
        const result = await fetchAnalystsFromAPI()
        if (!isActive) return
        setAnalysts(result.analysts)
        setSyncedAt(result.syncedAt)
        if (!result.analysts.find((a) => a.id === selectedId)) {
          setSelectedId(result.analysts[0]?.id || "")
        }
      } catch (error: any) {
        if (!isActive) return
        setLoadError(error?.message || "Unable to load data from the API.")
      } finally {
        if (isActive) setIsLoadingData(false)
      }
    }
    load()
    return () => { isActive = false }
  }, [])

  // Load config separately so pod/status always reflect inaflow-config.json,
  // not the potentially stale inaflow-data.json sync blob.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: { analysts?: Array<{ gid: string; pod: AnalystPod; status: AnalystStatus; clients: string[] }> }) => {
        const map = new Map<string, { pod: AnalystPod; status: AnalystStatus; clients: string[] }>()
        for (const a of cfg.analysts || []) {
          map.set(a.gid, { pod: a.pod, status: a.status, clients: a.clients || [] })
        }
        setAnalystConfigs(map)
      })
      .catch(() => {})
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsSyncing(true)
    setSyncError(null)
    try {
      const result = await triggerSync()
      if (result) {
        setAnalysts(result.analysts)
        setSyncedAt(result.syncedAt)
      } else {
        setSyncError("Sync returned no data")
      }
    } catch (err: any) {
      setSyncError(err.message || "Sync failed")
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const handleSignOut = async () => {
    await fetch("/api/auth", { method: "DELETE" })
    window.location.href = "/login"
  }

  // Update analystConfigs (not analysts) — enrichedAnalysts will re-derive automatically
  const handleAnalystUpdated = useCallback(
    (gid: string, pod: string, status: string, clients: string[]) => {
      setAnalystConfigs((prev) => {
        const next = new Map(prev)
        next.set(gid, { pod: pod as AnalystPod, status: status as AnalystStatus, clients })
        return next
      })
    },
    []
  )

  const handleAnalystDeleted = useCallback(async (gid: string) => {
    await fetch("/api/config/delete-analyst", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gid }) })
    setAnalysts((prev) => prev.filter((a) => a.id !== gid))
    setAnalystConfigs((prev) => { const next = new Map(prev); next.delete(gid); return next })
    setSelectedId((prev) => (prev === gid ? "" : prev))
  }, [])

  // Merge live config (pod/status/clients) on top of sync blob data so profile
  // edits persist across browser refreshes without needing a full Asana sync.
  const enrichedAnalysts = useMemo(() => {
    return analysts.map((a) => {
      const cfg = analystConfigs.get(a.id)
      return cfg ? { ...a, pod: cfg.pod, status: cfg.status, clients: cfg.clients } : a
    })
  }, [analysts, analystConfigs])

  const filteredAnalysts = useMemo(() => {
    if (!searchQuery.trim()) return enrichedAnalysts
    const query = searchQuery.toLowerCase()
    return enrichedAnalysts.filter((a) => a.name.toLowerCase().includes(query))
  }, [searchQuery, enrichedAnalysts])

  const visibleAnalysts = useMemo(() => {
    if (showInactive) return filteredAnalysts
    return filteredAnalysts.filter(
      (a) => a.status === "active" || a.status === "ramping"
    )
  }, [filteredAnalysts, showInactive])

  const groupedByPod = useMemo(() => {
    const groups: Record<string, Analyst[]> = {}
    for (const pod of POD_ORDER) groups[pod] = []
    for (const analyst of visibleAnalysts) {
      const pod = analyst.pod || "pod-3"
      if (groups[pod]) groups[pod].push(analyst)
      else groups[pod] = [analyst]
    }
    return groups
  }, [visibleAnalysts])

  const existingGids = useMemo(
    () => new Set(analysts.map((a) => a.id)),
    [analysts]
  )

  const selectedAnalyst = enrichedAnalysts.find((a) => a.id === selectedId) || enrichedAnalysts[0]

  const syncLabel = isLoadingData
    ? "Loading data..."
    : syncedAt
      ? `Synced ${new Date(syncedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} EST`
      : loadError
        ? "No data loaded"
        : "Static data"

  const renderAnalystButton = (analyst: Analyst) => {
    const colors = getSignalColor(analyst.signal)
    const isSelected = analyst.id === selectedId
    const isInactive = analyst.status === "on-leave" || analyst.status === "offboarded"
    return (
      <div key={analyst.id} className={cn("group flex items-center rounded-md", isInactive && "opacity-50")}>
        <button
          onClick={() => setSelectedId(analyst.id)}
          className={cn(
            "flex-1 flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors min-w-0",
            isSelected ? "bg-blue-50" : "hover:bg-muted/50"
          )}
        >
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", colors.dot)} />
          <span className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0",
            colors.avatar
          )}>
            {analyst.initials}
          </span>
          <span className="text-[13px] text-foreground truncate flex-1">{analyst.name}</span>
          {analyst.status === "ramping" && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806] flex-shrink-0">
              NEW
            </span>
          )}
          {analyst.status === "on-leave" && (
            <span className="text-[9px] font-medium text-muted-foreground flex-shrink-0">OL</span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 flex-shrink-0 p-1 mr-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setEditingAnalyst(analyst)}>
              Edit profile
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm(`Remove ${analyst.name} from the dashboard?`)) {
                  handleAnalystDeleted(analyst.id)
                }
              }}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col h-screen">
        {/* Header */}
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm text-muted-foreground font-medium">InAFlow</h1>
            <button
              onClick={handleRefresh}
              disabled={isSyncing}
              className={cn(
                "flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50",
                isSyncing && "opacity-50 cursor-not-allowed"
              )}
              title="Refresh data from Asana"
            >
              <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
              {isSyncing ? "Syncing..." : "Refresh"}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search analysts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-muted/50 border-0 rounded-md placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2">{syncLabel}</p>
          {syncError && <p className="text-[10px] text-[#E24B4A] mt-1">{syncError}</p>}
        </div>

        {/* Analyst list grouped by pod */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {visibleAnalysts.length === 0 && (
            <p className="text-[13px] text-muted-foreground px-2 py-4">
              {loadError ? loadError : isLoadingData ? "Loading analysts..." : "No analysts found."}
            </p>
          )}
          {POD_ORDER.filter((pod) => groupedByPod[pod]?.length > 0).map((pod) => (
            <div key={pod} className="mb-3">
              <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2 py-1">
                {POD_LABELS[pod]}
              </p>
              {groupedByPod[pod].map(renderAnalystButton)}
            </div>
          ))}
        </div>

        {/* Sidebar footer */}
        <div className="px-2 py-2 border-t border-border space-y-1">
          {/* Show inactive toggle */}
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-3 h-3 rounded accent-foreground"
            />
            <span className="text-[11px] text-muted-foreground">Show inactive</span>
          </label>

          {/* Add analyst button */}
          <button
            onClick={() => setAddModalOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Analyst
          </button>

          {/* Workspaces button */}
          <button
            onClick={() => setWorkspacesModalOpen(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Workspaces
          </button>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </aside>

      <AnalystDetail analyst={selectedAnalyst} loadError={loadError} isLoadingData={isLoadingData} />

      <AddAnalystModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        existingGids={existingGids}
        onSuccess={handleRefresh}
      />

      <EditAnalystModal
        analyst={editingAnalyst}
        onClose={() => setEditingAnalyst(null)}
        onSaved={handleAnalystUpdated}
      />

      <WorkspacesModal
        open={workspacesModalOpen}
        onClose={() => setWorkspacesModalOpen(false)}
      />
    </div>
  )
}
