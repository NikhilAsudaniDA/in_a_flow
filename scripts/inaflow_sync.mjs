// inaflow_sync.mjs — InAFlow Data Sync & Computation Engine
// Run: $env:ASANA_PAT="your_token"; node inaflow_sync.mjs

const PAT = process.env.ASANA_PAT;
if (!PAT) { console.error("Set ASANA_PAT env var"); process.exit(1); }

// ============================================================
// CONFIG — All GIDs and mappings from our finalized config
// ============================================================
const CONFIG = {
  workspace: "16282293647760",
  projects: {
    standUp: "1204969864314028",   // Pod 3 Stand Up
    calendar: "1207246447954463",  // Pod 3 Calendar
  },
  analysts: [
    { gid: "1207090544588174", name: "Nikhil Asudani" },
    // { gid: "1209071959445400", name: "Jinay Keniya" },   // uncomment when ready
    // { gid: "1204806986130866", name: "Jai Khurana" },     // uncomment when ready
  ],
  fields: {
    effortLevel: "1206065778986020",
    status: "1206065778986026",
    calendarColor: "1202123315418041",
  },
  effortPoints: {
    "1206065778986021": 1,   // Low effort
    "1206065778986022": 3,   // Medium effort
    "1206065778986023": 5,   // High effort
    "1206065778986024": 0,   // Need to scope
  },
  statusGroups: {
    "1207515172179334": "Working",   // Acknowledged
    "1207515172179335": "Working",   // In Progress
    "1206065778986028": "Working",   // Ongoing
    "1206958866164775": "Working",   // Support
    "1207064686450636": "Working",   // Any Updates?
    "1206065778986029": "Working",   // Need More Info
    "1207532336387944": "Working",   // Discuss
    "1207064686450642": "Working",   // In QA
    "1207515172179347": "Blocked",   // On Deck
    "1208158822083804": "Blocked",   // Pending Details from Client
    "1206301625857858": "Blocked",   // On Hold
    "1213814052615258": "Blocked",   // Awaiting response from another BU
    "1206065778986030": "Review",    // Ready for Review
    "1206337349568851": "Done",      // Complete
  },
  calendarCapacity: {
    "PTO": 0, "VTO": 0, "Holiday": 0, "Floater": 0,
    "Appointment": 0.5,
    "QBR": 1, "Birthday": 1, "Event": 1, "Work Anniversary": 1,
  },
  thresholds: {
    underutilized: 0.6,
    overloaded: 1.1,
    dailyLight: 2,
    dailyModerate: 4,
    // 5+ = heavy
  },
  throughputWeights: [1.0, 0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3],
  activeWindowDays: 14,
  chartWindowDays: 15, // -15 to +15
};

// ============================================================
// ASANA API HELPERS
// ============================================================
const headers = { "Authorization": `Bearer ${PAT}`, "Accept": "application/json" };

async function asanaGet(path) {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asana API ${res.status}: ${err}`);
  }
  return (await res.json()).data;
}

async function asanaGetAll(path) {
  let all = [];
  let url = `https://app.asana.com/api/1.0${path}`;
  while (url) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (json.data) all.push(...json.data);
    url = json.next_page?.uri || null;
    if (url) url = `https://app.asana.com/api/1.0${url}`;
  }
  return all;
}

// ============================================================
// DATE HELPERS
// ============================================================
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

// Get the next working day (skip weekends)
function nextWorkingDay(d) {
  let current = new Date(d);
  if (isWeekend(current)) {
    while (isWeekend(current)) current = addDays(current, 1);
  }
  return current;
}

// Add N working days to a date (skips weekends)
function addWorkingDays(date, n) {
  let current = new Date(date);
  let count = 0;
  while (count < n) {
    current = addDays(current, 1);
    if (!isWeekend(current)) count++;
  }
  return current;
}

function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start of week
  date.setDate(date.getDate() + diff);
  return dateStr(date);
}

function getWorkingDays(startDate, endDate, ptoDays) {
  const days = [];
  let current = new Date(startDate);
  while (current <= endDate) {
    if (!isWeekend(current)) {
      days.push(dateStr(current));
    }
    current = addDays(current, 1);
  }
  return days;
}

// ============================================================
// STEP 1: FETCH TASKS FOR ALL ANALYSTS
// ============================================================
async function fetchAnalystTasks(analystGid) {
  // Fetch incomplete tasks
  const incompleteTasks = await asanaGetAll(
    `/tasks?assignee=${analystGid}&workspace=${CONFIG.workspace}&completed_since=now&limit=100&opt_fields=name,due_on,start_on,completed,completed_at,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name,memberships.project.gid,memberships.section.name`
  );

  // Fetch completed tasks from last 10 weeks (for throughput)
  const tenWeeksAgo = addDays(today(), -70);
  const completedTasks = await asanaGetAll(
    `/tasks?assignee=${analystGid}&workspace=${CONFIG.workspace}&completed_since=${dateStr(tenWeeksAgo)}&limit=100&opt_fields=name,due_on,start_on,completed,completed_at,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name,memberships.project.gid,memberships.section.name`
  );

  // Filter completed tasks (completed_since returns tasks completed AFTER that date, plus incomplete ones)
  const onlyCompleted = completedTasks.filter(t => t.completed);

  // Merge and deduplicate
  const allTasks = [...incompleteTasks, ...onlyCompleted];
  const seen = new Set();
  const unique = allTasks.filter(t => {
    if (seen.has(t.gid)) return false;
    seen.add(t.gid);
    return true;
  });

  // Filter to only tasks that belong to Pod 3 Stand Up
  return unique.filter(t =>
    t.memberships?.some(m => m.project?.gid === CONFIG.projects.standUp)
  );
}

// ============================================================
// STEP 2: FETCH CALENDAR EVENTS
// ============================================================
async function fetchCalendarEvents() {
  const events = await asanaGetAll(
    `/tasks?project=${CONFIG.projects.calendar}&completed_since=now&limit=100&opt_fields=name,due_on,start_on,assignee.gid,assignee.name,custom_fields.gid,custom_fields.enum_value.name`
  );

  // Also get recently completed calendar events
  const threeMonthsAgo = addDays(today(), -90);
  const pastEvents = await asanaGetAll(
    `/tasks?project=${CONFIG.projects.calendar}&completed_since=${dateStr(threeMonthsAgo)}&limit=100&opt_fields=name,due_on,start_on,assignee.gid,assignee.name,custom_fields.gid,custom_fields.enum_value.name`
  );

  const all = [...events, ...pastEvents];
  const seen = new Set();
  return all.filter(e => {
    if (seen.has(e.gid)) return false;
    seen.add(e.gid);
    return true;
  });
}

// ============================================================
// STEP 3: PARSE TASK DATA
// ============================================================
function parseTask(task) {
  let effortGid = null;
  let statusGid = null;
  let effortName = null;
  let statusName = null;

  for (const cf of (task.custom_fields || [])) {
    if (cf.gid === CONFIG.fields.effortLevel && cf.enum_value) {
      effortGid = cf.enum_value.gid;
      effortName = cf.enum_value.name;
    }
    if (cf.gid === CONFIG.fields.status && cf.enum_value) {
      statusGid = cf.enum_value.gid;
      statusName = cf.enum_value.name;
    }
  }

  // If completed task has no effort level, default to Medium (3 pts)
  // TODO: Remove this fallback once the "clear fields on complete" rule is disabled in Asana
  let points;
  if (effortGid) {
    points = CONFIG.effortPoints[effortGid] ?? 0;
  } else if (task.completed) {
    points = 3; // Default completed tasks to Medium
  } else {
    points = 0;
  }
  const group = statusGid ? (CONFIG.statusGroups[statusGid] ?? "Unknown") : "Unknown";

  // Section name from Pod 3 Stand Up membership (= client name)
  const podMembership = task.memberships?.find(m => m.project?.gid === CONFIG.projects.standUp);
  const client = podMembership?.section?.name || "Unknown";

  return {
    gid: task.gid,
    name: task.name,
    dueOn: task.due_on,
    startOn: task.start_on,
    completed: task.completed,
    completedAt: task.completed_at,
    effortName: effortName || "Need to scope",
    effortPoints: points,
    statusName: statusName || "No status",
    statusGroup: task.completed ? "Done" : group,
    client,
  };
}

// ============================================================
// STEP 4: PARSE CALENDAR EVENTS → PTO MAP
// ============================================================
function buildCalendarMap(events, analystGids) {
  // Returns: { analystGid: { "2026-04-21": { type: "PTO", capacity: 0 }, ... } }
  const map = {};
  for (const gid of analystGids) map[gid] = {};

  for (const event of events) {
    const assigneeGid = event.assignee?.gid;
    if (!assigneeGid || !map[assigneeGid]) continue;

    let colorName = null;
    for (const cf of (event.custom_fields || [])) {
      if (cf.gid === CONFIG.fields.calendarColor && cf.enum_value) {
        colorName = cf.enum_value.name;
      }
    }
    if (!colorName) continue;

    // Match calendar color to capacity
    let capacity = 1;
    let matchedType = colorName;
    for (const [key, cap] of Object.entries(CONFIG.calendarCapacity)) {
      if (colorName.toLowerCase().includes(key.toLowerCase())) {
        capacity = cap;
        matchedType = key;
        break;
      }
    }

    // Expand date range
    const start = parseDate(event.start_on || event.due_on);
    const end = parseDate(event.due_on);
    if (!end) continue;
    const s = start || end;

    let current = new Date(s);
    while (current <= end) {
      const ds = dateStr(current);
      map[assigneeGid][ds] = { type: matchedType, color: colorName, capacity };
      current = addDays(current, 1);
    }
  }

  return map;
}

// ============================================================
// STEP 5: COMPUTE EFFORT SPREAD
// ============================================================
function computeDailySpread(task, calendarDays) {
  // calendarDays = { "2026-04-21": { capacity: 0 }, ... } for this analyst
  const dueOn = parseDate(task.dueOn);
  if (!dueOn) return {}; // No due date = ignore

  const startOn = parseDate(task.startOn) || dueOn; // No start = single day
  const points = task.effortPoints;
  if (points === 0) return {}; // Unscoped = no spread

  // Get working days in range, excluding weekends
  const workingDays = [];
  let current = new Date(startOn);
  while (current <= dueOn) {
    if (!isWeekend(current)) {
      const ds = dateStr(current);
      const cal = calendarDays[ds];
      // Skip full PTO days (capacity = 0)
      if (!cal || cal.capacity > 0) {
        workingDays.push({ date: ds, capacity: cal?.capacity ?? 1 });
      }
    }
    current = addDays(current, 1);
  }

  if (workingDays.length === 0) return {};

  // Weighted spread: more points near due date
  // Weight increases linearly: day 1 gets weight 1, day 2 gets weight 2, etc.
  // So last day (closest to due) gets highest weight
  const n = workingDays.length;

  if (n === 1) {
    // Single day task — all points on that day
    const day = workingDays[0];
    return { [day.date]: points * day.capacity };
  }

  // Calculate raw weights (linear ramp: 1, 2, 3, ..., n)
  // Adjusted for capacity (appointment days get half weight)
  const weightedDays = workingDays.map((day, i) => ({
    ...day,
    rawWeight: (i + 1) * day.capacity,
  }));

  const totalWeight = weightedDays.reduce((sum, d) => sum + d.rawWeight, 0);
  if (totalWeight === 0) return {};

  // Distribute points proportionally
  const spread = {};
  for (const day of weightedDays) {
    spread[day.date] = (points * day.rawWeight) / totalWeight;
  }

  return spread;
}

// ============================================================
// STEP 6: COMPUTE THROUGHPUT
// ============================================================
function computeThroughput(completedTasks, calendarDays) {
  const t = today();
  const weeks = [];

  // Build 8 weeks going backwards
  for (let i = 0; i < 8; i++) {
    const weekEnd = addDays(t, -(i * 7) - 1); // End of previous week(s)
    const weekStart = addDays(weekEnd, -6);
    weeks.push({
      start: dateStr(weekStart),
      end: dateStr(weekEnd),
      weight: CONFIG.throughputWeights[i],
    });
  }

  let weightedSum = 0;
  let weightSum = 0;
  const weekDetails = [];

  for (const week of weeks) {
    // Count PTO days in this week
    let ptoDays = 0;
    let current = parseDate(week.start);
    const end = parseDate(week.end);
    while (current <= end) {
      if (!isWeekend(current)) {
        const cal = calendarDays[dateStr(current)];
        if (cal && cal.capacity === 0) ptoDays++;
      }
      current = addDays(current, 1);
    }

    // Skip week if 4-5 PTO days
    if (ptoDays >= 4) {
      weekDetails.push({ ...week, points: 0, ptoDays, excluded: true });
      continue;
    }

    // Sum points of tasks completed in this week
    const weekPoints = completedTasks
      .filter(t => {
        if (!t.completedAt) return false;
        const completedDate = t.completedAt.split("T")[0];
        return completedDate >= week.start && completedDate <= week.end;
      })
      .reduce((sum, t) => sum + t.effortPoints, 0);

    weightedSum += weekPoints * week.weight;
    weightSum += week.weight;
    weekDetails.push({ ...week, points: weekPoints, ptoDays, excluded: false });
  }

  const avgThroughput = weightSum > 0 ? weightedSum / weightSum : 0;

  return { avgThroughput: Math.round(avgThroughput * 10) / 10, weekDetails };
}

// ============================================================
// STEP 7: COMPUTE METRIC CARDS
// ============================================================
function computeMetrics(tasks, throughputData) {
  const t = today();
  // Start from next working day (if today is weekend)
  const windowStart = nextWorkingDay(t);
  // 14 WORKING days, not calendar days
  const windowEnd = addWorkingDays(windowStart, CONFIG.activeWindowDays - 1);
  const todayStr = dateStr(windowStart);
  const windowEndStr = dateStr(windowEnd);

  // Active = Working + due within 14 working days
  const activeTasks = tasks.filter(t =>
    t.statusGroup === "Working" &&
    t.dueOn &&
    t.dueOn >= todayStr &&
    t.dueOn <= windowEndStr
  );
  const activePoints = activeTasks.reduce((s, t) => s + t.effortPoints, 0);

  // Overdue = Working + due before today
  const overdueTasks = tasks.filter(t =>
    t.statusGroup === "Working" &&
    t.dueOn &&
    t.dueOn < todayStr
  );
  const overduePoints = overdueTasks.reduce((s, t) => s + t.effortPoints, 0);

  // Unscoped = Working + due within window + effort is 0 (need to scope or blank)
  const unscopedTasks = activeTasks.filter(t => t.effortPoints === 0);

  // Blocked
  const blockedTasks = tasks.filter(t => t.statusGroup === "Blocked" && !t.completed);

  // Load ratio = (active pts / 2) / avg weekly throughput
  const avgThroughput = throughputData.avgThroughput;
  const loadRatio = avgThroughput > 0
    ? Math.round(((activePoints / 2) / avgThroughput) * 100) / 100
    : null;

  // Signal
  let signal = "Optimal";
  if (loadRatio !== null) {
    if (loadRatio < CONFIG.thresholds.underutilized) signal = "Underutilized";
    else if (loadRatio > CONFIG.thresholds.overloaded) signal = "Overloaded";
  }

  // Review tasks (separate count for visibility)
  const reviewTasks = tasks.filter(t => t.statusGroup === "Review" && !t.completed);

  return {
    activeLoad: { tasks: activeTasks.length, points: activePoints },
    overdue: { tasks: overdueTasks.length, points: overduePoints },
    unscoped: { tasks: unscopedTasks.length },
    blocked: { tasks: blockedTasks.length },
    review: { tasks: reviewTasks.length },
    loadRatio: { ratio: loadRatio, avgThroughput, signal },
    window: { start: todayStr, end: windowEndStr },
  };
}

// ============================================================
// STEP 8: COMPUTE DAILY LOAD CHART
// ============================================================
function computeDailyChart(tasks, calendarDays) {
  const t = today();
  const chartStart = addDays(t, -CONFIG.chartWindowDays);
  const chartEnd = addDays(t, CONFIG.chartWindowDays);
  const todayStr = dateStr(t);

  // Compute spread for all working/overdue tasks
  const workingTasks = tasks.filter(t =>
    t.statusGroup === "Working" && !t.completed && t.dueOn
  );

  // Accumulate daily points
  const dailyPoints = {};
  let current = new Date(chartStart);
  while (current <= chartEnd) {
    if (!isWeekend(current)) {
      dailyPoints[dateStr(current)] = { workload: 0, tasks: [] };
    }
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

  // Build chart data
  const chartData = [];
  current = new Date(chartStart);
  while (current <= chartEnd) {
    const ds = dateStr(current);
    if (!isWeekend(current)) {
      const points = dailyPoints[ds]?.workload || 0;
      const roundedPts = Math.round(points * 100) / 100;
      const cal = calendarDays[ds];
      const isOverdue = ds < todayStr && points > 0;

      let barColor = "light"; // 0-2
      if (roundedPts > CONFIG.thresholds.dailyModerate) barColor = "heavy"; // 5+
      else if (roundedPts > CONFIG.thresholds.dailyLight) barColor = "moderate"; // 3-4
      if (isOverdue) barColor = "overdue";

      chartData.push({
        date: ds,
        points: roundedPts,
        barColor,
        isToday: ds === todayStr,
        calendar: cal ? { type: cal.type, color: cal.color, capacity: cal.capacity } : null,
      });
    }
    current = addDays(current, 1);
  }

  // Backlog note: overdue tasks beyond 15 days
  const beyondChartOverdue = workingTasks.filter(t =>
    t.dueOn && t.dueOn < dateStr(chartStart)
  );
  const backlogPoints = beyondChartOverdue.reduce((s, t) => s + t.effortPoints, 0);

  return {
    days: chartData,
    backlog: { tasks: beyondChartOverdue.length, points: backlogPoints },
  };
}

// ============================================================
// STEP 9: BUILD TASK LIST
// ============================================================
function buildTaskList(tasks) {
  const t = today();
  const todayStr = dateStr(t);

  const overdue = tasks
    .filter(t => t.statusGroup === "Working" && t.dueOn && t.dueOn < todayStr && !t.completed)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn)); // Most overdue first

  const working = tasks
    .filter(t => t.statusGroup === "Working" && t.dueOn && t.dueOn >= todayStr && !t.completed && t.effortPoints > 0)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  const blocked = tasks
    .filter(t => t.statusGroup === "Blocked" && !t.completed)
    .sort((a, b) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999"));

  const unscoped = tasks
    .filter(t => t.statusGroup === "Working" && !t.completed && t.effortPoints === 0)
    .sort((a, b) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999"));

  return { overdue, working, blocked, unscoped };
}

// ============================================================
// MAIN — Run everything
// ============================================================
async function main() {
  console.log("🔄 InAFlow Sync starting...\n");

  // 1. Fetch calendar events
  console.log("📅 Fetching calendar events...");
  const calEvents = await fetchCalendarEvents();
  console.log(`   Found ${calEvents.length} calendar events`);

  const analystGids = CONFIG.analysts.map(a => a.gid);
  const calendarMap = buildCalendarMap(calEvents, analystGids);

  // 2. Process each analyst
  const results = {};

  for (const analyst of CONFIG.analysts) {
    console.log(`\n👤 Processing ${analyst.name}...`);

    // Fetch tasks
    console.log("   Fetching tasks...");
    const rawTasks = await fetchAnalystTasks(analyst.gid);
    console.log(`   Found ${rawTasks.length} tasks`);

    // Parse
    const tasks = rawTasks.map(parseTask);
    const calDays = calendarMap[analyst.gid] || {};

    // Throughput
    const completedTasks = tasks.filter(t => t.statusGroup === "Done");
    console.log(`   Completed tasks (last 10 weeks): ${completedTasks.length}`);
    const throughput = computeThroughput(completedTasks, calDays);
    console.log(`   Avg throughput: ${throughput.avgThroughput} pts/wk`);

    // Metrics
    const metrics = computeMetrics(tasks, throughput);
    console.log(`   Window: ${metrics.window.start} → ${metrics.window.end} (14 working days)`);
    console.log(`   Active: ${metrics.activeLoad.tasks} tasks (${metrics.activeLoad.points} pts)`);
    console.log(`   Overdue: ${metrics.overdue.tasks} tasks (${metrics.overdue.points} pts)`);
    console.log(`   Unscoped: ${metrics.unscoped.tasks} tasks`);
    console.log(`   Blocked: ${metrics.blocked.tasks} tasks`);
    console.log(`   In Review: ${metrics.review.tasks} tasks`);
    console.log(`   Load ratio: ${metrics.loadRatio.ratio}x → ${metrics.loadRatio.signal}`);

    // Daily chart
    const chart = computeDailyChart(tasks, calDays);

    // Task list
    const taskList = buildTaskList(tasks);

    // Upcoming PTO
    const todayStr = dateStr(today());
    const twoWeeksOut = dateStr(addDays(today(), 14));
    const upcomingPTO = Object.entries(calDays)
      .filter(([d, v]) => d >= todayStr && d <= twoWeeksOut && v.capacity === 0)
      .map(([d, v]) => ({ date: d, type: v.type }));

    results[analyst.gid] = {
      analyst: analyst.name,
      metrics,
      throughput,
      chart,
      taskList,
      upcomingPTO,
      calendarDays: calDays,
    };
  }

  // 3. Output
  console.log("\n\n" + "=".repeat(60));
  console.log("DASHBOARD SUMMARY");
  console.log("=".repeat(60));

  for (const analyst of CONFIG.analysts) {
    const r = results[analyst.gid];
    console.log(`\n${"─".repeat(50)}`);
    console.log(`${r.analyst}`);
    console.log(`${"─".repeat(50)}`);
    console.log(`  Active Load:  ${r.metrics.activeLoad.tasks} tasks | ${r.metrics.activeLoad.points} pts`);
    console.log(`  Overdue:      ${r.metrics.overdue.tasks} tasks | ${r.metrics.overdue.points} pts`);
    console.log(`  Unscoped:     ${r.metrics.unscoped.tasks} tasks`);
    console.log(`  Blocked:      ${r.metrics.blocked.tasks} tasks`);
    console.log(`  Throughput:   ${r.throughput.avgThroughput} pts/wk`);
    console.log(`  Load Ratio:   ${r.metrics.loadRatio.ratio}x → ${r.metrics.loadRatio.signal}`);
    if (r.upcomingPTO.length > 0) {
      console.log(`  Upcoming PTO: ${r.upcomingPTO.map(p => `${p.date} (${p.type})`).join(", ")}`);
    }

    // Throughput week breakdown
    console.log(`\n  Throughput breakdown (last 8 weeks):`);
    for (const w of r.throughput.weekDetails) {
      const mark = w.excluded ? " [EXCLUDED - PTO]" : "";
      console.log(`    ${w.start} → ${w.end}: ${w.points} pts (weight: ${w.weight})${mark}`);
    }

    // Chart preview (next 5 working days)
    const futureDays = r.chart.days.filter(d => d.date >= dateStr(today())).slice(0, 5);
    console.log(`\n  Daily load (next 5 working days):`);
    for (const d of futureDays) {
      const cal = d.calendar ? ` [${d.calendar.type}]` : "";
      const bar = `${"█".repeat(Math.round(d.points))}${"░".repeat(Math.max(0, 8 - Math.round(d.points)))}`;
      console.log(`    ${d.date}: ${bar} ${d.points} pts (${d.barColor})${cal}${d.isToday ? " ← TODAY" : ""}`);
    }

    if (r.chart.backlog.tasks > 0) {
      console.log(`\n  ⚠ ${r.chart.backlog.tasks} tasks overdue beyond 15 days (${r.chart.backlog.points} pts not shown)`);
    }
  }

  // Save full JSON to the lib folder so the frontend can read it instantly
  const fs = await import("fs");
  
  // Create an absolute path that resolves to the lib directory relative to this script
  const path = await import("path");
  const __dirname = new URL(".", import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'); 
  const outPath = path.join(__dirname, "..", "lib", "inaflow_output.json");
  
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n\n✅ Full JSON saved to ${outPath}`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
