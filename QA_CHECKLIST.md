# Release and visual QA checklist

Status values: `implemented`, `blocked`, `deferred`, or `not applicable`.

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
| Four responsive Sections views | implemented | Overview, Energy, Microinverters, System assertions |
| Transactional create/update/read-back/rollback | implemented | Planning/apply/rollback unit coverage and exact `verifyDashboard` round-trip |
| Private checksummed backup | implemented | Mode-0600 file, whole-document checksum, per-config checksums, no token field |
| Drift-guarded restore | implemented | Drift rejection, prior restore, wrong-dashboard rejection in deploy flow |
| Static validation | implemented | Final `npm run check`: syntax checks plus 9/9 tests, including compact remainder-card regression, on 2026-08-28 |
| Live read-only preflight | implemented | HA 2026.8.3: site 2103/system 5815605, 39 live references, 50 cards, four views, two rendered Jinja templates; final plan `unchanged` |
| Dashboard deployment | implemented | Created and then polished transactionally; private rollback artifacts `/tmp/enphase-ha-dashboard-UfbAab/backup.json` and `/tmp/enphase-ha-dashboard-X67aUD/backup.json`; exact read-back and idempotent no-op verified |
| Desktop rendering | implemented | Final report `/tmp/enphase-home-assistant-qa.1Ot42Z/report.json`; all four routes at 1440×1000, light and dark |
| Mobile rendering | implemented | Same report; all four routes at 390×844 with overlapping full-scroll captures; small inverter remainder groups visually compacted |
| Light/dark rendering | implemented | 16 cases and 38 screenshots across both themes/viewports; zero actionable browser errors |
| Sidebar route and four live routes | implemented | Automated route/sidebar inspection passed and representative screenshots were reviewed manually |
| Forms, CTAs, service calls, and equipment controls | not applicable | Monitoring-only dashboard intentionally contains none |
| Public noindex/canonical/robots | not applicable | Authenticated private Home Assistant panel, not a public website |
| Commit and push | implemented | Root implementation commit `8823346` pushed to `origin/main`; final `git status -sb` verification is part of the ship handoff |
