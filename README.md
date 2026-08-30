# Enphase 2103 Home Assistant dashboard

A native, read-only Home Assistant dashboard for Jeremy's **2103** Enphase site (Enlighten system **5815605**). It installs as a dedicated **Enphase 2103** sidebar panel with responsive Overview, Energy, Arrays, and Diagnostics views.

The project deliberately uses a validated hybrid data path:

- the official `enphase_envoy` integration supplies one-minute local aggregate production and all 14 live microinverter power readings;
- the read-only `enphase_ev` integration identifies the exact Enlighten site and supplies its monotonic lifetime-energy counter, inventory, connectivity, and cloud health;
- Recorder statistics derive today/recent-day energy changes from that cloud lifetime counter;
- Home Assistant's account-global `energy-*` cards are never used, because this server's Energy configuration belongs to EG4.

Runtime entity IDs are not fixed in source. Discovery follows config-entry and entity-registry relationships and stable integration unique IDs, then validates every reference against live state. It fails closed if the cloud site or local gateway is missing, unloaded, or ambiguous.

## Views

- **Overview** — current local power, Recorder-derived production today, one concise actionable array-health message, and separate 24-hour/seven-day trend columns.
- **Energy** — today and lifetime production plus 30-day energy and 48-hour power trends; optional consumption, grid, and battery sections appear only when those channels become available.
- **Arrays** — live inverter output grouped by the real Pool shade and South west arrays, with short row labels and a direct [Enlighten array view](https://enlighten.enphaseenergy.com/systems/5815605/arrays).
- **Diagnostics** — exact fault serials, source freshness, gateway/cloud/raw fleet health, per-inverter lifetime counters, unavailable telemetry, site identity, and data-source notes.

The visible Arrays and Diagnostics tabs preserve the original `/microinverters` and `/system` routes so existing bookmarks continue to work. Daily-use views deliberately omit integration names, API notes, raw timestamps, serial-number lists, and optional cloud-endpoint details.

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

## Current deployment

The professional layout was deployed transactionally to Home Assistant 2026.8.3 on 2026-08-30 at `/enphase-2103/overview`. Final live preflight resolves 38 entities into 57 native cards across four views, renders three Jinja health summaries on the server, and returns `action=unchanged` after exact storage read-back. Both Enphase config entries remain loaded and all 14 local inverter entities are available.

The final browser report is `/tmp/enphase-home-assistant-professional-qa.czglBE/report.json`: 16 route/theme/viewport cases and 36 overlapping screenshots passed with no actionable browser errors. Representative Overview, Energy, Arrays, and Diagnostics screens were inspected manually in desktop/mobile and light/dark modes. The only allowed frontend noise comes from a globally loaded camera-card resource and a scoped-custom-element-registry source-map request that this native dashboard does not reference. The existing Home Assistant Prometheus endpoint continues to export the aggregate, inverter, and cloud entities through its established scrape.

## Safety model

- The only supported Home Assistant mutation is this storage-mode Lovelace dashboard.
- No service calls, action cards, control domains, calendars, switches, selects, buttons, navigation actions, custom cards, or HACS frontend resources are admitted.
- The one external Enlighten link is ordinary read-only Markdown, not a Lovelace navigation/action control.
- Registered-but-`unavailable` optional consumption, grid, battery, EVSE, and weather entities are omitted.
- Required local power and cloud lifetime entities must exist in live state; unavailable readings are shown honestly, never converted to zero.
- Local day/seven-day counters are intentionally excluded because the audited gateway reported zero while producing. The older local lifetime statistic is also excluded because its recovery catch-up jump would distort daily change.
- Cloud lifetime Recorder history began with the original 2026-08-28 deployment and now provides complete daily bars.

See [docs/analysis.md](docs/analysis.md) for the audited data model and [QA_CHECKLIST.md](QA_CHECKLIST.md) for release evidence.
