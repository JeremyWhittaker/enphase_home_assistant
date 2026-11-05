# Enphase 2103 Home Assistant dashboard

A native, read-only Home Assistant dashboard for Jeremy's **2103** Enphase site (Enlighten system **5815605**). It installs as a dedicated **Enphase 2103** sidebar panel with responsive Overview, Energy, Arrays, and Diagnostics views.

The page keeps two reporting paths distinct:

- the official `enphase_envoy` integration supplies one-minute local aggregate production and all 14 live microinverter power readings;
- the read-only `enphase_ev` integration identifies the exact Enlighten site and supplies a separate lifetime-energy history, inventory, connectivity, and cloud health;
- the tiles and charts labelled **cloud energy** retain the existing Recorder history derived from that cloud lifetime counter;
- the local lifetime counter is shown separately in Diagnostics; local and cloud totals differ, and their starting dates and coverage have not been reconciled;
- the dated local-history note identifies the October 28–November 4 gap without treating it as a gap in the separate cloud counter;
- Home Assistant's global `energy-*` cards are not embedded here: this equipment page selects its own sources independently of whole-home Energy preferences.

Runtime entity IDs are not fixed in source. Discovery follows config-entry and entity-registry relationships and stable integration unique IDs, then validates every reference against live state. It fails closed if the cloud site or local gateway is missing, unloaded, or ambiguous.

## Views

- **Overview** — current local power, production today from cloud energy history, one concise actionable array-health message, and separate 24-hour/seven-day trend columns.
- **Energy** — cloud-derived today/lifetime energy and 30-day energy history, alongside a separate 48-hour local power trend; optional consumption, grid, and battery sections appear only when those channels become available.
- **Arrays** — live inverter output grouped by the real Pool shade and South west arrays, with short row labels and a direct [Enlighten array view](https://enlighten.enphaseenergy.com/systems/5815605/arrays).
- **Diagnostics** — exact fault serials, source freshness, gateway/cloud/raw fleet health, available per-inverter lifetime counters, an explicit count when those counters are missing, separate local/cloud lifetime totals, unavailable telemetry, site identity, and data-source notes.

The visible Arrays and Diagnostics tabs preserve the original `/microinverters` and `/system` routes so existing bookmarks continue to work. Daily-use labels identify local power and cloud energy. Integration details, raw timestamps, serial lists, and cloud endpoint notes stay in Diagnostics.

The dashboard currently calls attention to the Pool shade microinverter if inventory continues to report it as not reporting; it does not trust the aggregate `Online` fleet label alone.

## Why this avoids the paid API

The primary live path is the Envoy/IQ Gateway on the local network through Home Assistant's official Enphase Envoy integration. The cloud integration is the community [Enphase Energy integration](https://github.com/barneyonline/ha-enphase-energy), which uses the same account-facing, undocumented Enlighten services rather than Enphase's paid developer API. Its cloud endpoints can change, so local power remains primary and cloud health is visible.

Other relevant GitHub projects reviewed were Home Assistant's [official Enphase Envoy implementation](https://github.com/home-assistant/core/tree/dev/homeassistant/components/enphase_envoy) and the older [custom Envoy integration](https://github.com/briancmpbll/home_assistant_custom_envoy). This project uses the official local integration rather than introducing a second custom local reader.

## Requirements

- Node.js 22 or newer.
- Home Assistant with Recorder/statistics enabled.
- A loaded official `enphase_envoy` entry for the verified 2103 gateway.
- A loaded `enphase_ev` entry for site 5815605 with gateway and microinverter categories enabled.
- An administrator long-lived Home Assistant token in `HA_TOKEN` or `ENPHASE_HA_TOKEN`.
- `HA_BASE_URL` set to the reachable Home Assistant origin.

Copy `.env.example` only as a reference. The deployer never reads Enphase usernames/passwords and never logs tokens.

## Validate and deploy

Run static syntax and unit checks:

```bash
npm run check
```

Run a read-only live preflight:

```bash
node deploy.mjs --check
```

Preflight verifies administrator access, both integration identities/states, semantic entity discovery, referenced live entities, the native/read-only card policy, server-side Jinja rendering, dashboard collisions, and the create/update/unchanged plan. It does not write Home Assistant.

Deploy the storage dashboard:

```bash
node deploy.mjs
```

Open:

```text
<HA_BASE_URL>/enphase-2103/overview
```

The deployer is idempotent. An unchanged dashboard causes no write and no backup. A create or update first writes a random mode-0600, whole-document-checksummed backup below `/tmp/enphase-ha-dashboard-*`, round-trips the saved metadata/config, and automatically restores the prior dashboard if any save or verification step fails.

## Restore

Use the exact backup path printed during deployment:

```bash
node deploy.mjs --restore /tmp/enphase-ha-dashboard-*/backup.json
```

Restore refuses to overwrite operator drift. After reviewing that difference, an intentional override is explicit:

```bash
node deploy.mjs --restore /tmp/enphase-ha-dashboard-*/backup.json --force-restore
```

The restore command accepts only this project's `enphase-2103` dashboard backups and verifies the whole-document plus prior/deployed configuration checksums.

## Visual QA

After deployment, run the dependency-free Chromium gate:

```bash
npm run qa:visual -- --output-dir /tmp/enphase-home-assistant-qa
```

It authenticates through an ephemeral browser profile, renders all four routes at desktop and mobile sizes in light and dark modes, captures overlapping screenshots from top to bottom, checks the sidebar route, and fails on Lovelace/browser errors. The temporary profile is deleted on exit; reports and screenshots remain outside the repository and use private file modes.

## November 2026 energy review

The November 4 live review found fourteen stale per-microinverter lifetime rows, although all fourteen local power readings remained available. Fresh discovery now omits counters that are missing, disabled, not loaded, unknown, unavailable, or nonnumeric. Diagnostics explains how many counters are missing instead of creating replacement entities or leaving broken rows.

The same review measured local aggregate power at 1,207 W and the fourteen local microinverters at a combined 1,206 W, while cloud power reported 312 W. Local and cloud lifetime energy also differed (approximately 11,335 and 12,098 kWh). These are dated observations, not conversion factors. Local power remains the primary series; cloud power is labelled **scope unverified** and never replaces it. Energy tiles and daily charts continue their established cloud history. The separate local lifetime counter is diagnostic here; it is not spliced into that history. Whole-home Energy can select a verified Enphase source separately without changing this page.

The local lifetime history contains a **179-hour outage from October 28 to November 4, 2026**. On restoration, a **109.476 kWh** catch-up was credited on November 4. It cannot all be assigned to that day's production; local daily allocation and the October/November monthly split are uncertain. Overview and Energy give a short dated note, with the full explanation in Diagnostics. Whole-home Energy's selected local counter has this limitation. This page's **Cloud today**, lifetime and daily charts keep the separate cloud counter: the local catch-up is not added to them, and no equivalent cloud catch-up was established. The cloud series is not verified whole-home production.

The November 4 source-labelled dashboard was deployed and read back, then passed 16 browser cases covering all four views at desktop/mobile sizes in light/dark themes. The new historical-coverage copy still needs deployment and fresh visual verification; it does not inherit that earlier pass. All four URLs and read-only actions remain. See [QA_CHECKLIST.md](QA_CHECKLIST.md) for the dated evidence and remaining gate.

## Safety model

- The only supported Home Assistant mutation is this storage-mode Lovelace dashboard.
- No service calls, action cards, control domains, calendars, switches, selects, buttons, navigation actions, custom cards, or HACS frontend resources are admitted.
- The one external Enlighten link is ordinary read-only Markdown, not a Lovelace navigation/action control.
- Registered-but-`unavailable` optional consumption, grid, battery, EVSE, and weather entities are omitted.
- Required local power and cloud lifetime entities must exist in live state; unavailable readings are shown honestly, never converted to zero.
- Local day/seven-day counters remain excluded because the audited gateway reported zero while producing. Local lifetime energy appears only as a separate diagnostic counter; this page's daily changes continue to use cloud history.
- Cloud lifetime Recorder history began with the original 2026-08-28 deployment. Missing updates can leave gaps; cloud health is shown in Diagnostics.

See [docs/analysis.md](docs/analysis.md) for the audited data model and [QA_CHECKLIST.md](QA_CHECKLIST.md) for release evidence.

## Coverage-copy acceptance — November 5, 2026

The dated local-history notice is deployed with exact save/read-back. All four routes passed
16 desktop/mobile light/dark cases, with 42 screenshots and no browser errors. After the
notice was shortened and its Coverage details link added, the full matrix passed again;
representative captures were inspected. Local catch-up remains separate from cloud Today,
lifetime and history charts; no counter values or allocations were changed.
