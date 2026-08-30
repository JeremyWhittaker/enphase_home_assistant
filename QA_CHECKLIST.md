# Release and visual QA checklist

Status values: `implemented`, `blocked`, `deferred`, or `not applicable`.

## Professional dashboard refinement · 2026-08-30

This checklist records Jeremy's request to make the dashboard professional and useful and to move diagnostic text onto its own tab.

| Feedback item | Status | Evidence |
| --- | --- | --- |
| Make Overview operational-first: current power, today, health, and recent trend | implemented | `overviewView`; one concise actionable health template plus current/today KPIs and separate 24-hour/seven-day columns |
| Use balanced desktop sections while retaining a clean mobile stack | implemented | Overview and Energy use three semantic Sections columns; final desktop/mobile captures inspected |
| Move cloud/source/API/Recorder/unavailable-telemetry explanations off daily-use views | implemented | Visible **Diagnostics** fourth tab preserves `/system`; technical copy and unavailable filter live there |
| Simplify Energy around today, lifetime, and production trends | implemented | Permanent prose removed; compact totals plus `Daily production · 30 days` and `Power · 48 hours` |
| Turn Microinverters into a concise array-operating view | implemented | Visible **Arrays** tab groups live rows by Pool shade and South west; lifetime counters moved to Diagnostics |
| Resolve contradictory fleet copy | implemented | Three Jinja summaries derive `13 normal · 1 needs attention` from status attributes/device records; no `14 reporting` claim |
| Remove serial and state-change timestamp clutter from routine inverter rows | implemented | Arrays rows are `inverter 01` etc. with no secondary timestamp; exact serials remain in Diagnostics |
| Eliminate excessive fixed card height and mobile whitespace | implemented | Variable entities cards use content height; Arrays mobile dropped from five capture segments to two |
| Preserve native, read-only, site-pinned safety constraints | implemented | Validator still rejects custom/global Energy/control/action/navigation types; exact site/gateway tests pass |
| Update unit assertions and all four-route browser QA | implemented | `npm run check` 9/9; live preflight/read-back; final report `/tmp/enphase-home-assistant-professional-qa.czglBE/report.json` |

| Gate | Status | Evidence |
| --- | --- | --- |
| Exact site 2103 / system 5815605 selection | implemented | `discoverEnphase` requires one loaded `enphase_ev` entry with site-scoped entity evidence; ambiguity/wrong-site tests |
| Exact official local gateway selection | implemented | Loaded `enphase_envoy` selected by serial-scoped registry entity/title; null config-entry unique-id fixture covered |
| Hybrid gateway identity validation | implemented | Pinned gateway identity plus cloud gateway-attribute cross-check when reported |
| Local aggregate power primary | implemented | Required local `<gateway>_production` entity; cloud production is diagnostic cross-check only |
| Cloud lifetime energy primary | implemented | Required `enphase_ev_site_5815605_solar_production`; native statistic/statistics graphs |
| Broken local day/seven-day values excluded | implemented | No discovery contract/dashboard reference; source and tests reject those identifiers |
| Catch-up-distorted local lifetime excluded from energy calculations | implemented | Energy cards reference cloud lifetime only; rationale in `docs/analysis.md` |
| All 14 local/cloud microinverters paired | implemented | Exact serial-pattern pairing; per-inverter power and lifetime lists; duplicate lifetime fails closed |
| Fleet error not hidden by `Online` | implemented | Dynamic templates read connectivity `status_counts`, inspect reporting `devices`, and list problem units |
| Optional unavailable capabilities suppressed | implemented | Discovery drops unavailable optional entities; consumption/grid/battery/weather capability tests |
| Global EG4 Energy cards excluded | implemented | Validator rejects every `energy-*` type; unit assertion over complete card tree |
| Native read-only card/action allowlist | implemented | `validationPolicy`; custom/control/navigation rejection tests |
| External Enlighten arrays link | implemented | Plain Markdown link; URL-aware entity-reference validation; no iframe/navigation action |
| Candidate references live entities | implemented | `validateDashboard`; missing-reference unit test |
| Server-side Jinja rendering | implemented | `validateDashboardTemplates`; all dynamic strings POST to `/api/template` before plan/apply |
| Four responsive Sections views | implemented | Overview, Energy, Arrays, Diagnostics assertions; legacy route paths retained |
| Transactional create/update/read-back/rollback | implemented | Planning/apply/rollback unit coverage and exact `verifyDashboard` round-trip |
| Private checksummed backup | implemented | Mode-0600 file, whole-document checksum, per-config checksums, no token field |
| Drift-guarded restore | implemented | Drift rejection, prior restore, wrong-dashboard rejection in deploy flow |
| Static validation | implemented | Final `npm run check`: syntax checks plus 9/9 tests on 2026-08-30 |
| Live read-only preflight | implemented | HA 2026.8.3: site 2103/system 5815605, 38 live references, 57 native cards, four views, three rendered Jinja templates; final plan `unchanged` |
| Dashboard deployment | implemented | Professional layout deployed transactionally; final private rollback artifact `/tmp/enphase-ha-dashboard-dfShcl/backup.json`; exact read-back and idempotent no-op verified |
| Desktop rendering | implemented | Final report `/tmp/enphase-home-assistant-professional-qa.czglBE/report.json`; all four routes at 1440×1000, light and dark |
| Mobile rendering | implemented | Same report; all four routes at 390×844 with overlapping full-scroll captures; Arrays reduced to two segments |
| Light/dark rendering | implemented | 16 cases and 36 screenshots across both themes/viewports; zero actionable browser errors |
| Sidebar route and four live routes | implemented | Final browser gate passed; Enphase 2103 sidebar selection and all four routes were visible in manually reviewed captures |
| Forms, CTAs, service calls, and equipment controls | not applicable | Monitoring-only dashboard intentionally contains none |
| Public noindex/canonical/robots | not applicable | Authenticated private Home Assistant panel, not a public website |
| Commit and push | implemented | Professional refinement committed as a task-owned main-branch change and pushed to `origin/main`; final synced status is part of the ship handoff |
