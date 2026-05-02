# CLAUDE_CONTEXT.md — InAFlow v3

> Read this first before making any changes. This is the single source of truth for the project.

---

## What is InAFlow?

InAFlow is an internal analyst capacity/workload intelligence dashboard for Acadia.io. It pulls task and calendar data from Asana, computes workload metrics, and displays them on a web dashboard. Account Managers (AMs) use it to see if analysts are overloaded, underutilized, or at healthy capacity.

---

## Architecture

```
Asana API → /api/sync (Next.js API route) → Vercel Blob (JSON cache) → /api/data → Frontend (React)
```

- **Framework:** Next.js (App Router, TypeScript throughout)
- **Hosting:** Vercel (auto-deploys on every push to `main`)
- **Storage:** Vercel Blob — one JSON file (`inaflow-data.json`, ~50KB)
- **Cron:** Vercel Cron triggers `/api/sync` daily at 2:00 UTC (~9:30 PM ET previous day)
- **Frontend:** React + Tailwind CSS + shadcn/ui + Recharts
- **Timezone:** All date logic uses `America/New_York` (Eastern Time — Atlanta/New York)

---

## Project Structure

```
in_a_flow/
├── app/
│   ├── page.tsx              ← Entire dashboard UI (sidebar, KPIs, chart, task table)
│   ├── layout.tsx            ← Root layout — page title, favicon, Vercel Analytics
│   ├── globals.css           ← Global Tailwind styles
│   └── api/
│       ├── sync/route.ts     ← POST/GET endpoint: runs sync, saves to Vercel Blob
│       └── data/route.ts     ← GET endpoint: reads latest data from Vercel Blob
├── lib/
│   ├── sync-engine.ts        ← All Asana fetch + computation logic (server-side)
│   ├── data.ts               ← TypeScript types, mapRawToAnalysts(), fetchAnalystsFromAPI()
│   └── utils.ts              ← cn() Tailwind class helper (do not modify)
├── components/ui/            ← shadcn/ui component library (do not modify)
├── vercel.json               ← Vercel Cron schedule
├── package.json
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
- Jai Khurana: `1204806986130866` — commented out in CONFIG, not active yet

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

**Priority Rank** (Field GID: `1207532336387929`):
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

**Client Priority** (Field GID: `1206373227048995`):
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
| Type | GID | Capacity | Broadcast when unassigned |
|---|---|---|---|
| PTO | `1202123315418045` | 0% | No — personal only |
| VTO | `1207250434437053` | 0% | No — personal only |
| Holiday | `1202123315418043` | 0% | Yes — all analysts |
| Appointments, Misc. | `1202123315418088` | 50% | No — personal only |
| QR/SAR | `1202623786796577` | 50% | Yes — all analysts |
| Birthday | `1202123315418042` | 100% | No — skip if unassigned |
| Event | `1206901122107898` | 100% | Yes — all analysts |
| Work Anniversary | `1202123315418046` | 100% | No — skip if unassigned |

---

## Calculation Logic

### Effort Points: 1, 3, 6, 12
Doubling pattern. Low=1, Medium=3, High=6, Very High=12.
Completed tasks with no effort level default to Medium (3 pts) — legacy fallback.

### Dynamic Effort Spread
Points concentrate in the last few working days before due date:
- Low (1 pt): Due date only — 1 day
- Medium (3 pts): Last 3 working days before due
- High (6 pts): Last 3 working days before due
- Very High (12 pts): Last 4 working days before due

Rules:
- Working days = Mon–Fri only, weekends skipped
- PTO/VTO/Holiday days (0% capacity) are skipped — window extends further back
- Appointment/QR days (50% capacity) get half weight
- Start date is respected: use min(effort window, start-to-due window)
- Ramp weighting: linear increase toward due date
- Total points always sum to the task's effort points

### Time Windows (15 working days each)
- Active: Next 15 working days from today
- Overdue: Last 15 working days before today
- Stale overdue (>15 working days): Excluded from load ratio

### Throughput
8-week weighted rolling average of completed points per week.
Weights: `[1.0, 0.95, 0.85, 0.75, 0.6, 0.5, 0.4, 0.3]`
Weeks with 4+ PTO days are excluded.

### Load Ratio
```
totalLoad  = activePoints + overduePoints (Working tasks only, within 15-day windows)
capacity   = avgThroughput × 3  (15 working days ≈ 3 weeks)
loadRatio  = totalLoad / capacity
```
Signals: `< 0.6` = Underutilized, `0.6–1.1` = Optimal, `> 1.1` = Overloaded

### Blocked Tasks — Fully Isolated
Blocked tasks are COMPLETELY excluded from all metrics:
- NOT in Active Load, Overdue, Unscoped, or Load Ratio
- NOT in effort spread or daily chart
- ONLY shown in the Blocked KPI count + bottom task table section

### Calendar Broadcast Rules
See Calendar Color table above. Key principle:
- If assigned to someone in the pod → apply to that person only
- If assigned to someone outside the pod → drop entirely
- If unassigned → apply to all analysts only for Holiday, QR/SAR, Event; skip all others

### Chart — Daily Load (30-day window: 15 back + 15 forward)
Bar colors:
| Range | Color | Label |
|---|---|---|
| 0–3 pts | `#B4B2A9` | Light |
| 3–6 pts | `#EF9F27` | Moderate |
| 6–8 pts | `#E24B4A` | Heavy |
| 8+ pts | `#991B1B` | Very Heavy |
| Past days | `#F09595` | Overdue |

PTO conflict warning: if a day has `capacity = 0` AND tasks are due that day, a red reference line appears labelled "X tasks due".

### Synced Timestamp Format
```typescript
new Date(syncedAt).toLocaleString("en-US", {
  timeZone: "America/New_York",
  month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false
}) + " EST"
```

---

## Environment Variables (Vercel dashboard)
| Variable | Purpose |
|---|---|
| `ASANA_PAT` | Asana Personal Access Token |
| `CRON_SECRET` | Authenticates Vercel Cron calls to `/api/sync` |
| `BLOB_READ_WRITE_TOKEN` | Auto-created by Vercel Blob store |

---

## Design Principles
- Clean, minimal aesthetic — no heavy UI chrome
- Sidebar: analyst list + search + refresh button
- KPI cards: Active Load, Overdue, Unscoped, Blocked, Load Ratio
- 30-day bar chart below KPIs
- Task table (Overdue / Active / Blocked sections) below chart
- Tailwind CSS only — no inline styles except where Recharts requires it
- Mobile responsiveness not required

---

## Implementation Status — All Complete

All 9 original planned features are shipped and working:

| # | Feature | Status |
|---|---|---|
| 1 | Task list → HTML table (# / Name / Client / Priority Rank / Client Priority / Effort / Dates / Status) | ✅ Done |
| 2 | Fetch Priority Rank + Client Priority from Asana | ✅ Done |
| 3 | Blocked tasks fully excluded from all metrics | ✅ Done |
| 4 | Calendar broadcast rules (per-type, GID-based) | ✅ Done |
| 5 | PTO conflict warning on chart ("X tasks due") | ✅ Done |
| 6 | Calendar event stubs enlarged (0.4 → 0.8) | ✅ Done |
| 7 | Signal badge enlarged | ✅ Done |
| 8 | Labels updated to "15 working days" | ✅ Done |
| 9 | Chart legend — 4-tier colors + Overdue swatch | ✅ Done |

Bugs fixed:
- Task table date off-by-one (UTC midnight → local date constructor)
- Calendar over-broadcast (GID-based type matching, per-type broadcast flag)
- UTC date in PTO warning functions (now uses `America/New_York`)
- Duplicate dead `AnalystSidebar` component removed
- TypeScript strict-mode errors fixed (`asanaGetAll` fetch types)

### Known future improvements (not urgent)
- Replace `type: any` throughout with proper TypeScript types
- Add try/catch error handling around Asana API calls
- Add cache-control headers on `/api/data` response
- Timezone preference per user (currently hardcoded to Eastern Time)
