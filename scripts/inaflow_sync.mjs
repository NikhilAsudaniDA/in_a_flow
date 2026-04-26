// inaflow_sync.mjs — InAFlow v3 Data Sync & Computation Engine
// Run: $env:ASANA_PAT="your_token"; node scripts/inaflow_sync.mjs

const PAT = process.env.ASANA_PAT;
if (!PAT) { console.error("Set ASANA_PAT env var"); process.exit(1); }

// ============================================================
// CONFIG — All GIDs and mappings (v3 finalized)
// ============================================================
const CONFIG = {
  workspace: "16282293647760",
  projects: {
    standUp: "1204969864314028",   // Pod 3 Stand Up
    calendar: "1207246447954463",  // Pod 3 Calendar
  },
  analysts: [
    { gid: "1207090544588174", name: "Nikhil Asudani" },
    { gid: "1209071959445400", name: "Jinay Keniya" },
    // { gid: "1204806986130866", name: "Jai Khurana" },     // uncomment when ready
  ],
  fields: {
    effortLevel: "1206065778986020",
    status: "1206065778986026",
    calendarColor: "1202123315418041",
  },
  // v3: 1, 3, 6, 12 — doubling pattern (Low→Med ~3x, Med→High 2x, High→VHigh 2x)
  effortPoints: {
    "1206065778986021": 1,    // Low effort
    "1206065778986022": 3,    // Medium effort
    "1206065778986023": 6,    // High effort
    "1214143966797916": 12,   // Very High
    "1206065778986024": 0,    // Need to scope
  },
  // v3: Dynamic spread windows (working days before due, inclusive of due date)
  // Logic: analysts do work in the last few days before due, not spread across weeks
  effortSpreadDays: {
    1:  1,   // Low → due date only
    3:  3,   // Medium → last 3 working days
    6:  3,   // High → last 3 working days
    12: 4,   // Very High → last 4 working days
    0:  0,   // Need to scope → no spread
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
  // v3: Floater removed (doesn't exist), QR/SAR at 50%
  calendarCapacity: {
    "PTO": 0, "VTO": 0, "Holiday": 0,
    "Appointment": 0.5,   // matches "Appointments, Misc."
    "QR": 0.5,            // matches "QR/SAR" — analyst is busy with review
    "Birthday": 1, "Event": 1, "Work Anniversary": 1,
  },
  thresholds: {
    underutilized: 0.6,
    overloaded: 1.1,
    dailyLight: 3,
    dailyModerate: 6,
    // 7+ = heavy (adjusted for new point scale)
  },
  throughputWeights: [1.0, 0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3],
  // v3: 15 working days (3 weeks Mon-Fri) for both active and overdue windows
  activeWindowDays: 15,
  overdueWindowDays: 15,
  // v3: chart shows 15 working days back + 15 forward = 30 working days total
  chartWindowWorkingDays: 15,
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

function nextWorkingDay(d) {
  let current = new Date(d);
  while (isWeekend(current)) current = addDays(current, 1);
  return current;
}

function prevWorkingDay(d) {
  let current = new Date(d);
  while (isWeekend(current)) current = addDays(current, -1);
  return current;
}

function addWorkingDays(date, n) {
  let current = new Date(date);
  let count = 0;
  while (count < n) {
    current = addDays(current, 1);
    if (!isWeekend(current)) count++;
  }
  return current;
}

function subtractWorkingDays(date, n) {
  let current = new Date(date);
  let count = 0;
  while (count < n) {
    current = addDays(current, -1);
    if (!isWeekend(current)) count++;
  }
  return current;
}

// ============================================================
// STEP 1: FETCH TASKS FOR ALL ANALYSTS
// ============================================================
async function fetchAnalystTasks(analystGid) {
  const incompleteTasks = await asanaGetAll(
    `/tasks?assignee=${analystGid}&workspace=${CONFIG.workspace}&completed_since=now&limit=100&opt_fields=name,due_on,start_on,completed,completed_at,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name,memberships.project.gid,memberships.section.name`
  );

  const tenWeeksAgo = addDays(today(), -70);
  const completedTasks = await asanaGetAll(
    `/tasks?assignee=${analystGid}&workspace=${CONFIG.workspace}&completed_since=${dateStr(tenWeeksAgo)}&limit=100&opt_fields=name,due_on,start_on,completed,completed_at,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name,memberships.project.gid,memberships.section.name`
  );

  const onlyCompleted = completedTasks.filter(t => t.completed);

  const allTasks = [...incompleteTasks, ...onlyCompleted];
  const seen = new Set();
  const unique = allTasks.filter(t => {
    if (seen.has(t.gid)) return false;
    seen.add(t.gid);
    return true;
  });

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

  let points;
  if (effortGid) {
    points = CONFIG.effortPoints[effortGid] ?? 0;
  } else if (task.completed) {
    points = 3; // Fallback for old completed tasks with cleared effort
  } else {
    points = 0;
  }
  const group = statusGid ? (CONFIG.statusGroups[statusGid] ?? "Unknown") : "Unknown";

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

    let capacity = 1;
    let matchedType = colorName;
    for (const [key, cap] of Object.entries(CONFIG.calendarCapacity)) {
      if (colorName.toLowerCase().includes(key.toLowerCase())) {
        capacity = cap;
        matchedType = key;
        break;
      }
    }

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
// STEP 5: COMPUTE EFFORT SPREAD (v3 — Dynamic Windows)
// ============================================================
function computeDailySpread(task, calendarDays) {
  const dueOn = parseDate(task.dueOn);
  if (!dueOn) return {};

  const points = task.effortPoints;
  if (points === 0) return {};

  // v3: Dynamic spread window based on effort level
  const spreadDays = CONFIG.effortSpreadDays[points] ?? 3;
  if (spreadDays === 0) return {};

  const startOn = parseDate(task.startOn);

  // Build the window: walk backward from due date collecting working days
  // Skip PTO days (capacity=0) — go further back to fill the window
  // Respect start date — don't go before it
  const windowDays = [];
  let cursor = new Date(dueOn);

  while (windowDays.length < spreadDays) {
    if (isWeekend(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    const ds = dateStr(cursor);
    const cal = calendarDays[ds];

    // Full PTO day — skip it, keep looking back
    if (cal && cal.capacity === 0) {
      cursor = addDays(cursor, -1);
      continue;
    }

    // Don't go before start date
    if (startOn && cursor < startOn) {
      break;
    }

    windowDays.unshift({ date: ds, capacity: cal?.capacity ?? 1 });
    cursor = addDays(cursor, -1);
  }

  if (windowDays.length === 0) return {};

  if (windowDays.length === 1) {
    const day = windowDays[0];
    return { [day.date]: points * day.capacity };
  }

  // Ramp weighting: linear increase toward due date
  const weightedDays = windowDays.map((day, i) => ({
    ...day,
    rawWeight: (i + 1) * day.capacity,
  }));

  const totalWeight = weightedDays.reduce((sum, d) => sum + d.rawWeight, 0);
  if (totalWeight === 0) return {};

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

  for (let i = 0; i < 8; i++) {
    const weekEnd = addDays(t, -(i * 7) - 1);
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

    if (ptoDays >= 4) {
      weekDetails.push({ ...week, points: 0, ptoDays, excluded: true });
      continue;
    }

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
// STEP 7: COMPUTE METRICS (v3 — 15-day windows, overdue in ratio)
// ============================================================
function computeMetrics(tasks, throughputData) {
  const t = today();
  const windowStart = nextWorkingDay(t);
  const windowEnd = addWorkingDays(windowStart, CONFIG.activeWindowDays - 1);
  const todayStr = dateStr(windowStart);
  const windowEndStr = dateStr(windowEnd);

  // v3: 15 working days backward for overdue
  const overdueStart = subtractWorkingDays(windowStart, CONFIG.overdueWindowDays);
  const overdueStartStr = dateStr(overdueStart);

  // Active = Working + due within next 15 working days
  const activeTasks = tasks.filter(t =>
    t.statusGroup === "Working" &&
    t.dueOn &&
    t.dueOn >= todayStr &&
    t.dueOn <= windowEndStr
  );
  const activePoints = activeTasks.reduce((s, t) => s + t.effortPoints, 0);

  // v3: Overdue within last 15 working days
  const overdueTasks = tasks.filter(t =>
    t.statusGroup === "Working" &&
    t.dueOn &&
    t.dueOn < todayStr &&
    t.dueOn >= overdueStartStr
  );
  const overduePoints = overdueTasks.reduce((s, t) => s + t.effortPoints, 0);

  // Stale overdue (>15 working days) — excluded from ratio
  const staleOverdueTasks = tasks.filter(t =>
    t.statusGroup === "Working" &&
    t.dueOn &&
    t.dueOn < overdueStartStr
  );
  const staleOverduePoints = staleOverdueTasks.reduce((s, t) => s + t.effortPoints, 0);

  // Unscoped = Working + due within active window + no effort
  const unscopedTasks = activeTasks.filter(t => t.effortPoints === 0);

  // Blocked
  const blockedTasks = tasks.filter(t => t.statusGroup === "Blocked" && !t.completed);

  // Review
  const reviewTasks = tasks.filter(t => t.statusGroup === "Review" && !t.completed);

  // v3: Load ratio = totalLoad / (avgThroughput × 3)
  const avgThroughput = throughputData.avgThroughput;
  const totalLoad = activePoints + overduePoints;
  const triWeekCapacity = avgThroughput * 3;
  const loadRatio = triWeekCapacity > 0
    ? Math.round((totalLoad / triWeekCapacity) * 100) / 100
    : null;

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
    window: {
      overdueStart: overdueStartStr,
      activeStart: todayStr,
      activeEnd: windowEndStr,
    },
  };
}

// ============================================================
// STEP 8: COMPUTE DAILY LOAD CHART (v3 — 30 working days)
// ============================================================
function computeDailyChart(tasks, calendarDays) {
  const t = today();
  const todayStr = dateStr(t);

  // v3: 15 working days back + 15 working days forward
  const chartStart = subtractWorkingDays(t, CONFIG.chartWindowWorkingDays);
  const chartEnd = addWorkingDays(t, CONFIG.chartWindowWorkingDays);

  const workingTasks = tasks.filter(t =>
    t.statusGroup === "Working" && !t.completed && t.dueOn
  );

  // Initialize daily points
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

  const chartData = [];
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
        date: ds,
        points: roundedPts,
        barColor,
        isToday: ds === todayStr,
        calendar: cal ? { type: cal.type, color: cal.color, capacity: cal.capacity } : null,
      });
    }
    current = addDays(current, 1);
  }

  const chartStartStr = dateStr(chartStart);
  const beyondChartOverdue = workingTasks.filter(t =>
    t.dueOn && t.dueOn < chartStartStr
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
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

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
// MAIN
// ============================================================
async function main() {
  console.log("🔄 InAFlow v3 Sync starting...\n");

  console.log("📅 Fetching calendar events...");
  const calEvents = await fetchCalendarEvents();
  console.log(`   Found ${calEvents.length} calendar events`);

  const analystGids = CONFIG.analysts.map(a => a.gid);
  const calendarMap = buildCalendarMap(calEvents, analystGids);

  const results = {};

  for (const analyst of CONFIG.analysts) {
    console.log(`\n👤 Processing ${analyst.name}...`);

    console.log("   Fetching tasks...");
    const rawTasks = await fetchAnalystTasks(analyst.gid);
    console.log(`   Found ${rawTasks.length} tasks`);

    const tasks = rawTasks.map(parseTask);
    const calDays = calendarMap[analyst.gid] || {};

    const completedTasks = tasks.filter(t => t.statusGroup === "Done");
    console.log(`   Completed tasks (last 10 weeks): ${completedTasks.length}`);
    const throughput = computeThroughput(completedTasks, calDays);
    console.log(`   Avg throughput: ${throughput.avgThroughput} pts/wk`);

    const metrics = computeMetrics(tasks, throughput);
    console.log(`   Active window: ${metrics.window.activeStart} → ${metrics.window.activeEnd} (15 working days)`);
    console.log(`   Overdue window: ${metrics.window.overdueStart} → ${metrics.window.activeStart}`);
    console.log(`   Active: ${metrics.activeLoad.tasks} tasks (${metrics.activeLoad.points} pts)`);
    console.log(`   Overdue (15d): ${metrics.overdue.tasks} tasks (${metrics.overdue.points} pts)`);
    if (metrics.staleOverdue.tasks > 0) {
      console.log(`   Stale overdue (>15d): ${metrics.staleOverdue.tasks} tasks (${metrics.staleOverdue.points} pts) [excluded from ratio]`);
    }
    console.log(`   Unscoped: ${metrics.unscoped.tasks} tasks`);
    console.log(`   Blocked: ${metrics.blocked.tasks} tasks`);
    console.log(`   In Review: ${metrics.review.tasks} tasks`);
    console.log(`   Total Load: ${metrics.loadRatio.totalLoad} pts | Capacity (3wk): ${metrics.loadRatio.triWeekCapacity} pts`);
    console.log(`   Load ratio: ${metrics.loadRatio.ratio}x → ${metrics.loadRatio.signal}`);

    const chart = computeDailyChart(tasks, calDays);
    const taskList = buildTaskList(tasks);

    const todayStr = dateStr(today());
    const threeWeeksOut = dateStr(addDays(today(), 21));
    const upcomingPTO = Object.entries(calDays)
      .filter(([d, v]) => d >= todayStr && d <= threeWeeksOut && v.capacity === 0)
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

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("DASHBOARD SUMMARY (v3)");
  console.log("=".repeat(60));

  for (const analyst of CONFIG.analysts) {
    const r = results[analyst.gid];
    console.log(`\n${"─".repeat(50)}`);
    console.log(`${r.analyst}`);
    console.log(`${"─".repeat(50)}`);
    console.log(`  Active Load:     ${r.metrics.activeLoad.tasks} tasks | ${r.metrics.activeLoad.points} pts (next 15 working days)`);
    console.log(`  Overdue:         ${r.metrics.overdue.tasks} tasks | ${r.metrics.overdue.points} pts (last 15 working days)`);
    if (r.metrics.staleOverdue.tasks > 0) {
      console.log(`  Stale (>15d):    ${r.metrics.staleOverdue.tasks} tasks | ${r.metrics.staleOverdue.points} pts [not in ratio]`);
    }
    console.log(`  Unscoped:        ${r.metrics.unscoped.tasks} tasks`);
    console.log(`  Blocked:         ${r.metrics.blocked.tasks} tasks`);
    console.log(`  In Review:       ${r.metrics.review.tasks} tasks`);
    console.log(`  Throughput:      ${r.throughput.avgThroughput} pts/wk`);
    console.log(`  Total Load:      ${r.metrics.loadRatio.totalLoad} pts`);
    console.log(`  3-Week Capacity: ${r.metrics.loadRatio.triWeekCapacity} pts`);
    console.log(`  Load Ratio:      ${r.metrics.loadRatio.ratio}x → ${r.metrics.loadRatio.signal}`);
    if (r.upcomingPTO.length > 0) {
      console.log(`  Upcoming PTO:    ${r.upcomingPTO.map(p => `${p.date} (${p.type})`).join(", ")}`);
    }

    console.log(`\n  Throughput breakdown (last 8 weeks):`);
    for (const w of r.throughput.weekDetails) {
      const mark = w.excluded ? " [EXCLUDED - PTO]" : "";
      console.log(`    ${w.start} → ${w.end}: ${w.points} pts (weight: ${w.weight})${mark}`);
    }

    const futureDays = r.chart.days.filter(d => d.date >= dateStr(today())).slice(0, 5);
    console.log(`\n  Daily load (next 5 working days):`);
    for (const d of futureDays) {
      const cal = d.calendar ? ` [${d.calendar.type}]` : "";
      const bar = `${"█".repeat(Math.min(Math.round(d.points), 15))}${"░".repeat(Math.max(0, 15 - Math.round(d.points)))}`;
      console.log(`    ${d.date}: ${bar} ${d.points} pts (${d.barColor})${cal}${d.isToday ? " ← TODAY" : ""}`);
    }

    if (r.chart.backlog.tasks > 0) {
      console.log(`\n  ⚠ ${r.chart.backlog.tasks} stale tasks beyond 15-day overdue window (${r.chart.backlog.points} pts, excluded from ratio)`);
    }
  }

  // Save JSON
  const fs = await import("fs");
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
