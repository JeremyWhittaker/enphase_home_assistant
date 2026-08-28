# Enphase 2103 Home Assistant dashboard

A native, read-only Home Assistant dashboard for Jeremy's **2103** Enphase site (Enlighten system **5815605**). It installs as a dedicated **Enphase 2103** sidebar panel with responsive Overview, Energy, Microinverters, and System views.

The project deliberately uses a validated hybrid data path:

- the official `enphase_envoy` integration supplies one-minute local aggregate production and all 14 live microinverter power readings;
- the read-only `enphase_ev` integration identifies the exact Enlighten site and supplies its monotonic lifetime-energy counter, inventory, connectivity, and cloud health;
- Recorder statistics derive today/recent-day energy changes from that cloud lifetime counter;
- Home Assistant's account-global `energy-*` cards are never used, because this server's Energy configuration belongs to EG4.

Runtime entity IDs are not fixed in source. Discovery follows config-entry and entity-registry relationships and stable integration unique IDs, then validates every reference against live state. It fails closed if the cloud site or local gateway is missing, unloaded, or ambiguous.

## Views

- **Overview** — dynamic live digest, current local solar output, Recorder-derived production today, 24-hour power, seven-day energy, and only the optional site capabilities that actually have available entities.
- **Energy** — cloud lifetime production and Recorder-derived daily/30-day changes; optional consumption, grid, and battery sections appear only when those channels become available.
- **Microinverters** — inventory health that inspects error counts and individual device status text, all local per-panel power values, matched cloud lifetime production, and the supplied [Enlighten array view](https://enlighten.enphaseenergy.com/systems/5815605/arrays).
- **System** — exact site identity, local/cloud source health, gateway, array, storage, and event diagnostics when available.

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

The dashboard was deployed to Home Assistant 2026.8.3 on 2026-08-28 at `/enphase-2103/overview`. Final live preflight resolved 39 entities into 50 native cards, rendered both Jinja digests on the server, and returned an `unchanged` plan after the transactional update. Home Assistant configuration validation returned HTTP 200; both Enphase config entries were `loaded`; all 14 local inverter entities were available.

The final browser report is `/tmp/enphase-home-assistant-qa.1Ot42Z/report.json`: 16 route/theme/viewport cases and 38 full-scroll screenshots passed with no actionable browser errors. The only allowed frontend noise came from a globally loaded camera-card resource that this dashboard does not reference. The existing Home Assistant Prometheus endpoint also exports the new aggregate, inverter, and cloud entities, so the observability stack receives them through its established HA scrape.

## Safety model

- The only supported Home Assistant mutation is this storage-mode Lovelace dashboard.
- No service calls, action cards, control domains, calendars, switches, selects, buttons, navigation actions, custom cards, or HACS frontend resources are admitted.
- The one external Enlighten link is ordinary read-only Markdown, not a Lovelace navigation/action control.
- Registered-but-`unavailable` optional consumption, grid, battery, EVSE, and weather entities are omitted.
- Required local power and cloud lifetime entities must exist in live state; unavailable readings are shown honestly, never converted to zero.
- Local day/seven-day counters are intentionally excluded because the audited gateway reported zero while producing. The older local lifetime statistic is also excluded because its recovery catch-up jump would distort daily change.
- Cloud lifetime Recorder history begins with this deployment; the first complete daily bar appears after the next midnight.

See [docs/analysis.md](docs/analysis.md) for the audited data model and [QA_CHECKLIST.md](QA_CHECKLIST.md) for release evidence.
