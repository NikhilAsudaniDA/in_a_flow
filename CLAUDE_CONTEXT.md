# CLAUDE_CONTEXT.md — InAFlow v3 Full Rewrite Brief

> This document contains everything you need to understand and rewrite the InAFlow project.
> Read this FIRST before making any changes.

---

## What is InAFlow?

InAFlow is an internal analyst capacity/workload intelligence dashboard for Acadia.io. It pulls task and calendar data from Asana, computes workload metrics, and displays them on a web dashboard. Account Managers (AMs) use it to see if analysts are overloaded, underutilized, or at healthy capacity.

---

## Architecture

```
Asana API → /api/sync (Next.js API route) → Vercel Blob (JSON cache) → /api/data → Frontend (React)
```

- **Framework:** Next.js (handles both frontend and backend)
- **Language:** TypeScript everywhere
- **Hosting:** Vercel (auto-deploys on git push)
- **Storage:** Vercel Blob (one JSON file, ~50KB)
- **Cron:** Vercel Cron triggers /api/sync daily at 2:00 UTC (~7:30am IST)
- **Frontend:** React + Tailwind CSS + shadcn/ui + Recharts
- **Timezone:** All date logic uses EST (America/New_York)

---

## Project Structure

```
in_a_flow_latest/
├── app/
│   ├── page.tsx              ← REWRITE: Dashboard UI
│   ├── layout.tsx            ← No change
│   ├── globals.css           ← No change
│   └── api/
│       ├── sync/route.ts     ← Minor update (if sync-engine shape changes)
│       └── data/route.ts     ← No change
├── lib/
│   ├── sync-engine.ts        ← REWRITE: All sync logic + computations
│   ├── data.ts               ← UPDATE: Types if data shape changes
│   └── inaflow_output.json   ← DELETE: No longer needed (Blob is primary)
├── components/ui/            ← No change
├── scripts/
│   └── inaflow_sync.mjs      ← DELETE: Replaced by sync-engine.ts
├── vercel.json               ← No change
├── package.json              ← No change
└── CLAUDE_CONTEXT.md         ← This file
```

---

## Asana GIDs — CONFIG Reference

### Projects
- Pod 3 Stand Up: `1204969864314028`
- Pod 3 Calendar: `1207246447954463`
- Workspace: `16282293647760`

### Analysts
- Nikhil Asudani: `1207090544588174`
- Jinay Keniya: `1209071959445400`
- Jai Khurana: `1204806986130866` (not active yet, keep commented)

### Custom Fields

**Effort Level** (Field GID: `1206065778986020`):
| Option | GID | Points |
|---|---|---|
| Low effort | `1206065778986021` | 1 |
| Medium effort | `1206065778986022` | 3 |
| High effort | `1206065778986023` | 6 |
| Very High | `1214143966797916` | 12 |
| Need to scope | `1206065778986024` | 0 |

**Status** (Field GID: `1206065778986026`):
| Status | GID | Group |
|---|---|---|
| Acknowledged | `1207515172179334` | Working |
| In Progress | `1207515172179335` | Working |
| Ongoing | `1206065778986028` | Working |
| Support | `1206958866164775` | Working |
| Any Updates? | `1207064686450636` | Working |
| Need More Info | `1206065778986029` | Working |
| Discuss | `1207532336387944` | Working |
| In QA | `1207064686450642` | Working |
| On Deck | `1207515172179347` | Blocked |
| Pending Details from Client | `1208158822083804` | Blocked |
| On Hold | `1206301625857858` | Blocked |
| Awaiting response from another BU | `1213814052615258` | Blocked |
| Ready for Review | `1206065778986030` | Review |
| Complete | `1206337349568851` | Done |

**Priority Rank** (Field GID: `1207532336387929`) — NEW, must be fetched:
| Option | GID |
|---|---|
| 1 | `1207532336387930` |
| 2 | `1207532336387931` |
| 3 | `1207532336387932` |
| 4 | `1207532336387933` |
| 5 | `1207532336387934` |
| 6 | `1207532336387935` |
| 7 | `1207532336387936` |
| 8 | `1207532336387937` |
| 9 | `1207532336387938` |
| 10 | `1207532336387939` |
| Internal | `1207532336387940` |
| Not Urgent | `1207532336387941` |
| Flexible | `1207532336387942` |

**Client Priority** (Field GID: `1206373227048995`) — NEW, must be fetched:
| Option | GID |
|---|---|
| 1 | `1206373227048996` |
| 2 | `1206373227048997` |
| 3 | `1206373227048998` |
| 4 | `1206373227048999` |
| 5 | `1206373227049000` |
| 6 | `1209443193076442` |
| 7 | `1209443193076443` |
| 8 | `1209443193076444` |
| 9 | `1209443193076445` |
| 10 | `1209443193076446` |
| Pending | `1206770396196721` |

**Calendar Color** (Field GID: `1202123315418041`):
| Color | GID | Capacity |
|---|---|---|
| PTO | `1202123315418045` | 0% |
| VTO | `1207250434437053` | 0% |
| Holiday | `1202123315418043` | 0% |
| Appointments, Misc. | `1202123315418088` | 50% |
| QR/SAR | `1202623786796577` | 50% |
| Birthday | `1202123315418042` | 100% |
| Event | `1206901122107898` | 100% |
| Work Anniversary | `1202123315418046` | 100% |

---

## Calculation Logic (FINAL — do not change)

### Effort Points: 1, 3, 6, 12
Doubling pattern. Low=1, Medium=3 (~3x), High=6 (2x), Very High=12 (2x).
Completed tasks with no effort level default to Medium (3 pts) — legacy fallback.

### Dynamic Effort Spread
Points concentrate in the last few working days before due date:
- Low (1 pt): Due date only — 1 day
- Medium (3 pts): Last 3 working days before due
- High (6 pts): Last 3 working days before due
- Very High (12 pts): Last 4 working days before due

Rules:
- Working days = Mon-Fri only, weekends skipped
- PTO days (0% capacity) are skipped — window extends further back
- Appointment/QR days (50% capacity) get half weight
- Start date is respected: use min(effort window, start-to-due window)
- Ramp weighting: linear increase toward due date (day 1 = weight 1, day 2 = weight 2, etc.)
- Total points always sum to the task's effort points

### Time Windows (15 working days each)
- Active: Next 15 working days from today (3 weeks Mon-Fri)
- Overdue: Last 15 working days before today
- Stale overdue (>15 days): Excluded from load ratio, shown separately

### Throughput
8-week weighted rolling average of completed points per week.
Weights: [1.0, 0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3]
Weeks with 4+ PTO days are excluded.

### Load Ratio
```
totalLoad = activePoints + overduePoints (within 15-day windows)
capacity = avgThroughput × 3 (15 working days = 3 weeks)
loadRatio = totalLoad / capacity
```
Signals: < 0.6 = Underutilized, 0.6–1.1 = Optimal, > 1.1 = Overloaded

### Blocked Tasks — IMPORTANT
Blocked tasks are COMPLETELY ISOLATED:
- NOT counted in Active Load points
- NOT counted in Overdue points
- NOT counted in Unscoped count
- NOT included in load ratio calculation
- NOT included in effort spread / daily chart
- ONLY appear in: Blocked count KPI card + bottom section of task table

### Calendar Events with No Assignee
If a calendar event (PTO, Holiday, QBR, etc.) has no assignee in Asana, apply it to ALL analysts in the pod. This ensures pod-level events like holidays affect everyone's capacity.

### Timezone
All date logic uses EST (America/New_York). The `today()` function must convert UTC to Eastern before extracting the date.

---

## CHANGES TO IMPLEMENT (9 items)

### 1. Task List → Table Format
Replace the current list-style task display with a proper HTML table.

**Columns:**
| # | Task Name | Client | Priority Rank | Client Priority | Effort | Dates | Status |

- **Dates**: Show as range "Apr 24 – Apr 30". If no start date, show just the due date "Apr 30". If no due date, show "—".
- **Effort**: Show the name (Low, Medium, High, Very High, Need to scope)
- **Status**: Show the Asana status name
- **Priority Rank**: Show the rank value (1-10, Flexible, Internal, Not Urgent, or "—" if none)
- **Client Priority**: Show the value (1-10, Pending, or "—" if none)

**Three sections, in this order:**

**OVERDUE** (top, red-tinted background or red left border)
- Working tasks with due date in last 15 working days
- Sorted by Priority Rank (1 first → 10 → Flexible → Internal → Not Urgent → No rank last)

**ACTIVE** (middle, main section)
- Working tasks with due date in next 15 working days
- Sorted by Priority Rank (same order)

**BLOCKED** (bottom, slightly faded/grey)
- All blocked tasks regardless of due date
- Sorted by Priority Rank (same order)
- Just listed, not counted in any metrics

**Priority Rank sort order:**
1, 2, 3, 4, 5, 6, 7, 8, 9, 10, Flexible, Internal, Not Urgent, (no rank)
Multiple tasks with the same rank: no specific sub-sort needed.

### 2. Fetch Priority Rank + Client Priority from Asana
In `sync-engine.ts`:
- Add field GIDs to CONFIG
- Add to `opt_fields` in the Asana API calls
- Parse in `parseTask()` — extract enum_value.name for both fields
- Include in task output: `priorityRank: string | null`, `clientPriority: string | null`

### 3. Blocked Tasks Fully Excluded from Metrics
Verify and enforce:
- `computeMetrics()` → Active Load filter must be `statusGroup === "Working"` only
- Overdue filter must be `statusGroup === "Working"` only
- Unscoped filter must be `statusGroup === "Working"` only
- Load ratio uses only Working tasks
- Blocked count is a separate KPI showing count only (no points)

### 4. Calendar Events with No Assignee → Apply to All
In `buildCalendarMap()`:
- If `event.assignee` is null/undefined, add the event to ALL analyst calendars
- This ensures pod-level holidays, QBRs, etc. affect everyone's capacity

### 5. PTO Day Warning — "X tasks due, please move"
On the daily load chart, for any day where capacity = 0 (PTO/VTO/Holiday):
- Count how many Working tasks have their due date on that specific day
- Show a solid vertical line (not dotted like Today) with a label: "X tasks due"
- This warns the AM to reschedule those tasks
- The effort points for these tasks are already redistributed to other days by the spread algorithm, but the AM needs to know the due dates haven't been moved in Asana

### 6. Bigger Calendar Event Stubs
The small colored rectangles below each bar representing calendar events.
Currently `stub: 0.4` — increase to `stub: 0.8` or `1.0` so they're more visible.

### 7. Bigger Signal Badge
The "Optimal" / "Underutilized" / "Overloaded" badge in the top-right of the analyst detail view.
Make it larger — bigger font, more padding. Currently it's small and easy to miss.

### 8. Labels — "15 working days"
Update all text labels:
- "due in next 14 days" → "due in next 15 working days"
- Any other reference to day counts should say "working days"

### 9. Chart Legend — 4-Tier Colors
The daily load chart bar colors and legend:

| Range | Color | Label |
|---|---|---|
| 0–3 pts | Gray (#B4B2A9) | Light (0-3) |
| 3–6 pts | Amber (#EF9F27) | Moderate (3-6) |
| 6–8 pts | Red (#E24B4A) | Heavy (6-8) |
| 8+ pts | Dark Red (#991B1B) | Very Heavy (8+) |
| Past days | Muted Red (#F09595) | Overdue |

Y-axis: domain [0, 16], ticks at [0, 4, 8, 12, 16]

`getWorkloadColor` function:
```typescript
function getWorkloadColor(value: number, isPast: boolean) {
  if (isPast) return "#F09595"
  if (value >= 8) return "#991B1B"
  if (value >= 6) return "#E24B4A"
  if (value >= 3) return "#EF9F27"
  return "#B4B2A9"
}
```

---

## Files to Delete
- `scripts/inaflow_sync.mjs` — replaced by sync-engine.ts
- `lib/inaflow_output.json` — replaced by Vercel Blob
- `discover_project.mjs` — one-time tool, no longer needed in the project root

Note: After deleting `inaflow_output.json`, update `lib/data.ts` to remove the static import fallback. The dashboard should rely entirely on the `/api/data` endpoint. If the API returns no data, show a "No data — click Refresh to sync" message.

---

## Synced Timestamp Format
Show in EST, 24-hour format:
```typescript
new Date(syncedAt).toLocaleString("en-US", {
  timeZone: "America/New_York",
  month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false
}) + " EST"
```
Example: "Synced Apr 28, 14:30 EST"

---

## Environment Variables (on Vercel)
- `ASANA_PAT` — Asana Personal Access Token
- `CRON_SECRET` — Secret for cron authentication
- `BLOB_READ_WRITE_TOKEN` — Auto-created by Vercel Blob store

---

## Design Notes
- Keep the current clean, minimal aesthetic
- Sidebar with analyst list + search + refresh button stays
- KPI cards at top stay (Active Load, Overdue, Unscoped, Blocked, Load Ratio)
- 30-day bar chart stays (15 back + 15 forward)
- Task table replaces the current task list below the chart
- Use Tailwind CSS for all styling
- Mobile responsiveness is NOT required for now

---

## Implementation Status

### Completed
- Task list rewritten as HTML table with `Overdue`, `Active`, and `Blocked` sections.
- Added `Priority Rank` and `Client Priority` support in `lib/sync-engine.ts` and surfaced values in the task table.
- Ensured blocked tasks are excluded from active/overdue/unscoped metrics and counted separately.
- Updated calendar event handling so unassigned calendar events apply to all analysts (note: see active bug below — current implementation over-broadcasts).
- Improved task table layout: fixed column sizing, enforced truncation, and made section collapse toggle functional.
- Removed legacy `lib/inaflow_output.json`, `scripts/inaflow_sync.mjs`, and `discover_project.mjs` from the repo.
- Updated `lib/data.ts` fallback behavior so the UI now handles missing `/api/data` more clearly.
- Implemented PTO conflict warning ("X tasks due" red reference line) on zero-capacity days that still have tasks due.
- Increased calendar event stub size from `0.4` → `0.8` for visibility.
- Enlarged the analyst signal badge (text-sm, font-semibold, more padding).
- Updated "due in next 14 days" → "due in next 15 working days".
- Added "Overdue" swatch to the chart legend (4-tier colors complete).
- Unified task table column widths across Overdue/Active/Blocked via shared `<colgroup>`; removed horizontal scroll.

### Active bug — calendar over-broadcast (PARTIALLY FIXED) + date off-by-one (NEW)

**Original symptom:** Every analyst's daily-load chart showed PTO / Appointment / Birthday / Anniversary stubs on dates where they had no such events. User added PTO for themselves on May 4 for testing — it didn't appear, but stubs from other people's calendars did.

**Original root cause:** In `buildCalendarMap()` at [lib/sync-engine.ts:246](lib/sync-engine.ts#L246) the broadcast branch fired whenever `map[assigneeGid]` was undefined — which includes the (very common) case of an event assigned to someone outside CONFIG.analysts. So out-of-pod events were broadcast to everyone.

**Fix attempted (commit 5d5652b):**
1. Drop events whose assignee is not in CONFIG.analysts (only truly unassigned events broadcast to everyone).
2. When writing `map[recipient][ds]`, keep the lower-capacity event (PTO=0 must beat Birthday=1).

**Status:** The over-broadcast is fixed (other people's events no longer pollute everyone's calendar). BUT the user's own PTO is still not appearing on the correct day, and a new date off-by-one issue has surfaced — see below.

### Active bug — Asana date off-by-one (HIGH PRIORITY, OPEN)

**Symptom 1 — task dates display one day earlier than Asana shows:**
Two tasks the user has marked **due Monday May 4** in the Asana UI are rendering in the InAFlow task table as `May 3 – May 3` and `May 3` (May 3 is a Sunday — a non-working day, which makes the bug obvious). Screenshot confirms: Priority 1 and Priority 2 KPI tasks for Bealls.

**Symptom 2 — PTO not appearing on the day the user set it:**
- User marked PTO on May 4 → no PTO stub on May 4.
- User then tried PTO on May 5 → still nothing on May 4 or May 5 in the way the user expected.
- This is consistent with the same off-by-one: a PTO entered as May 4 in Asana may be getting stored under May 3 (Sunday) in `calendarMap`, and Sundays are filtered out of the chart entirely (weekends are skipped), so the stub disappears completely.

**Working hypothesis — timezone collapse in `parseDate`:**
Asana returns `due_on` and `start_on` as plain date strings like `"2026-05-04"` (no time, no timezone — these are calendar dates). Look at [lib/sync-engine.ts:84-88](lib/sync-engine.ts#L84-L88):
```ts
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
```
This constructs a Date in **local time** (the server's local time on Vercel, which is UTC). That part is actually fine on its own.

The frontend is the more likely culprit. In [app/page.tsx](app/page.tsx) the date label uses `toLocaleDateString` with `timeZone: "UTC"` for the chart axis, but the task table at `formatTaskDateRange` ([app/page.tsx:485-493](app/page.tsx#L485-L493)) does:
```ts
const due = new Date(dueOn)            // "2026-05-04" → parsed as UTC midnight
due.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
```
`new Date("2026-05-04")` is parsed as **UTC midnight**, then formatted in `America/New_York` which is UTC-4/-5 — so it rolls back to **May 3**. That explains Symptom 1 perfectly.

For Symptom 2 (PTO chart): the chart's `dateLabel` uses `timeZone: "UTC"`, so the chart axis itself shouldn't shift. But the `chartData.days[*].date` strings come from the backend's `dateStr(current)` over a UTC-constructed Date — also fine. Need to verify whether the backend's `today()` and weekday-skipping logic might be writing PTO under a Sunday key after all, OR whether the chart's stub for May 4 is being correctly placed but the user is reading the visually-shifted task table dates and assuming the chart is wrong too.

**Investigation steps:**
1. Inspect the `/api/data` payload directly — confirm what `dueOn` strings the backend is producing for the two May-4 tasks, and what date keys the user's PTO is stored under in `calendarDays`.
2. If the backend stores them correctly as `2026-05-04`, the fix is purely in `formatTaskDateRange`: parse the date string the same way `parseDate` does (split + local construct) so it doesn't shift to UTC midnight.
3. If the backend has shifted them to `2026-05-03`, the bug is in how Asana's date strings are parsed somewhere upstream.

### In progress / pending
- Diagnose and fix the date off-by-one bug — both task table dates and PTO chart placement.

### Current step
User reported the date off-by-one on 2026-05-01 after the calendar over-broadcast fix. Investigating whether the shift originates in the backend payload or only in the frontend `formatTaskDateRange`.
