// lib/sync-engine.ts — InAFlow v3 Sync Engine (server-side)
// Ported from inaflow_sync.mjs for use in Next.js API routes

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  workspace: "16282293647760",
  projects: {
    standUp: "1204969864314028",
    calendar: "1207246447954463",
  },
  analysts: [
    { gid: "1207090544588174", name: "Nikhil Asudani" },
    { gid: "1209071959445400", name: "Jinay Keniya" },
    // { gid: "1204806986130866", name: "Jai Khurana" },
  ],
  fields: {
    effortLevel: "1206065778986020",
    status: "1206065778986026",
    priorityRank: "1207532336387929",
    clientPriority: "1206373227048995",
    calendarColor: "1202123315418041",
  },
  effortPoints: {
    "1206065778986021": 1,    // Low effort
    "1206065778986022": 3,    // Medium effort
    "1206065778986023": 6,    // High effort
    "1214143966797916": 12,   // Very High
    "1206065778986024": 0,    // Need to scope
  } as Record<string, number>,
  effortSpreadDays: {
    1: 1, 3: 3, 6: 3, 12: 4, 0: 0,
  } as Record<number, number>,
  statusGroups: {
    "1207515172179334": "Working",
    "1207515172179335": "Working",
    "1206065778986028": "Working",
    "1206958866164775": "Working",
    "1207064686450636": "Working",
    "1206065778986029": "Working",
    "1207532336387944": "Working",
    "1207064686450642": "Working",
    "1207515172179347": "Blocked",
    "1208158822083804": "Blocked",
    "1206301625857858": "Blocked",
    "1213814052615258": "Blocked",
    "1206065778986030": "Review",
    "1206337349568851": "Done",
  } as Record<string, string>,
  // Keyed by Asana enum_value GID for the Calendar Color custom field.
  // broadcast: true = apply to all pod analysts when unassigned (Holiday, QR/SAR, Event)
  // broadcast: false = personal only; skip entirely if no one is tagged
  calendarColors: {
    "1202123315418045": { type: "PTO",              capacity: 0,   broadcast: false },
    "1207250434437053": { type: "VTO",              capacity: 0,   broadcast: false },
    "1202123315418043": { type: "Holiday",          capacity: 0,   broadcast: true  },
    "1202123315418088": { type: "Appointment",      capacity: 0.5, broadcast: false },
    "1202623786796577": { type: "QR",               capacity: 0.5, broadcast: true  },
    "1202123315418042": { type: "Birthday",         capacity: 1,   broadcast: false },
    "1206901122107898": { type: "Event",            capacity: 1,   broadcast: true  },
    "1202123315418046": { type: "Work Anniversary", capacity: 1,   broadcast: false },
  } as Record<string, { type: string; capacity: number; broadcast: boolean }>,
  thresholds: {
    underutilized: 0.6,
    overloaded: 1.1,
    dailyLight: 3,
    dailyModerate: 6,
  },
  throughputWeights: [1.0, 0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3],
  activeWindowDays: 15,
  overdueWindowDays: 15,
  chartWindowWorkingDays: 15,
};

// ============================================================
// DATE HELPERS
// ============================================================
function today() {
  const estStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [y, m, d] = estStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function nextWorkingDay(d: Date) {
  let current = new Date(d);
  while (isWeekend(current)) current = addDays(current, 1);
  return current;
}
function addWorkingDays(date: Date, n: number) {
  let current = new Date(date);
  let count = 0;
  while (count < n) {
    current = addDays(current, 1);
    if (!isWeekend(current)) count++;
  }
  return current;
}
function subtractWorkingDays(date: Date, n: number) {
  let current = new Date(date);
  let count = 0;
  while (count < n) {
    current = addDays(current, -1);
    if (!isWeekend(current)) count++;
  }
  return current;
}

// ============================================================
// ASANA API
// ============================================================
async function asanaGetAll(path: string, pat: string): Promise<any[]> {
  const headers = { "Authorization": `Bearer ${pat}`, "Accept": "application/json" };
  let all: any[] = [];
  let url: string | null = `https://app.asana.com/api/1.0${path}`;
  while (url) {
    const res: Response = await fetch(url, { headers });
    const json: any = await res.json();
    if (json.data) all.push(...json.data);
    url = json.next_page?.uri || null;
    if (url) url = `https://app.asana.com/api/1.0${url}`;
  }
  return all;
}

async function fetchAnalystTasks(analystGid: string, pat: string) {
  const optFields = [
    "name",
    "due_on",
    "start_on",
    "completed",
    "completed_at",
    "custom_fields.gid",
    "custom_fields.enum_value.gid",
    "custom_fields.enum_value.name",
    "memberships.project.gid",
    "memberships.section.name",
  ].join(",");

  const incompleteTasks = await asanaGetAll(
    `/tasks?assignee=${analystGid}&workspace=${CONFIG.workspace}&completed_since=now&limit=100&opt_fields=${optFields}`,
    pat
  );
  const tenWeeksAgo = addDays(today(), -70);
  const completedTasks = await asanaGetAll(
    `/tasks?assignee=${analystGid}&workspace=${CONFIG.workspace}&completed_since=${dateStr(tenWeeksAgo)}&limit=100&opt_fields=${optFields}`,
    pat
  );
  const onlyCompleted = completedTasks.filter((t: any) => t.completed);
  const allTasks = [...incompleteTasks, ...onlyCompleted];
  const seen = new Set();
  const unique = allTasks.filter((t: any) => {
    if (seen.has(t.gid)) return false;
    seen.add(t.gid);
    return true;
  });
  return unique.filter((t: any) =>
    t.memberships?.some((m: any) => m.project?.gid === CONFIG.projects.standUp)
  );
}

async function fetchCalendarEvents(pat: string) {
  const events = await asanaGetAll(
    `/tasks?project=${CONFIG.projects.calendar}&completed_since=now&limit=100&opt_fields=name,due_on,start_on,assignee.gid,assignee.name,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name`,
    pat
  );
  const threeMonthsAgo = addDays(today(), -90);
  const pastEvents = await asanaGetAll(
    `/tasks?project=${CONFIG.projects.calendar}&completed_since=${dateStr(threeMonthsAgo)}&limit=100&opt_fields=name,due_on,start_on,assignee.gid,assignee.name,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name`,
    pat
  );
  const all = [...events, ...pastEvents];
  const seen = new Set();
  return all.filter((e: any) => {
    if (seen.has(e.gid)) return false;
    seen.add(e.gid);
    return true;
  });
}

// ============================================================
// DATA PROCESSING
// ============================================================
function parseTask(task: any) {
  let effortGid: string | null = null;
  let statusGid: string | null = null;
  let effortName: string | null = null;
  let statusName: string | null = null;
  let priorityRank: string | null = null;
  let clientPriority: string | null = null;

  for (const cf of (task.custom_fields || [])) {
    if (cf.gid === CONFIG.fields.effortLevel && cf.enum_value) {
      effortGid = cf.enum_value.gid;
      effortName = cf.enum_value.name;
    }
    if (cf.gid === CONFIG.fields.status && cf.enum_value) {
      statusGid = cf.enum_value.gid;
      statusName = cf.enum_value.name;
    }
    if (cf.gid === CONFIG.fields.priorityRank && cf.enum_value) {
      priorityRank = cf.enum_value.name;
    }
    if (cf.gid === CONFIG.fields.clientPriority && cf.enum_value) {
      clientPriority = cf.enum_value.name;
    }
  }

  let points: number;
  if (effortGid) {
    points = CONFIG.effortPoints[effortGid] ?? 0;
  } else if (task.completed) {
    points = 3;
  } else {
    points = 0;
  }
  const group = statusGid ? (CONFIG.statusGroups[statusGid] ?? "Unknown") : "Unknown";
  const podMembership = task.memberships?.find((m: any) => m.project?.gid === CONFIG.projects.standUp);
  const client = podMembership?.section?.name || "Unknown";

  return {
    gid: task.gid, name: task.name, dueOn: task.due_on, startOn: task.start_on,
    completed: task.completed, completedAt: task.completed_at,
    effortName: effortName || "Need to scope", effortPoints: points,
    statusName: statusName || "No status",
    statusGroup: task.completed ? "Done" : group, client,
    priorityRank,
    clientPriority,
  };
}

function buildCalendarMap(events: any[], analystGids: string[]) {
  const map: Record<string, Record<string, { type: string; color: string; capacity: number }>> = {};
  for (const gid of analystGids) map[gid] = {};

  for (const event of events) {
    // Resolve color via GID — immune to Asana renaming options.
    let colorGid: string | null = null;
    for (const cf of (event.custom_fields || [])) {
      if (cf.gid === CONFIG.fields.calendarColor && cf.enum_value) {
        colorGid = cf.enum_value.gid;
      }
    }
    const colorInfo = colorGid ? CONFIG.calendarColors[colorGid] : null;
    if (!colorInfo) continue;

    const { type: matchedType, capacity, broadcast } = colorInfo;
    const assigneeGid = event.assignee?.gid;
    let recipients: string[];
    if (assigneeGid) {
      // Assigned: apply only to this person if they're in our pod; drop out-of-pod events.
      if (!map[assigneeGid]) continue;
      recipients = [assigneeGid];
    } else {
      // Unassigned: broadcast only for Holiday, QR/SAR, Event.
      // Birthday, Work Anniversary, PTO, VTO, Appointments → skip entirely if untagged.
      if (!broadcast) continue;
      recipients = Object.keys(map);
    }
    const start = parseDate(event.start_on || event.due_on);
    const end = parseDate(event.due_on);
    if (!end) continue;
    const s = start || end;
    let current = new Date(s);
    while (current <= end) {
      const ds = dateStr(current);
      for (const recipient of recipients) {
        const existing = map[recipient][ds];
        // Lower capacity wins: a PTO (0) must never be overwritten by a birthday (1).
        if (!existing || capacity < existing.capacity) {
          map[recipient][ds] = { type: matchedType, color: matchedType, capacity };
        }
      }
      current = addDays(current, 1);
    }
  }
  return map;
}

function computeDailySpread(task: any, calendarDays: Record<string, any>) {
  const dueOn = parseDate(task.dueOn);
  if (!dueOn) return {};
  const points = task.effortPoints;
  if (points === 0) return {};
  const spreadDays = CONFIG.effortSpreadDays[points] ?? 3;
  if (spreadDays === 0) return {};
  const startOn = parseDate(task.startOn);

  const windowDays: { date: string; capacity: number }[] = [];
  let cursor = new Date(dueOn);

  while (windowDays.length < spreadDays) {
    if (isWeekend(cursor)) { cursor = addDays(cursor, -1); continue; }
    const ds = dateStr(cursor);
    const cal = calendarDays[ds];
    if (cal && cal.capacity === 0) { cursor = addDays(cursor, -1); continue; }
    if (startOn && cursor < startOn) break;
    windowDays.unshift({ date: ds, capacity: cal?.capacity ?? 1 });
    cursor = addDays(cursor, -1);
  }

  if (windowDays.length === 0) return {};
  if (windowDays.length === 1) {
    return { [windowDays[0].date]: points * windowDays[0].capacity };
  }

  const weightedDays = windowDays.map((day, i) => ({
    ...day, rawWeight: (i + 1) * day.capacity,
  }));
  const totalWeight = weightedDays.reduce((sum, d) => sum + d.rawWeight, 0);
  if (totalWeight === 0) return {};

  const spread: Record<string, number> = {};
  for (const day of weightedDays) {
    spread[day.date] = (points * day.rawWeight) / totalWeight;
  }
  return spread;
}

function computeThroughput(completedTasks: any[], calendarDays: Record<string, any>) {
  const t = today();
  const weeks: { start: string; end: string; weight: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const weekEnd = addDays(t, -(i * 7) - 1);
    const weekStart = addDays(weekEnd, -6);
    weeks.push({ start: dateStr(weekStart), end: dateStr(weekEnd), weight: CONFIG.throughputWeights[i] });
  }

  let weightedSum = 0, weightSum = 0;
  const weekDetails: any[] = [];

  for (const week of weeks) {
    let ptoDays = 0;
    let current = parseDate(week.start)!;
    const end = parseDate(week.end)!;
    while (current <= end) {
      if (!isWeekend(current)) {
        const cal = calendarDays[dateStr(current)];
        if (cal && cal.capacity === 0) ptoDays++;
      }
      current = addDays(current, 1);
    }
    if (ptoDays >= 4) {
      weekDetails.push({ ...week, points: 0, ptoDays, excluded: true });
      continue;
    }
    const weekPoints = completedTasks
      .filter((t: any) => {
        if (!t.completedAt) return false;
        const completedDate = t.completedAt.split("T")[0];
        return completedDate >= week.start && completedDate <= week.end;
      })
      .reduce((sum: number, t: any) => sum + t.effortPoints, 0);

    weightedSum += weekPoints * week.weight;
    weightSum += week.weight;
    weekDetails.push({ ...week, points: weekPoints, ptoDays, excluded: false });
  }

  const avgThroughput = weightSum > 0 ? weightedSum / weightSum : 0;
  return { avgThroughput: Math.round(avgThroughput * 10) / 10, weekDetails };
}

function computeMetrics(tasks: any[], throughputData: any) {
  const t = today();
  const windowStart = nextWorkingDay(t);
  const windowEnd = addWorkingDays(windowStart, CONFIG.activeWindowDays - 1);
  const todayStr = dateStr(windowStart);
  const windowEndStr = dateStr(windowEnd);
  const overdueStart = subtractWorkingDays(windowStart, CONFIG.overdueWindowDays);
  const overdueStartStr = dateStr(overdueStart);

  const activeTasks = tasks.filter((t: any) => t.statusGroup === "Working" && t.dueOn && t.dueOn >= todayStr && t.dueOn <= windowEndStr);
  const activePoints = activeTasks.reduce((s: number, t: any) => s + t.effortPoints, 0);

  const overdueTasks = tasks.filter((t: any) => t.statusGroup === "Working" && t.dueOn && t.dueOn < todayStr && t.dueOn >= overdueStartStr);
  const overduePoints = overdueTasks.reduce((s: number, t: any) => s + t.effortPoints, 0);

  const staleOverdueTasks = tasks.filter((t: any) => t.statusGroup === "Working" && t.dueOn && t.dueOn < overdueStartStr);
  const staleOverduePoints = staleOverdueTasks.reduce((s: number, t: any) => s + t.effortPoints, 0);

  const unscopedTasks = activeTasks.filter((t: any) => t.effortPoints === 0);
  const blockedTasks = tasks.filter((t: any) => t.statusGroup === "Blocked" && !t.completed);
  const reviewTasks = tasks.filter((t: any) => t.statusGroup === "Review" && !t.completed);

  const avgThroughput = throughputData.avgThroughput;
  const totalLoad = activePoints + overduePoints;
  const triWeekCapacity = avgThroughput * 3;
  const loadRatio = triWeekCapacity > 0 ? Math.round((totalLoad / triWeekCapacity) * 100) / 100 : null;

  let signal = "Optimal";
  if (loadRatio !== null) {
    if (loadRatio < CONFIG.thresholds.underutilized) signal = "Underutilized";
    else if (loadRatio > CONFIG.thresholds.overloaded) signal = "Overloaded";
  }

  return {
    activeLoad: { tasks: activeTasks.length, points: activePoints },
    overdue: { tasks: overdueTasks.length, points: overduePoints },
    staleOverdue: { tasks: staleOverdueTasks.length, points: staleOverduePoints },
    unscoped: { tasks: unscopedTasks.length },
    blocked: { tasks: blockedTasks.length },
    review: { tasks: reviewTasks.length },
    loadRatio: { ratio: loadRatio, totalLoad, triWeekCapacity, avgThroughput, signal },
    window: { overdueStart: overdueStartStr, activeStart: todayStr, activeEnd: windowEndStr },
  };
}

function computeDailyChart(tasks: any[], calendarDays: Record<string, any>) {
  const t = today();
  const todayStr = dateStr(t);
  const chartStart = subtractWorkingDays(t, CONFIG.chartWindowWorkingDays);
  const chartEnd = addWorkingDays(t, CONFIG.chartWindowWorkingDays);

  const workingTasks = tasks.filter((t: any) => t.statusGroup === "Working" && !t.completed && t.dueOn);

  const dailyPoints: Record<string, { workload: number; tasks: string[] }> = {};
  let current = new Date(chartStart);
  while (current <= chartEnd) {
    if (!isWeekend(current)) dailyPoints[dateStr(current)] = { workload: 0, tasks: [] };
    current = addDays(current, 1);
  }

  for (const task of workingTasks) {
    const spread = computeDailySpread(task, calendarDays);
    for (const [date, pts] of Object.entries(spread)) {
      if (dailyPoints[date]) {
        dailyPoints[date].workload += pts;
        dailyPoints[date].tasks.push(task.name);
      }
    }
  }

  const chartData: any[] = [];
  current = new Date(chartStart);
  while (current <= chartEnd) {
    const ds = dateStr(current);
    if (!isWeekend(current)) {
      const points = dailyPoints[ds]?.workload || 0;
      const roundedPts = Math.round(points * 100) / 100;
      const cal = calendarDays[ds];
      const isOverdue = ds < todayStr && points > 0;
      let barColor = "light";
      if (roundedPts > CONFIG.thresholds.dailyModerate) barColor = "heavy";
      else if (roundedPts > CONFIG.thresholds.dailyLight) barColor = "moderate";
      if (isOverdue) barColor = "overdue";
      chartData.push({
        date: ds, points: roundedPts, barColor, isToday: ds === todayStr,
        calendar: cal ? { type: cal.type, color: cal.color, capacity: cal.capacity } : null,
      });
    }
    current = addDays(current, 1);
  }

  const chartStartStr = dateStr(chartStart);
  const beyondChartOverdue = workingTasks.filter((t: any) => t.dueOn && t.dueOn < chartStartStr);
  const backlogPoints = beyondChartOverdue.reduce((s: number, t: any) => s + t.effortPoints, 0);

  return { days: chartData, backlog: { tasks: beyondChartOverdue.length, points: backlogPoints } };
}

function buildTaskList(tasks: any[]) {
  const todayStr = dateStr(today());
  return {
    overdue: tasks.filter((t: any) => t.statusGroup === "Working" && t.dueOn && t.dueOn < todayStr && !t.completed).sort((a: any, b: any) => a.dueOn.localeCompare(b.dueOn)),
    working: tasks.filter((t: any) => t.statusGroup === "Working" && t.dueOn && t.dueOn >= todayStr && !t.completed && t.effortPoints > 0).sort((a: any, b: any) => a.dueOn.localeCompare(b.dueOn)),
    blocked: tasks.filter((t: any) => t.statusGroup === "Blocked" && !t.completed).sort((a: any, b: any) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999")),
    unscoped: tasks.filter((t: any) => t.statusGroup === "Working" && !t.completed && t.effortPoints === 0).sort((a: any, b: any) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999")),
  };
}

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================
export interface SyncAnalyst {
  gid: string
  name: string
  pod?: string
  status?: string
  email?: string
  clients?: string[]
}

export interface SyncWorkspace {
  workspaceGid: string
  standUpProjectGid: string
  calendarProjectGid: string
}

export async function runSync(pat: string, analysts?: SyncAnalyst[], workspace?: SyncWorkspace) {
  // Override CONFIG GIDs with per-workspace values when provided
  if (workspace) {
    CONFIG.workspace = workspace.workspaceGid
    CONFIG.projects.standUp = workspace.standUpProjectGid
    CONFIG.projects.calendar = workspace.calendarProjectGid
  }
  const analystList: SyncAnalyst[] = analysts || CONFIG.analysts;
  const calEvents = await fetchCalendarEvents(pat);
  const analystGids = analystList.map(a => a.gid);
  const calendarMap = buildCalendarMap(calEvents, analystGids);

  const results: Record<string, any> = {};

  for (const analyst of analystList) {
    const rawTasks = await fetchAnalystTasks(analyst.gid, pat);
    const tasks = rawTasks.map(parseTask);
    const calDays = calendarMap[analyst.gid] || {};

    const completedTasks = tasks.filter((t: any) => t.statusGroup === "Done");
    const throughput = computeThroughput(completedTasks, calDays);
    const metrics = computeMetrics(tasks, throughput);
    const chart = computeDailyChart(tasks, calDays);
    const taskList = buildTaskList(tasks);

    const todayStr = dateStr(today());
    const threeWeeksOut = dateStr(addDays(today(), 21));
    const upcomingPTO = Object.entries(calDays)
      .filter(([d, v]) => d >= todayStr && d <= threeWeeksOut && v.capacity === 0)
      .map(([d, v]) => ({ date: d, type: v.type }));

    results[analyst.gid] = {
      analyst: analyst.name,
      pod: analyst.pod || "pod-3",
      status: analyst.status || "active",
      email: analyst.email || "",
      clients: analyst.clients || [],
      metrics, throughput,
      chart, taskList, upcomingPTO, calendarDays: calDays,
    };
  }

  return {
    data: results,
    syncedAt: new Date().toISOString(),
    version: "v3",
  };
}
