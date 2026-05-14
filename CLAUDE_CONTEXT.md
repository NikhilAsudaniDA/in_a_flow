# CLAUDE_CONTEXT.md — InAFlow

> Read this first before making any changes. This is the single source of truth for the project — architecture, calculations, decisions, and current status.

---

## What is InAFlow?

InAFlow is an internal analyst capacity and workload intelligence dashboard for Acadia.io. It pulls task and calendar data from Asana, computes workload metrics, and displays them in a web dashboard. Account Managers (AMs) use it to see at a glance whether analysts are overloaded, underutilised, or at healthy capacity — without manually checking Asana.

---

## Architecture

```
Asana API
    ↓
/api/sync  (Next.js API route — server-side)
    ↓ writes
Vercel Blob  →  inaflow-data.json   (synced analyst data)
             →  inaflow-config.json (analyst roster + workspace config)
    ↓ reads
/api/data  (Next.js API route)
    ↓
Frontend React (app/page.tsx)
```

- **Framework:** Next.js 14+ App Router, TypeScript throughout
- **Hosting:** Vercel — auto-deploys on every push to `main`
- **Storage:** Vercel Blob — two JSON files (see below)
- **Cron:** Vercel Cron triggers `/api/sync` daily at 2:00 UTC (~9:30 PM ET the previous day)
- **Frontend:** React + Tailwind CSS + shadcn/ui + Recharts
- **Timezone:** All date and "today" logic uses `America/New_York` (Eastern Time)

---

## Project Structure

```
in_a_flow/
├── app/
│   ├── page.tsx                        ← Entire dashboard UI (sidebar, KPIs, chart, task table)
│   ├── layout.tsx                      ← Root layout — page title, favicon, auth gate
│   ├── login/page.tsx                  ← Password login page
│   └── api/
│       ├── sync/route.ts               ← Runs full Asana sync, saves inaflow-data.json
│       ├── data/route.ts               ← Reads inaflow-data.json for the frontend
│       ├── auth/route.ts               ← Login (POST) and logout (DELETE)
│       ├── config/route.ts             ← GET current config (analysts + workspaces)
│       ├── config/add-analyst/         ← POST: add analyst to roster
│       ├── config/update-analyst/      ← PATCH: edit analyst profile
│       ├── config/delete-analyst/      ← DELETE: remove analyst from roster
│       ├── config/add-workspace/       ← POST: save a new workspace/project entry
│       ├── config/delete-workspace/    ← DELETE: remove a workspace entry
│       ├── config/workspaces/          ← GET: list all saved workspace entries
│       ├── lookup-analyst/route.ts     ← GET: find Asana user by email
│       ├── lookup-workspace/route.ts   ← GET: list Asana workspaces via PAT
│       └── lookup-projects/route.ts    ← GET: list Asana projects in a workspace
├── lib/
│   ├── sync-engine.ts                  ← All Asana fetch + computation logic (server-side only)
│   ├── config.ts                       ← Config CRUD: analysts + workspaces in Vercel Blob
│   ├── data.ts                         ← TypeScript types + mapRawToAnalysts() + fetchAnalystsFromAPI()
│   └── utils.ts                        ← cn() Tailwind class helper — do not modify
├── components/ui/                      ← shadcn/ui component library — do not modify
├── vercel.json                         ← Vercel Cron schedule
└── CLAUDE_CONTEXT.md                   ← This file
```

---

## The Two Blob Files

### `inaflow-data.json`
Written by `/api/sync` after every sync. Contains fully computed metrics for every analyst — task lists, chart data, throughput, calendar days. The frontend reads this via `/api/data`. It is never written by the frontend directly.

### `inaflow-config.json`
The live configuration — who is in the analyst roster, their pod/status/clients, and which Asana workspaces/projects are configured. Managed through the UI (Add Analyst, Edit Analyst, Workspaces modal). Written on every config change via `lib/config.ts → saveConfig()`.

---

## Authentication

The dashboard is password-gated. There is no user accounts system — one shared password for the whole team.

**How it works:**
1. `app/layout.tsx` checks for a valid `inaflow-session` cookie on every request
2. If missing or invalid → redirect to `/login`
3. `/login/page.tsx` — minimal password form, POSTs to `/api/auth`
4. `/api/auth` POST — compares submitted password against `INAFLOW_PASSWORD` env var using constant-time comparison (timing-attack resistant), then sets an HMAC-signed session cookie valid for 7 days
5. `/api/auth` DELETE — clears the cookie (logout)

**Session cookie:** `inaflow-session`, HttpOnly, Secure in production, SameSite=lax, 7-day expiry. Signed with `SESSION_SECRET` env var using HMAC-SHA256.

**Why no JWT library / no NextAuth?** Intentionally simple — no user accounts, no OAuth, no database needed. A shared password with a signed cookie is sufficient for an internal tool.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ASANA_PAT` | Asana Personal Access Token — used by all API routes that call Asana |
| `INAFLOW_PASSWORD` | The shared dashboard password (plain text in Vercel) |
| `SESSION_SECRET` | Random secret for HMAC-signing the session cookie |
| `CRON_SECRET` | Authenticates Vercel Cron calls to `/api/sync` |
| `BLOB_READ_WRITE_TOKEN` | Auto-created by Vercel Blob store |

---

## Asana GIDs — CONFIG Reference

These GIDs are hardcoded in `lib/sync-engine.ts → CONFIG`. They identify specific Asana fields, projects, and enum options. They never change unless Acadia restructures Asana.

### Workspace & Default Projects
| Item | GID |
|---|---|
| Workspace (Acadia) | `16282293647760` |
| Pod 3 Stand Up | `1204969864314028` |
| Pod 3 Calendar | `1207246447954463` |

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

**Priority Rank** (Field GID: `1207532336387929`) — values 1–10, Internal, Not Urgent, Flexible.

**Client Priority** (Field GID: `1206373227048995`) — values 1–10, Pending.

**Calendar Color** (Field GID: `1202123315418041`):
| Type | GID | Capacity | Broadcasts when unassigned? |
|---|---|---|---|
| PTO | `1202123315418045` | 0% | No — personal only |
| VTO | `1207250434437053` | 0% | No — personal only |
| Holiday | `1202123315418043` | 0% | Yes — all analysts |
| Appointments, Misc. | `1202123315418088` | 50% | No — personal only |
| QR/SAR | `1202623786796577` | 100% | Yes — all analysts |
| Birthday | `1202123315418042` | 100% | No — skip if unassigned |
| Event | `1206901122107898` | 100% | Yes — all analysts |
| Work Anniversary | `1202123315418046` | 100% | No — skip if unassigned |

---

## How the Sync Works (step by step)

Triggered by Vercel Cron daily at 2:00 UTC, or manually via the Refresh button.

1. **Load config** — reads `inaflow-config.json` to get the analyst roster and default workspace GIDs
2. **Filter analysts** — only `active` and `ramping` status analysts are synced; `on-leave` and `offboarded` are skipped
3. **Fetch calendar events** — pulls all incomplete tasks from the Calendar project, plus all tasks completed in the last 90 days. Deduplicates by GID.
4. **Build calendar map** — for each analyst and each date, determines what calendar event (if any) applies and what capacity multiplier that day has (0 = PTO/holiday, 0.5 = appointment, 1 = normal). Lower capacity wins if multiple events overlap.
5. **For each analyst:**
   - Fetch all incomplete tasks assigned to them in the workspace
   - Fetch all tasks completed in the last 10 weeks
   - Filter to only tasks that belong to the Stand Up project
   - Parse each task: extract effort, status, priority rank, client priority, and determine the client name from the Asana section name
   - Compute throughput (8-week weighted average)
   - Compute metrics (active load, overdue, unscoped, blocked, load ratio, signal)
   - Compute daily chart data (30-day window: 15 working days back + 15 forward)
   - Build task lists (overdue / working / blocked / unscoped)
6. **Save result** to `inaflow-data.json` in Vercel Blob
7. Frontend fetches fresh data via `/api/data`

**Why tasks are filtered by Stand Up project membership:** The workspace holds many Asana projects, but only tasks in the Stand Up project are analyst work items. This filter ensures client-billed work is counted and internal/other tasks are not.

**Why client name comes from section name:** In Asana, the Stand Up project is organised into sections per client. Each task belongs to a section — that section name is the client. This is the simplest approach that doesn't require a separate client list.

---

## Calculation Logic

### Effort Points
| Level | Points |
|---|---|
| Low | 1 |
| Medium | 3 |
| High | 6 |
| Very High | 12 |
| Need to scope | 0 |

Completed tasks with no effort level default to 3 pts (Medium). This is a legacy fallback for tasks completed before effort fields were populated consistently.

### Dynamic Effort Spread
Instead of putting all points on the due date, points are distributed across the working days leading up to it. This gives a more realistic picture of daily workload.

**Spread window by effort level:**
| Points | Working days in window |
|---|---|
| 1 | 1 (due date only) |
| 3 | 3 |
| 6 | 3 |
| 12 | 4 |

**Rules applied when building the window (walking backwards from due date):**
- Weekends are skipped entirely
- Days with 0% capacity (PTO, VTO, Holiday) are skipped — the window extends further back
- Days with 50% capacity (Appointments, QR) count but receive half weight
- If a task has a start date, the window cannot go earlier than the start date
- Points are distributed with **linear ramp weighting**: the day closest to the due date gets the highest weight. Formula: `weight of day i = (i+1) × capacity`, where i=0 is earliest day in window
- Total always sums to the task's full effort points

**Example:** A High effort (6pt) task due Friday with no PTO:
- Window: Wed, Thu, Fri
- Raw weights: Wed=1, Thu=2, Fri=3 → total=6
- Spread: Wed=1pt, Thu=2pt, Fri=3pt

### Time Windows
- **Active window:** Next 15 working days from today (EST)
- **Overdue window:** Last 15 working days before today (EST)
- **Stale overdue:** Tasks due more than 15 working days ago — counted separately, excluded from load ratio

### Throughput Calculation
8 weeks of completed tasks are looked at. Each week gets a weight — recent weeks matter more:

```
Weights: [1.0, 0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3]
(index 0 = most recent week)
```

`avgThroughput = Σ(weekPoints × weight) / Σ(weights)`

**PTO exclusion:** Any week where the analyst had 4 or more zero-capacity days is excluded entirely from the average. Rationale: that week's output is artificially low due to time off, not indicative of normal pace.

### Load Ratio
```
totalLoad       = activePoints + overduePoints  (Working tasks only, within 15-day windows)
triWeekCapacity = avgThroughput × 3             (15 working days ≈ 3 calendar weeks)
loadRatio       = totalLoad / triWeekCapacity
```

**Signals:**
| Ratio | Signal | Badge colour |
|---|---|---|
| < 0.6 | Underutilised | Grey |
| 0.6 – 1.1 | Optimal | Green |
| > 1.1 | Overloaded | Red |

**Why multiply throughput by 3?** The active window is 15 working days. There are approximately 5 working days per week, so 15 days ≈ 3 weeks. Multiplying average weekly throughput by 3 gives the expected capacity over the active window.

### Blocked Tasks — Fully Isolated
Blocked tasks (On Deck, On Hold, Pending Details from Client, Awaiting response from another BU) are completely excluded from all load metrics:
- NOT counted in Active Load, Overdue, Unscoped, or Load Ratio
- NOT included in effort spread or daily chart
- ONLY shown in the Blocked KPI count and the Blocked section of the task table

**Why:** Blocked tasks are not actionable by the analyst. Including them in load would make the analyst appear busier than they actually are. They need to be visible for follow-up but should never distort capacity signals.

### Calendar Broadcast Rules
When a calendar event is unassigned in Asana:
- **Broadcast = true** (Holiday, QR/SAR, Event): applied to ALL analysts in the pod
- **Broadcast = false** (PTO, VTO, Appointment, Birthday, Work Anniversary): skipped entirely — these are personal and only meaningful when assigned to a specific person

When assigned: applied only to that person if they are in the pod. If assigned to someone outside the pod, dropped entirely.

**Why GID-based matching instead of name matching:** Asana allows renaming enum options. If someone renames "Holiday" to "Public Holiday", name-based matching would silently break. GID never changes.

**Capacity conflict resolution:** If a day has both a PTO event (0%) and a Birthday (100%), the lower capacity wins. PTO always beats everything else.

---

## Dashboard UI — How It Works

### Sidebar
- Lists all active and ramping analysts grouped by pod (Pod-3, Pod-2, Shared Resources)
- Each row shows: avatar/initials, name, coloured dot indicating workload signal
- Signal dot colours: red = Overloaded, green = Optimal, grey = Underutilised
- Search filters the list in real time
- "Show inactive" toggle reveals on-leave analysts
- "Add Analyst" button opens the Add Analyst modal
- "Workspaces" button (grid icon) opens the Workspaces modal
- "Refresh" button at top triggers a fresh Asana sync
- "Sign out" at the bottom clears the session cookie

### KPI Cards (top of detail panel)
Five cards shown for the selected analyst:
1. **Active Load** — task count + total points due in next 15 working days (Working status only)
2. **Overdue** — task count + points past due but within last 15 working days
3. **Unscoped** — tasks in the active window with 0 effort points (Need to scope)
4. **Blocked** — count of tasks in a Blocked status group
5. **Load Ratio** — the ratio value + "Overloaded / Optimal / Underutilised" signal badge

### Daily Load Chart (30-day window)
Two stacked Recharts `BarChart` components rendered vertically:
- **Top chart (160px):** Shows workload bars per working day. Y-axis 0–24 pts. Bar colour reflects intensity.
- **Bottom chart (70px):** Shows calendar event stubs (PTO, Holiday, Birthday, etc.) as coloured bars below the X-axis. This is a separate chart with a hidden Y-axis (same width placeholder for column alignment).

**Why two separate charts:** A single stacked bar chart cannot place bars both above and below the 0 line independently without them overlapping. Two charts with matching column gaps and margins keep them visually aligned.

**Bar colour thresholds:**
| Points | Colour | Label |
|---|---|---|
| Past days with load | Muted pink `#F09595` | Overdue |
| 0–3 | Grey `#B4B2A9` | Light |
| 3–6 | Amber `#EF9F27` | Moderate |
| 6–8 | Red `#E24B4A` | Heavy |
| 8+ | Dark red `#991B1B` | Very Heavy |

**"Today" marker:** A dashed vertical reference line. Always calculated in `America/New_York` timezone using `new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })`. The `en-CA` locale produces `YYYY-MM-DD` format which matches the date strings stored in chart data.

**"X tasks due" warning:** If a day has 0% calendar capacity (PTO/Holiday) AND tasks are due that day, a red reference line appears with a label like "3 tasks due". This flags potential scheduling conflicts.

**Tooltips:** Both charts have `<Tooltip>` — hovering a bar shows the date and points.

### Task Table
Three collapsible sections below the chart:
- **Overdue** — Working tasks past their due date (within 15 working days)
- **Active** — Working tasks due in the next 15 working days with effort points > 0
- **Blocked** — All blocked tasks
- **Unscoped** appears inline in Active if there are tasks with 0 pts

Columns: `#` (row number), Task Name, Client, Priority Rank, Client Priority, Effort, Dates (start → due), Status.

---

## Analyst Management

### Adding an Analyst
1. Click "Add Analyst" in sidebar
2. Enter the analyst's Acadia email address
3. System calls `/api/lookup-analyst?email=...` which searches Asana users by email (first tries direct lookup, falls back to listing all workspace users)
4. If found, displays their name, photo, and job title
5. User selects pod and status, clicks "Add"
6. POSTs to `/api/config/add-analyst` → writes to `inaflow-config.json`
7. Next sync will include this analyst

### Editing an Analyst
3-dot menu (⋯) on any analyst row in the sidebar → "Edit profile":
- Can change: pod, status (active / ramping / on-leave), job title, clients list
- PATCHes `/api/config/update-analyst`

### Deleting an Analyst
3-dot menu → "Remove" → confirmation dialog:
- Hard deletes the record from `inaflow-config.json`
- Immediately removed from the sidebar
- If same analyst is re-added later, it works cleanly (no "already exists" error)

**Why hard delete instead of soft delete (offboarded status):** Previously used soft delete (setting status to "offboarded"), but this caused "analyst already exists" errors when trying to re-add someone. Changed to hard delete with a backward-compatibility check in `addAnalyst()` that handles any existing offboarded records in older blobs.

---

## Workspace & Project Management

### Concepts
- **Workspace** = the Asana organisation account (Acadia). There is only one. Identified by its GID.
- **Project** = a standup or calendar project within the workspace. The sync engine needs two per configuration: a Stand Up project (tasks) and a Calendar project (PTO/events).
- Each saved workspace entry in the config stores: `workspaceGid`, `standUpProjectGid`, `calendarProjectGid`, `projectName` (display name), and `isDefault`.

### Default Workspace
The `isDefault: true` entry is the one used for syncing. There is always exactly one default. If the default is deleted, the first remaining entry is promoted to default automatically.

### Workspaces Modal (UI)
Accessed via the grid icon (⊞) in the sidebar bottom.

**Display:** Workspaces are grouped by their `workspaceGid` and shown as a collapsible accordion (closed by default). Clicking the workspace name (e.g. "Acadia") expands it to show all saved project entries by name, each with a delete (×) button. A "+ Add Project" link at the bottom opens the 3-step wizard.

**3-step wizard for adding a project:**
1. **Select workspace** — auto-loads all Asana workspaces the PAT has access to on modal open (no search needed). User clicks a workspace card.
2. **Add Project** — fetches all projects in the selected workspace. Single dropdown to pick one. Duplicate check prevents adding the same project twice (checked against `standUpProjectGid` of existing entries). For the Acadia workspace, Pod 3 Stand Up is pre-selected as a convenience default.
3. **Name & save** — editable label field (pre-filled with workspace name), summary showing selected project name, "Add Workspace" button saves via `/api/config/add-workspace`.

### Current Limitation
The sync engine only uses the **default** workspace. Non-default entries are stored and displayed but not yet synced. Future work: sync all workspaces and merge/display results per workspace.

---

## API Routes Reference

| Route | Method | Purpose |
|---|---|---|
| `/api/sync` | GET | Run full Asana sync, save to blob. Called by cron or manual refresh. |
| `/api/data` | GET | Read latest `inaflow-data.json` from blob. |
| `/api/auth` | POST | Login — validate password, set session cookie. |
| `/api/auth` | DELETE | Logout — clear session cookie. |
| `/api/config` | GET | Read `inaflow-config.json` (analysts + workspaces). |
| `/api/config/add-analyst` | POST | Add analyst to config. |
| `/api/config/update-analyst` | PATCH | Edit analyst fields in config. |
| `/api/config/delete-analyst` | DELETE | Hard-delete analyst from config. |
| `/api/config/add-workspace` | POST | Add workspace entry to config. |
| `/api/config/delete-workspace` | DELETE | Remove workspace entry from config. |
| `/api/config/workspaces` | GET | List all saved workspace entries. |
| `/api/lookup-analyst` | GET | Find Asana user by email (used when adding analyst). |
| `/api/lookup-workspace` | GET | List Asana workspaces accessible by PAT. |
| `/api/lookup-projects` | GET | List all projects in a given Asana workspace. |

---

## Implementation Status

### Completed ✅
| Feature | Notes |
|---|---|
| Core sync engine — tasks, calendar, metrics | All calculation logic in `lib/sync-engine.ts` |
| Dynamic effort spread across working days | Ramp-weighted, PTO-aware |
| 8-week weighted throughput | PTO weeks excluded |
| Load ratio + signal (Overloaded / Optimal / Underutilised) | Thresholds: <0.6 / 0.6–1.1 / >1.1 |
| Blocked tasks fully isolated from all metrics | Only in Blocked KPI + task table |
| Calendar broadcast rules (GID-based) | Per-type broadcast flag |
| PTO conflict warning on chart ("X tasks due") | Red reference line on 0-capacity days with due tasks |
| 30-day chart (two stacked BarCharts) | Separate main + stub charts for below-zero stubs |
| Chart timezone fix | "Today" always uses `America/New_York` |
| KPI cards (Active, Overdue, Unscoped, Blocked, Load Ratio) | |
| Task table with Priority Rank + Client Priority columns | |
| Login gate — shared password, HMAC session cookie | |
| Analyst roster management (add / edit / delete) | |
| Add Analyst via email lookup | Searches Asana API, no manual GID entry |
| Workspace/project management UI | Accordion modal, 3-step wizard |
| Workspace auto-discovery via Asana API | No manual GID entry needed |
| Accessibility: ARIA descriptions on all dialogs | Fixes Radix UI console warning |
| Sync timestamp in EST | Displays `Synced May 3, 15:01 EST` format |

### Known Limitations / Future Work 🔜
| Item | Notes |
|---|---|
| Non-default workspaces not synced | Stored in config but sync only uses default. Future: sync all, show per-workspace |
| Custom field GID mappings not editable via UI | Hardcoded in `sync-engine.ts`. Works as long as Asana field GIDs don't change |
| Throughput only from Pod 3 Stand Up | When Pod 2 is added as a workspace, throughput calculation will need updating |
| No admin-only gating for workspace management | Anyone with the dashboard password can add/remove workspaces |
| `type: any` in sync engine | Acceptable for now; full typing would be a cleanup pass |
| Mobile not supported | Dashboard assumes a wide screen |

---

## Design Decisions & Why

**Single JSON blob instead of a database:** The data volume is tiny (< 100KB). A full database would add significant cost and complexity for zero benefit at this scale. The blob is the simplest reliable store that Vercel natively supports.

**Server-side sync only:** All Asana API calls happen server-side (`/api/sync`). The frontend never calls Asana directly. This keeps the PAT secret, avoids CORS issues, and means the dashboard is fast to load (reads from blob, not live Asana).

**Cron at 2:00 UTC (~9:30 PM ET):** Runs overnight so the dashboard is always fresh for the next US business day. Manual refresh available for real-time updates.

**Two separate bar charts for stubs:** Recharts does not support bars that go both above and below the zero axis independently within the same stack. Separate charts with matching `barCategoryGap`, `margin`, and hidden axis placeholders maintain visual column alignment.

**GID-based calendar type matching:** Asana enum option names can be renamed by any admin. GIDs never change. Using GIDs prevents silent breakage if someone renames "Holiday" to "Public Holiday".

**Hard delete for analysts:** Soft delete (status=offboarded) was the original approach but caused "analyst already exists" errors when re-adding. Hard delete is cleaner and a backward-compat check in `addAnalyst()` handles any legacy offboarded records still in older blobs.

**Constant-time password comparison in auth:** Prevents timing attacks where an attacker could infer the correct password character by character by measuring response time differences.
