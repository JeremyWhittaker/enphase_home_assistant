# Enphase 2103 and Home Assistant analysis

Data audit: 2026-08-28; dashboard UX refinement: 2026-08-30 (America/Phoenix)

## Selected system and integrations

The account contains two Enlighten systems. This project admits only site name **2103**, Enlighten system id **5815605**. Selection is fail-closed and uses the `enphase_ev` config entry plus exact entity-registry unique IDs such as `enphase_ev_site_5815605_solar_production`; it does not select by a mutable runtime entity ID.

The initial official `enphase_envoy` entry pointed at a stale address and all 18 local entities were unavailable. After its host was corrected through Home Assistant, the verified IQ Gateway loaded on firmware D8.3.5433. The project binds that gateway through its exact serial-scoped entity-registry identifiers. Home Assistant 2026.8 may return null config-entry `unique_id` and device `config_entries`, so discovery uses the reliable entity-registry `config_entry_id`, `platform`, and `unique_id` relationships, with the exact entry title as secondary evidence.

## Data-source decision

No single audited source was correct for every time horizon:

| Question | Selected source | Reason |
| --- | --- | --- |
| Current site production | official local `enphase_envoy` aggregate | Direct LAN reading; one-minute updates; audited live while producing |
| Current panel production | 14 official local inverter sensors | Direct per-inverter readings; exposed the zero-power Pool shade unit |
| Lifetime/site energy | `enphase_ev` site solar production | Current monotonic kWh counter with `total_increasing`; correct basis for new Recorder statistics |
| Today/recent days | Recorder change statistics on cloud lifetime | Avoids inaccurate local day/seven-day counters and global EG4 Energy cards |
| Fleet inventory/health | `enphase_ev` reporting + connectivity attributes | Contains array membership, device status text, counts, model/firmware summaries |
| Per-inverter lifetime | 14 `enphase_ev_inverter_<serial>_lifetime_energy` sensors | Semantically paired to local panel power through exact serials |

The local daily and seven-day production entities reported `0.0` while aggregate production was active, so they are not treated as authoritative. The local lifetime statistic had a gap followed by an approximately 175 kWh catch-up jump after recovery, which would corrupt a calendar-day `change`. The cloud lifetime entity was newly created at audit time and had no history, so Recorder-derived daily output will be partial initially and first becomes a complete daily bar after the next midnight.

## Live fleet finding

The site inventory reports 14 IQ microinverters across two arrays:

- South west: 13;
- Pool shade: 1.

At audit time the aggregate active count was 14 and connectivity state was `Online`, but connectivity attributes reported 13 normal and one error. Pool shade inverter `482237045136` had status text `Microinverter Not Reporting`, no last report, and local power of 0 while the other 13 local sensors produced roughly 266–276 W.

The dashboard therefore does not equate aggregate `Online` with healthy. Its three dynamic health summaries read `status_counts` from the connectivity entity and loop the device records from the reporting entity. Overview and Arrays show only the affected array and human-readable condition; Diagnostics adds the exact serial. Live inverter rows are grouped by the real array name and omit state-change timestamps, while cloud lifetime sensors remain paired to local power sensors by serial rather than runtime entity name.

## Optional capability handling

Cloud consumption, grid import/export, battery charge/discharge, and EVSE lifetime entities were registered but unavailable for this site. They are excluded during discovery instead of creating empty cards. Consumption, grid, battery, weather, gateway detail, storage, and diagnostic sections are assembled only from available enabled entities.

Unknown aggregate gateway/microinverter values can remain visible as diagnostic evidence while the integration warms up. A `Degraded` cloud service state is not headlined as a site outage because the audit showed it could result from unsupported/disabled optional meters while core solar data remained healthy. That distinction and cloud reachability are confined to Diagnostics.

## Information architecture

1. **Overview:** What is happening now, what was generated today, and is there one actionable array issue?
2. **Energy:** How much was generated today and over recent complete Recorder periods?
3. **Arrays:** Which real array and inverter are producing now?
4. **Diagnostics:** What are the exact fault, source, freshness, gateway, inventory, and lifetime-counter details?

All views use native Sections layouts and built-in display cards. Overview and Energy use three purposeful desktop columns that stack naturally on mobile. Arrays groups short, timestamp-free live rows by the site's Pool shade and South west array names; per-inverter lifetime counters and serials live under Diagnostics. The Energy view uses `statistic` and `statistics-graph` against the selected cloud lifetime entity, never Home Assistant's global `energy-*` cards. Visible names changed from Microinverters/System to Arrays/Diagnostics while their routes remain `/microinverters` and `/system` for compatibility.

## Security and deployment

The dashboard is monitoring-only. Validation permits entity domains `sensor`, `binary_sensor`, and `weather`, plus the actions `none` and `more-info`; it rejects control domains, service/action/navigation keys, custom cards, and global Energy card types. The supplied Enlighten arrays URL is a plain Markdown hyperlink.

Every referenced entity must exist in live state. All Jinja strings are rendered through Home Assistant's `/api/template` endpoint during preflight. Create/update is storage-mode only, preceded by a private checksummed backup, verified by an exact read-back, and automatically rolled back on failure. Explicit restore is checksum- and drift-guarded.

## Live deployment and verification

The `enphase-2103` storage dashboard was created on 2026-08-28 and professionally restructured transactionally on 2026-08-30. The final preflight against Home Assistant 2026.8.3 resolves 38 live entities into 57 native cards across four views, renders three Jinja templates, and reports `action=unchanged` after exact read-back. The dashboard registry round-trip confirms title **Enphase 2103**, sidebar visibility, storage mode, and the expected icon. Both Enphase entries remain `loaded` and the live UI continues to show all 14 local inverter entities.

Final runtime evidence showed 14/14 local inverter entities available, with only Pool shade inverter `482237045136` at zero power; cloud inventory independently continued to report 13 normal and one error. The existing observability backend was also corrected to the recovered gateway address and returned a successful local read with 14 inverters.

The final browser gate rendered every view at 1440×1000 and 390×844 in light and dark modes. Its report (`/tmp/enphase-home-assistant-professional-qa.czglBE/report.json`) contains 16 cases and 36 overlapping screenshots and reports zero actionable browser errors. Representative desktop/mobile images for every view were inspected manually. The Arrays mobile view dropped from five screenshot segments to two after lifetime counters and raw diagnostics moved off the operational view. Allowed errors are restricted to the pre-existing global advanced-camera-card `focus-trap`/`side-drawer` duplicate registrations and the scoped-custom-element-registry source-map 404; this dashboard uses no custom frontend resource.

## GitHub research

- [barneyonline/ha-enphase-energy](https://github.com/barneyonline/ha-enphase-energy) is the installed cloud integration (`enphase_ev`). It supports site, gateway, microinverter, battery, EV charger, weather, and health entities through undocumented Enlighten services, including rate-conscious microinverter polling.
- [Home Assistant core Enphase Envoy](https://github.com/home-assistant/core/tree/dev/homeassistant/components/enphase_envoy) is the chosen local source.
- [briancmpbll/home_assistant_custom_envoy](https://github.com/briancmpbll/home_assistant_custom_envoy) demonstrates similar local capabilities but is unnecessary when the repaired official integration is loaded.

This architecture avoids the paid Enphase developer API. The custom cloud endpoint remains a change risk, which is why local current production is primary and cloud failures are observable.
