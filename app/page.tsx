"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, RefreshCw, ChevronDown } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { analysts as staticAnalysts, fetchAnalystsFromAPI, triggerSync, type Analyst, type Signal, type EffortLevel, type Task } from "@/lib/data"
import { cn } from "@/lib/utils"

// Signal color mappings
function getSignalColor(signal: Signal) {
  switch (signal) {
    case "Optimal":
      return {
        dot: "bg-[#639922]",
        avatar: "bg-[#EAF3DE] text-[#27500A]",
        badge: "bg-[#EAF3DE] text-[#27500A]",
      }
    case "Underutilized":
      return {
        dot: "bg-[#EF9F27]",
        avatar: "bg-[#FAEEDA] text-[#633806]",
        badge: "bg-[#FAEEDA] text-[#633806]",
      }
    case "Overloaded":
      return {
        dot: "bg-[#E24B4A]",
        avatar: "bg-[#FCEBEB] text-[#791F1F]",
        badge: "bg-[#FCEBEB] text-[#791F1F]",
      }
    default:
      return {
        dot: "bg-muted",
        avatar: "bg-muted text-muted-foreground",
        badge: "bg-muted text-muted-foreground",
      }
  }
}

function getEffortColor(effort: string) {
  const e = effort.toLowerCase()
  if (e.includes("low")) return "bg-[#EAF3DE] text-[#27500A]"
  if (e.includes("medium")) return "bg-[#FAEEDA] text-[#633806]"
  if (e.includes("high") && !e.includes("very")) return "bg-[#FCEBEB] text-[#791F1F]"
  if (e.includes("very high")) return "bg-[#F7C1C1] text-[#791F1F]"
  return "bg-muted text-muted-foreground" // need to scope or other
}

function getRatioColor(ratio: number) {
  if (ratio < 0.6) return "text-[#639922]"
  if (ratio <= 1.1) return "text-[#EF9F27]"
  return "text-[#E24B4A]"
}

// Calendar event stub color mapping
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
  if (isPast) return "#F09595"       // Overdue (past)
  if (value >= 8) return "#991B1B"   // Very Heavy — dark red
  if (value >= 6) return "#E24B4A"   // Heavy — red
  if (value >= 3) return "#EF9F27"   // Moderate — amber
  return "#B4B2A9"                   // Light — gray
}

// Check if analyst has any time off in next 7 days
function hasUpcomingTimeOff(upcomingPTO: { date: string; type: string }[]): boolean {
  if (!upcomingPTO || upcomingPTO.length === 0) return false
  const today = new Date()
  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)
  const todayStr = today.toISOString().split("T")[0]
  const nextWeekStr = nextWeek.toISOString().split("T")[0]
  
  return upcomingPTO.some(pto => pto.date >= todayStr && pto.date <= nextWeekStr && (pto.type.toLowerCase() === "pto" || pto.type.toLowerCase() === "vto"))
}

// Get the first upcoming PTO within the next 7 days
function getUpcomingPTO(upcomingPTO: { date: string; type: string }[]): { label: string } | null {
  if (!upcomingPTO || upcomingPTO.length === 0) return null
  const today = new Date()
  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)
  const todayStr = today.toISOString().split("T")[0]
  const nextWeekStr = nextWeek.toISOString().split("T")[0]
  
  const upcoming = upcomingPTO.filter(pto => pto.date >= todayStr && pto.date <= nextWeekStr && (pto.type.toLowerCase() === "pto" || pto.type.toLowerCase() === "vto"))
  
  if (upcoming.length > 0) {
    const pto = upcoming.sort((a, b) => a.date.localeCompare(b.date))[0]
    const d = new Date(pto.date)
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }
  }
  return null
}

// Sidebar Component
function AnalystSidebar({
  analysts,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
}: {
  analysts: Analyst[]
  selectedId: string
  onSelect: (id: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}) {
  return (
    <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col h-screen">
      <div className="p-4 pb-3">
        <h1 className="text-sm text-muted-foreground mb-3 font-medium">InAFlow</h1>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search analysts..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-[13px] bg-muted/50 border-0 rounded-md placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {analysts.map((analyst) => {
          const colors = getSignalColor(analyst.signal)
          const isSelected = analyst.id === selectedId
          return (
            <button
              key={analyst.id}
              onClick={() => onSelect(analyst.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                isSelected ? "bg-blue-50" : "hover:bg-muted/50"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", colors.dot)} />
              <span
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0",
                  colors.avatar
                )}
              >
                {analyst.initials}
              </span>
              <span className="text-[13px] text-foreground truncate flex-1">{analyst.name}</span>
              {hasUpcomingTimeOff(analyst.upcomingPTO) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#AFA9EC] flex-shrink-0" />
              )}
            </button>
          )
        })}
        {analysts.length === 0 && (
          <p className="text-[13px] text-muted-foreground px-2 py-4">No analysts found</p>
        )}
      </div>
    </aside>
  )
}

// Metric Card — dual number
function DualMetricCard({
  label,
  leftValue,
  leftUnit,
  rightValue,
  rightUnit,
  subtitle,
  valueClassName,
  accentBorder,
}: {
  label: string
  leftValue: number
  leftUnit: string
  rightValue: number
  rightUnit: string
  subtitle: string
  valueClassName?: string
  accentBorder?: "red" | "amber" | "gray"
}) {
  return (
    <div
      className={cn(
        "bg-secondary p-3.5",
        accentBorder === "red" && "border-l-[3px] border-l-[#E24B4A] rounded-r-lg",
        accentBorder === "amber" && "border-l-[3px] border-l-[#EF9F27] rounded-r-lg",
        accentBorder === "gray" && "border-l-[3px] border-l-[#B4B2A9] rounded-r-lg",
        !accentBorder && "rounded-lg"
      )}
    >
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

// Metric Card — single number
function MetricCard({
  label,
  value,
  unit,
  subtitle,
  valueClassName,
  accentBorder,
}: {
  label: string
  value: string | number
  unit: string
  subtitle: string
  valueClassName?: string
  accentBorder?: "red" | "amber" | "gray"
}) {
  return (
    <div
      className={cn(
        "bg-secondary p-3.5",
        accentBorder === "red" && "border-l-[3px] border-l-[#E24B4A] rounded-r-lg",
        accentBorder === "amber" && "border-l-[3px] border-l-[#EF9F27] rounded-r-lg",
        accentBorder === "gray" && "border-l-[3px] border-l-[#B4B2A9] rounded-r-lg",
        !accentBorder && "rounded-lg"
      )}
    >
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-xl font-medium leading-none", valueClassName)}>{value}</span>
        <span className="text-[13px] text-muted-foreground">{unit}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{subtitle}</p>
    </div>
  )
}

// Custom tooltip for the chart
function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null
  
  const data = payload[0].payload
  const hasEvent = data.eventType !== null
  const hasWorkload = data.workload > 0
  
  let conflictNote = ""
  if (hasWorkload && data.isPTODay) {
    conflictNote = " (conflict — analyst is off)"
  } else if (hasWorkload && data.isAppointmentDay) {
    conflictNote = " (half-day out)"
  }
  
  return (
    <div className="bg-popover border border-border rounded-md px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{data.dateLabel}</p>
      {hasEvent && (
        <p className="text-muted-foreground">{data.eventType}</p>
      )}
      {hasWorkload && (
        <p className="text-muted-foreground">{data.workload.toFixed(1)} pts{conflictNote}</p>
      )}
      {!hasEvent && !hasWorkload && (
        <p className="text-muted-foreground">No tasks, no events</p>
      )}
    </div>
  )
}

// Daily Load Chart Component
function DailyLoadChart({ analyst }: { analyst: Analyst }) {
  const chartData = useMemo(() => {
    // Get local today's date string in YYYY-MM-DD format
    const localToday = new Date()
    const yyyy = localToday.getFullYear()
    const mm = String(localToday.getMonth() + 1).padStart(2, '0')
    const dd = String(localToday.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`

    // Count working tasks due per date (for PTO conflict warnings)
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
      // If the backend marked it isToday, or if our string matches
      const isToday = day.date === todayStr || day.isToday

      const eventType = day.calendar?.type || null
      const stubColors = getStubColor(eventType)
      const d = new Date(day.date)
      const isZeroCapacity = day.calendar?.capacity === 0
      const tasksDueOnDay = dueCountByDate[day.date] || 0

      return {
        dateLabel: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
        dateRaw: day.date,
        stub: 0.8,
        spacer: 0.15,
        workload: day.points > 0 ? day.points : 0,
        isToday,
        isPast,
        eventType,
        stubFill: stubColors.fill,
        stubBorder: stubColors.border,
        isPTODay: eventType?.toLowerCase() === "pto" || eventType?.toLowerCase() === "vto",
        isAppointmentDay: eventType?.toLowerCase() === "appointment",
        isZeroCapacity,
        tasksDueOnDay,
        showPTOWarning: isZeroCapacity && tasksDueOnDay > 0,
      }
    })
  }, [analyst])

  const backlog = analyst.chartData.backlog

  // Only show the Today line if today is actually in the chart (i.e. a working day)
  const todayItem = chartData.find((d) => d.isToday)

  return (
    <div className="mb-8">
      <h3 className="text-[13px] text-muted-foreground uppercase tracking-wider mb-4 font-medium">
        Daily load — 30-day window
      </h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }} barGap={0}>
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value} pts`}
              width={45}
              domain={[0, 16]}
              ticks={[0, 4, 8, 12, 16]}
            />
            <Tooltip content={<ChartTooltip />} cursor={false} />
            
            {/* Monday Dividers (Faint Solid Lines) */}
            {chartData.map((d) => {
              const isMonday = new Date(d.dateRaw).getUTCDay() === 1
              if (isMonday) {
                return (
                  <ReferenceLine
                    key={`div-${d.dateRaw}`}
                    x={d.dateLabel}
                    stroke="var(--border)"
                    strokeOpacity={0.8}
                  />
                )
              }
              return null
            })}

            {/* Today Line (Dotted Line) */}
            {todayItem && (
              <ReferenceLine
                x={todayItem.dateLabel}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
                label={{
                  value: "Today",
                  position: "top",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
            )}

            {/* PTO conflict warnings — solid line on zero-capacity days with tasks due */}
            {chartData.map((d) =>
              d.showPTOWarning ? (
                <ReferenceLine
                  key={`pto-warn-${d.dateRaw}`}
                  x={d.dateLabel}
                  stroke="#E24B4A"
                  strokeWidth={1.5}
                  label={{
                    value: `${d.tasksDueOnDay} task${d.tasksDueOnDay === 1 ? "" : "s"} due`,
                    position: "top",
                    fontSize: 10,
                    fill: "#E24B4A",
                  }}
                />
              ) : null
            )}
            <Bar dataKey="stub" stackId="stack" radius={[2, 2, 2, 2]}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`stub-${index}`} 
                  fill={entry.stubFill} 
                  stroke={entry.stubBorder} 
                  strokeWidth={1}
                />
              ))}
            </Bar>
            <Bar dataKey="spacer" stackId="stack" radius={0}>
              {chartData.map((_, index) => (
                <Cell key={`spacer-${index}`} fill="transparent" stroke="transparent" />
              ))}
            </Bar>
            <Bar dataKey="workload" stackId="stack" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`workload-${index}`} 
                  fill={entry.workload > 0 ? getWorkloadColor(entry.workload, entry.isPast) : "transparent"} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#991B1B]" />
          <span>Very Heavy (8+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#E24B4A]" />
          <span>Heavy (6-8)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#EF9F27]" />
          <span>Moderate (3-6)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#B4B2A9]" />
          <span>Light (0-3)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#F09595]" />
          <span>Overdue</span>
        </div>

        <span className="w-px h-3 bg-border mx-1" />
        
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#AFA9EC]" />
          <span>PTO</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#FAC775]" />
          <span>Holiday</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#ED93B1]" />
          <span>Birthday</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#97C459]" />
          <span>Appt/QBR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#85B7EB]" />
          <span>Anniversary</span>
        </div>
      </div>

      {backlog && backlog.tasks > 0 && (
        <p className="text-[11px] text-muted-foreground/70 italic mt-2">
          + {backlog.tasks} tasks overdue beyond 15 days ({backlog.points} pts not shown)
        </p>
      )}
    </div>
  )
}

// Asana returns calendar dates as plain "YYYY-MM-DD" strings (no time, no zone).
// `new Date("2026-05-04")` parses as UTC midnight, then `toLocaleDateString` in
// America/New_York rolls it back to May 3. Build a local-time Date instead so
// the calendar date stays the calendar date.
function formatLocalDateLabel(s: string) {
  const [y, m, d] = s.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatTaskDateRange(startOn: string | null, dueOn: string | null) {
  if (!dueOn) return "—"
  const dueLabel = formatLocalDateLabel(dueOn)
  if (!startOn) return dueLabel
  const startLabel = formatLocalDateLabel(startOn)
  return `${startLabel} – ${dueLabel}`
}

const PRIORITY_ORDER = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "Flexible",
  "Internal",
  "Not Urgent",
]

function getPrioritySortIndex(value: string | null) {
  if (!value) return PRIORITY_ORDER.length
  const index = PRIORITY_ORDER.indexOf(value)
  return index === -1 ? PRIORITY_ORDER.length : index
}

function sortByPriorityRank(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const left = getPrioritySortIndex(a.priorityRank)
    const right = getPrioritySortIndex(b.priorityRank)
    if (left !== right) return left - right
    return a.name.localeCompare(b.name)
  })
}

// Shared column widths — applied via <colgroup> so all three section tables
// (Overdue / Active / Blocked) render identical column widths regardless of contents.
const TASK_TABLE_COLUMNS: { key: string; width: string }[] = [
  { key: "num", width: "4%" },
  { key: "name", width: "32%" },
  { key: "client", width: "11%" },
  { key: "priorityRank", width: "11%" },
  { key: "clientPriority", width: "11%" },
  { key: "effort", width: "8%" },
  { key: "dates", width: "12%" },
  { key: "status", width: "11%" },
]

function TaskTableColgroup() {
  return (
    <colgroup>
      {TASK_TABLE_COLUMNS.map((col) => (
        <col key={col.key} style={{ width: col.width }} />
      ))}
    </colgroup>
  )
}

function TaskList({ tasks }: { tasks: Analyst['tasks'] }) {
  const [collapsedSections, setCollapsedSections] = useState({ Overdue: false, Active: false, Blocked: false })
  const overdueTasks = sortByPriorityRank(tasks.overdue || [])
  const activeTasks = sortByPriorityRank([...(tasks.working || []), ...(tasks.unscoped || [])])
  const blockedTasks = sortByPriorityRank(tasks.blocked || [])

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const renderRows = (items: Task[]) =>
    items.map((task, index) => (
      <tr key={task.gid} className="border-b border-border last:border-b-0">
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap">{index + 1}</td>
        <td className="px-3 py-3 text-[13px] text-foreground truncate whitespace-nowrap" title={task.name}>{task.name}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.client}>{task.client}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.priorityRank || '—'}>{task.priorityRank || '—'}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.clientPriority || '—'}>{task.clientPriority || '—'}</td>
        <td className="px-3 py-3 text-[13px] text-foreground truncate whitespace-nowrap">
          <span className={cn("inline-flex rounded-full px-2 py-1 text-[11px] font-medium", getEffortColor(task.effortName))}>
            {task.effortName.replace(/ effort$/i, "")}
          </span>
        </td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={formatTaskDateRange(task.startOn, task.dueOn)}>{formatTaskDateRange(task.startOn, task.dueOn)}</td>
        <td className="px-3 py-3 text-[13px] text-muted-foreground truncate whitespace-nowrap" title={task.statusName}>{task.statusName}</td>
      </tr>
    ))

  const renderSection = (title: keyof typeof collapsedSections, items: Task[], accent: string, emptyMessage: string) => {
    const collapsed = collapsedSections[title]
    return (
      <section className={cn("rounded-2xl border p-4", accent)}>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => toggleSection(title)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] uppercase tracking-wider font-medium">{title}</span>
              <span className="text-[11px] text-muted-foreground">{items.length} tasks</span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                collapsed ? "-rotate-90" : "rotate-0"
              )}
            />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
        ) : (
          !collapsed && (
            // <div className="overflow-x-auto">
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
                <tbody>
                  {renderRows(items)}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {renderSection(
        "Overdue",
        overdueTasks,
        "border border-[#F5D3D3] bg-[#FEF1F1]",
        "No overdue working tasks in the last 15 working days."
      )}
      {renderSection(
        "Active",
        activeTasks,
        "border border-border bg-secondary",
        "No active working tasks in the next 15 working days."
      )}
      {renderSection(
        "Blocked",
        blockedTasks,
        "border border-border bg-muted/10",
        "No blocked tasks."
      )}
    </div>
  )
}

// Analyst Detail Panel Component
function AnalystDetail({ analyst, loadError, isLoadingData }: { analyst?: Analyst; loadError: string | null; isLoadingData: boolean }) {
  if (isLoadingData) {
    return (
      <main className="flex-1 bg-background flex items-center justify-center text-muted-foreground">
        Loading analyst data…
      </main>
    )
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
  const upcomingPTO = getUpcomingPTO(analyst.upcomingPTO)

  return (
    <main className="flex-1 bg-background overflow-y-scroll">
      <div className="p-6 px-7">
        <div className="flex items-center gap-4 mb-8">
          <span
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-medium flex-shrink-0",
              colors.avatar
            )}
          >
            {analyst.initials}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-foreground">{analyst.name}</h2>
            <p className="text-[13px] text-muted-foreground">{analyst.role}</p>
          </div>
          {upcomingPTO && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 bg-[#E6F1FB] text-[#0C447C]">
              OOO {upcomingPTO.label}
            </span>
          )}
          <span className={cn("text-sm font-semibold px-4 py-2 rounded-full flex-shrink-0", colors.badge)}>
            {analyst.signal}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-3 mb-8">
          <DualMetricCard
            label="Active load"
            leftValue={metrics.activeLoad.tasks}
            leftUnit="tasks"
            rightValue={metrics.activeLoad.points}
            rightUnit="pts"
            subtitle="due in next 15 working days"
          />
          <DualMetricCard
            label="Overdue"
            leftValue={metrics.overdue.tasks}
            leftUnit="tasks"
            rightValue={metrics.overdue.points}
            rightUnit="pts"
            subtitle={metrics.overdue.tasks > 0 ? "past due, still in progress" : "all caught up"}
            valueClassName={metrics.overdue.tasks > 0 ? "text-[#A32D2D]" : "text-[#27500A]"}
            accentBorder={metrics.overdue.tasks > 0 ? "red" : undefined}
          />
          <MetricCard
            label="Unscoped"
            value={metrics.unscoped.tasks}
            unit="tasks"
            subtitle="due soon, not yet scoped"
            valueClassName={metrics.unscoped.tasks > 0 ? "text-[#854F0B]" : undefined}
            accentBorder={metrics.unscoped.tasks > 0 ? "amber" : undefined}
          />
          <MetricCard
            label="Blocked"
            value={metrics.blocked.tasks}
            unit="tasks"
            subtitle="pending client / other team"
            accentBorder={metrics.blocked.tasks > 0 ? "gray" : undefined}
          />
          <MetricCard
            label="Load ratio"
            value={`${metrics.loadRatio.ratio.toFixed(2)}x`}
            unit=""
            subtitle={`${analyst.throughput.avgThroughput} pts/wk avg throughput`}
            valueClassName={getRatioColor(metrics.loadRatio.ratio)}
          />
        </div>

        <DailyLoadChart analyst={analyst} />

        <div>
          <TaskList tasks={analyst.tasks} />
        </div>
      </div>
    </main>
  )
}

export default function Dashboard() {
  const [analysts, setAnalysts] = useState<Analyst[]>(staticAnalysts)
  const [selectedId, setSelectedId] = useState(staticAnalysts[0]?.id || "")
  const [searchQuery, setSearchQuery] = useState("")
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // On mount, try to load fresh data from API (Vercel Blob)
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
        if (!result.analysts.find(a => a.id === selectedId)) {
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

  const filteredAnalysts = useMemo(() => {
    if (!searchQuery.trim()) return analysts
    const query = searchQuery.toLowerCase()
    return analysts.filter((analyst) => analyst.name.toLowerCase().includes(query))
  }, [searchQuery, analysts])

  const selectedAnalyst = analysts.find((a) => a.id === selectedId) || analysts[0]

  const syncLabel = isLoadingData
    ? "Loading data..."
    : syncedAt
      ? `Synced ${new Date(syncedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} EST`
      : loadError
        ? "No data loaded"
        : "Static data"

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col h-screen">
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
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filteredAnalysts.map((analyst) => {
            const colors = getSignalColor(analyst.signal)
            const isSelected = analyst.id === selectedId
            return (
              <button
                key={analyst.id}
                onClick={() => setSelectedId(analyst.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
                  isSelected ? "bg-blue-50" : "hover:bg-muted/50"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", colors.dot)} />
                <span
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0",
                    colors.avatar
                  )}
                >
                  {analyst.initials}
                </span>
                <span className="text-[13px] text-foreground truncate flex-1">{analyst.name}</span>
                {hasUpcomingTimeOff(analyst.upcomingPTO) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#AFA9EC] flex-shrink-0" />
                )}
              </button>
            )
          })}
          {filteredAnalysts.length === 0 && (
            <p className="text-[13px] text-muted-foreground px-2 py-4">
              {loadError ? loadError : isLoadingData ? "Loading analysts..." : "No analysts found. Refresh to sync data."}
            </p>
          )}
        </div>
      </aside>
      <AnalystDetail analyst={selectedAnalyst} loadError={loadError} isLoadingData={isLoadingData} />
    </div>
  )
}
