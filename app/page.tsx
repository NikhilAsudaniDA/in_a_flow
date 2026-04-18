"use client"

import { useState, useMemo } from "react"
import { Search } from "lucide-react"
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
import { analysts, type Analyst, type Signal, type EffortLevel, type Task, type CalendarEvent, type CalendarEventType } from "@/lib/data"
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
  }
}

function getEffortColor(effort: EffortLevel) {
  switch (effort) {
    case "Low":
      return "bg-[#EAF3DE] text-[#27500A]"
    case "Medium":
      return "bg-[#FAEEDA] text-[#633806]"
    case "High":
      return "bg-[#FCEBEB] text-[#791F1F]"
    case "Very High":
      return "bg-[#F7C1C1] text-[#791F1F]"
    case "Need to Scope":
      return "bg-muted text-muted-foreground"
  }
}

function getRatioColor(ratio: number) {
  if (ratio < 0.6) return "text-[#639922]"
  if (ratio <= 1.1) return "text-[#EF9F27]"
  return "text-[#E24B4A]"
}

// Calendar event stub color mapping
function getStubColor(eventType: CalendarEventType | null): { fill: string; border: string } {
  if (!eventType) {
    return { fill: "transparent", border: "#D3D1C7" }
  }
  switch (eventType) {
    case "pto":
    case "vto":
      return { fill: "#AFA9EC", border: "#AFA9EC" }
    case "holiday":
    case "floater":
      return { fill: "#FAC775", border: "#FAC775" }
    case "birthday":
    case "event":
      return { fill: "#ED93B1", border: "#ED93B1" }
    case "anniversary":
      return { fill: "#85B7EB", border: "#85B7EB" }
    case "appointment":
    case "qbr":
      return { fill: "#97C459", border: "#97C459" }
    default:
      return { fill: "transparent", border: "#D3D1C7" }
  }
}

// Generate chart data for 31-day window (-15 to +15, with today at center)
function generateChartData(analyst: Analyst) {
  const today = new Date()
  const data = []
  
  // Create a map of calendar events for quick lookup
  const eventMap = new Map<number, CalendarEvent>()
  analyst.calendarEvents.forEach((e) => eventMap.set(e.dayOffset, e))

  for (let i = -15; i <= 15; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dateLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

    let workload = 0

    if (i < 0) {
      // Past days - show overdue data
      const overdueIndex = i + 15 // Convert -15..-1 to 0..14
      workload = analyst.chartData.overdueData[overdueIndex] || 0
    } else {
      // Today and future - show upcoming data
      workload = analyst.chartData.futureData[i] || 0
    }
    
    // Get calendar event for this day
    const event = eventMap.get(i)
    const eventType = event?.type || null
    const stubColors = getStubColor(eventType)
    
    // Determine if this is a PTO/VTO conflict
    const isPTODay = eventType === "pto" || eventType === "vto"
    const isAppointmentDay = eventType === "appointment"

    data.push({
      day: i,
      date: dateLabel,
      stub: 0.4, // Fixed stub height
      spacer: 0.15, // Gap between stub and workload
      workload: workload > 0 ? workload : 0,
      isToday: i === 0,
      isPast: i < 0,
      eventType,
      stubFill: stubColors.fill,
      stubBorder: stubColors.border,
      isPTODay,
      isAppointmentDay,
    })
  }

  return data
}

function getWorkloadColor(value: number, isPast: boolean) {
  if (isPast) return "#F09595" // Muted red for overdue/past
  if (value >= 5) return "#E24B4A" // Red - Heavy
  if (value >= 3) return "#EF9F27" // Amber - Moderate
  return "#B4B2A9" // Gray - Light
}

// Get the first upcoming PTO within the next 7 days
function getUpcomingPTO(events: CalendarEvent[]): CalendarEvent | null {
  const upcoming = events.filter((e) => e.dayOffset >= 0 && e.dayOffset <= 7 && (e.type === "pto" || e.type === "vto"))
  return upcoming.length > 0 ? upcoming.sort((a, b) => a.dayOffset - b.dayOffset)[0] : null
}

// Check if analyst has any time off in next 7 days (PTO or VTO)
function hasUpcomingTimeOff(events: CalendarEvent[]): boolean {
  return events.some((e) => e.dayOffset >= 0 && e.dayOffset <= 7 && (e.type === "pto" || e.type === "vto"))
}

// Get event type display name
function getEventTypeName(type: CalendarEventType): string {
  switch (type) {
    case "pto": return "PTO"
    case "vto": return "VTO"
    case "holiday": return "Holiday"
    case "floater": return "Floater"
    case "birthday": return "Birthday"
    case "anniversary": return "Work Anniversary"
    case "appointment": return "Appointment"
    case "qbr": return "QBR/SAR"
    case "event": return "Event"
    default: return type
  }
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
              {hasUpcomingTimeOff(analyst.calendarEvents) && (
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

// Metric Card — dual number (tasks + points side by side)
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
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ReturnType<typeof generateChartData>[0] }> }) {
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
      <p className="font-medium">{data.date}</p>
      {hasEvent && (
        <p className="text-muted-foreground">{getEventTypeName(data.eventType!)}</p>
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
  const chartData = useMemo(() => generateChartData(analyst), [analyst])
  const backlog = analyst.chartData.backlogBeyond15Days

  return (
    <div className="mb-8">
      <h3 className="text-[13px] text-muted-foreground uppercase tracking-wider mb-4 font-medium">
        Daily load — 30-day window
      </h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }} barGap={0}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval={2}
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
              domain={[0, 8]}
              ticks={[0, 2, 4, 6, 8]}
            />
            <Tooltip content={<ChartTooltip />} cursor={false} />
            <ReferenceLine
              x={chartData.find((d) => d.isToday)?.date}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              label={{
                value: "Today",
                position: "top",
                fontSize: 10,
                fill: "var(--muted-foreground)",
              }}
            />
            {/* Layer 1: Calendar stub (bottom) */}
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
            {/* Layer 2: Spacer (invisible gap) */}
            <Bar dataKey="spacer" stackId="stack" radius={0}>
              {chartData.map((_, index) => (
                <Cell key={`spacer-${index}`} fill="transparent" stroke="transparent" />
              ))}
            </Bar>
            {/* Layer 3: Workload bar (top) */}
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

      {/* Legend - compact single row with divider */}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
        {/* Workload colors */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#E24B4A]" />
          <span>Heavy (5+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#EF9F27]" />
          <span>Moderate (3-4)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-[#B4B2A9]" />
          <span>Light (0-2)</span>
        </div>
        
        {/* Divider */}
        <span className="w-px h-3 bg-border mx-1" />
        
        {/* Calendar event colors */}
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

      {/* Backlog note */}
      {backlog && (
        <p className="text-[11px] text-muted-foreground/70 italic mt-2">
          + {backlog.tasks} tasks overdue beyond 15 days ({backlog.points} pts not shown)
        </p>
      )}
    </div>
  )
}

// Task List Component
function TaskList({ tasks }: { tasks: Task[] }) {
  // Sort and group tasks
  const overdueTasks = tasks.filter((t) => t.status === "overdue")
  const workingTasks = tasks.filter((t) => t.status === "working")
  const blockedTasks = tasks.filter((t) => t.status === "blocked")
  const unscopedTasks = tasks.filter((t) => t.status === "unscoped")

  const renderTask = (task: Task, index: number, isBlocked = false) => (
    <div
      key={`${task.name}-${index}`}
      className={cn(
        "bg-card rounded-lg px-3.5 py-2.5 flex items-center gap-3 mb-1.5",
        isBlocked && "opacity-70"
      )}
    >
      <span className="text-[13px] text-muted-foreground w-5 flex-shrink-0">{index + 1}.</span>
      <span className="text-[13px] text-foreground flex-1 min-w-0 truncate">{task.name}</span>
      <span className="text-[11px] text-muted-foreground flex-shrink-0 flex items-center gap-1.5">
        {task.dueDate ? `Due ${task.dueDate}` : "No due date"}
        {task.status === "overdue" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#FCEBEB] text-[#791F1F]">
            Overdue
          </span>
        )}
      </span>
      <span
        className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0", getEffortColor(task.effort))}
      >
        {task.effort}
      </span>
    </div>
  )

  let taskIndex = 0

  return (
    <div>
      {/* Overdue tasks */}
      {overdueTasks.map((task) => {
        taskIndex++
        return renderTask(task, taskIndex, false)
      })}

      {/* Working tasks */}
      {workingTasks.map((task) => {
        taskIndex++
        return renderTask(task, taskIndex, false)
      })}

      {/* Blocked tasks section */}
      {blockedTasks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-[13px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">
            Blocked
          </h4>
          {blockedTasks.map((task) => {
            taskIndex++
            return renderTask(task, taskIndex, true)
          })}
        </div>
      )}

      {/* Unscoped tasks */}
      {unscopedTasks.map((task) => {
        taskIndex++
        return renderTask(task, taskIndex, false)
      })}
    </div>
  )
}

// Analyst Detail Panel Component
function AnalystDetail({ analyst }: { analyst: Analyst }) {
  const colors = getSignalColor(analyst.signal)
  const { metrics } = analyst
  const upcomingPTO = getUpcomingPTO(analyst.calendarEvents)

  return (
    <main className="flex-1 bg-background overflow-y-scroll">
      <div className="p-6 px-7">
        {/* Header */}
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
          <span className={cn("text-xs font-medium px-3 py-1 rounded-full flex-shrink-0", colors.badge)}>
            {analyst.signal}
          </span>
        </div>

        {/* Metric cards - 5 cards */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          <DualMetricCard
            label="Active load"
            leftValue={metrics.activeTasks}
            leftUnit="tasks"
            rightValue={metrics.activePoints}
            rightUnit="pts"
            subtitle="due in next 14 days"
          />
          <DualMetricCard
            label="Overdue"
            leftValue={metrics.overdueTasks}
            leftUnit="tasks"
            rightValue={metrics.overduePoints}
            rightUnit="pts"
            subtitle={metrics.overdueTasks > 0 ? "past due, still in progress" : "all caught up"}
            valueClassName={metrics.overdueTasks > 0 ? "text-[#A32D2D]" : "text-[#27500A]"}
            accentBorder={metrics.overdueTasks > 0 ? "red" : undefined}
          />
          <MetricCard
            label="Unscoped"
            value={metrics.unscopedTasks}
            unit="tasks"
            subtitle="due soon, not yet scoped"
            valueClassName={metrics.unscopedTasks > 0 ? "text-[#854F0B]" : undefined}
            accentBorder={metrics.unscopedTasks > 0 ? "amber" : undefined}
          />
          <MetricCard
            label="Blocked"
            value={metrics.blockedTasks}
            unit="tasks"
            subtitle="pending client / other team"
            accentBorder={metrics.blockedTasks > 0 ? "gray" : undefined}
          />
          <MetricCard
            label="Load ratio"
            value={`${metrics.loadRatio.toFixed(2)}x`}
            unit=""
            subtitle={`${metrics.throughput} pts/wk avg throughput`}
            valueClassName={getRatioColor(metrics.loadRatio)}
          />
        </div>

        {/* Daily Load Chart */}
        <DailyLoadChart analyst={analyst} />

        {/* Active tasks */}
        <div>
          <h3 className="text-[13px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">
            Active tasks
          </h3>
          <TaskList tasks={analyst.tasks} />
        </div>
      </div>
    </main>
  )
}

// Main Dashboard Component
export default function Dashboard() {
  const [selectedId, setSelectedId] = useState(analysts[0].id)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredAnalysts = useMemo(() => {
    if (!searchQuery.trim()) return analysts
    const query = searchQuery.toLowerCase()
    return analysts.filter((analyst) => analyst.name.toLowerCase().includes(query))
  }, [searchQuery])

  const selectedAnalyst = analysts.find((a) => a.id === selectedId) || analysts[0]

  return (
    <div className="flex h-screen bg-background">
      <AnalystSidebar
        analysts={filteredAnalysts}
        selectedId={selectedId}
        onSelect={setSelectedId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      <AnalystDetail analyst={selectedAnalyst} />
    </div>
  )
}
