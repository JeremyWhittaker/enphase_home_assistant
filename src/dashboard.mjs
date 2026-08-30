function readOnlyActions() {
  return {
    tap_action: { action: "more-info" },
    hold_action: { action: "none" },
    double_tap_action: { action: "none" },
    icon_tap_action: { action: "more-info" },
  };
}

function tile(entity, name, icon, columns = 6) {
  return {
    type: "tile",
    entity,
    name,
    icon,
    vertical: true,
    state_content: ["state"],
    grid_options: { columns, rows: 2 },
    ...readOnlyActions(),
  };
}

function heading(text, icon, style = "title") {
  return { type: "heading", heading: text, heading_style: style, icon };
}

function entityRow(entity, name, icon, { showLastUpdated = true } = {}) {
  return {
    entity,
    name,
    ...(icon ? { icon } : {}),
    ...(showLastUpdated ? { secondary_info: "last-updated" } : {}),
  };
}

function compact(values) {
  return values.filter(Boolean);
}

function entitiesCard(title, rows) {
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    state_color: true,
    entities: rows,
    // Let Home Assistant size variable-length lists from their content. Fixed
    // section-row allocations leave large blank tails on narrow screens.
    grid_options: { columns: "full" },
  };
}

function historyCard(title, hours, entities) {
  return {
    type: "history-graph",
    title,
    hours_to_show: hours,
    entities,
    grid_options: { columns: "full", rows: 5 },
  };
}

function changeGraph(title, days, entities) {
  return {
    type: "statistics-graph",
    title,
    chart_type: "bar",
    period: "day",
    days_to_show: days,
    stat_types: ["change"],
    hide_legend: false,
    entities,
    grid_options: { columns: "full", rows: 6 },
  };
}

function dailyChangeCard(entity, name) {
  return {
    type: "statistic",
    entity,
    name,
    icon: "mdi:calendar-today",
    stat_type: "change",
    period: { calendar: { period: "day" } },
    grid_options: { columns: 6, rows: 2 },
    ...readOnlyActions(),
  };
}

function unavailableCard(entities) {
  return {
    type: "entity-filter",
    state_filter: ["unknown", "unavailable"],
    show_empty: false,
    entities,
    card: {
      type: "entities",
      title: "Unavailable telemetry",
      show_header_toggle: false,
      state_color: true,
    },
    grid_options: { columns: "full" },
  };
}

function fleetTemplateSetup(e) {
  const inventoryEntity = e.microinverterReportingCount ?? e.microinverterStatus;
  const statusEntity = e.microinverterStatus ?? e.microinverterReportingCount;
  if (!inventoryEntity || !statusEntity) return null;
  return `{% set fleet = state_attr('${inventoryEntity}', 'devices') or [] %}
{% set total = state_attr('${inventoryEntity}', 'device_count') %}
{% set status_counts = state_attr('${statusEntity}', 'status_counts') or {} %}
{% set error_count = status_counts.get('error', 0) | int %}
{% set warning_count = status_counts.get('warning', 0) | int %}
{% set normal_count = status_counts.get('normal') %}
{% set issues = namespace(count=0) %}
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') | lower %}
{% if status != 'normal' or 'not reporting' in status_text or 'error' in status_text or 'warning' in status_text %}{% set issues.count = issues.count + 1 %}{% endif %}
{% endfor %}
{% set attention_count = [error_count + warning_count, issues.count] | max %}`;
}

function compactFleetDigest(e) {
  const setup = fleetTemplateSetup(e);
  if (!setup) return "**Panel health is unavailable.** Open Diagnostics for source details.";
  return `${setup}
{% if attention_count > 0 %}
**⚠️ {{ attention_count }} microinverter{% if attention_count != 1 %}s{% endif %} need{% if attention_count == 1 %}s{% endif %} attention.**
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') %}
{% if status != 'normal' or 'not reporting' in status_text | lower or 'error' in status_text | lower or 'warning' in status_text | lower %}
- **{{ inverter.get('array_name', 'Unassigned array') }}:** {{ status_text or status }}
{% endif %}
{% endfor %}
{% else %}
**✓ Array healthy**{% if normal_count is not none %} · {{ normal_count }} microinverters normal{% elif total is not none %} · {{ total }} devices inventoried{% endif %}.
{% endif %}`;
}

function overviewDigest(discovery) {
  const e = discovery.entities;
  return `{% set unavailable = ['unknown', 'unavailable', 'none', ''] %}
{% if states('${e.currentProductionPower}') | lower in unavailable %}
**⚠️ Production data is unavailable.** Open Diagnostics for source health.
{% endif %}
${e.activeSystemEvents ? `{% if is_state('${e.activeSystemEvents}', 'on') %}
**⚠️ Enphase reports an active system event.** Open Diagnostics for details.
{% endif %}` : ""}
${compactFleetDigest(e)}`;
}

function microinverterDigest(e) {
  const setup = fleetTemplateSetup(e);
  if (!setup) {
    return "Microinverter inventory health is not enabled for this site. Only live entities discovered from the verified gateway are shown.";
  }
  return `${setup}
{% if attention_count > 0 %}
**{{ normal_count if normal_count is not none else (total - attention_count if total is not none else '?') }} normal · {{ attention_count }} need{% if attention_count == 1 %}s{% endif %} attention**
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') %}
{% if status != 'normal' or 'not reporting' in status_text | lower or 'error' in status_text | lower or 'warning' in status_text | lower %}
- **{{ inverter.get('array_name', 'Unassigned array') }} · {{ inverter.get('serial_number', 'unknown inverter') }}:** {{ status_text or status }}
{% endif %}
{% endfor %}
{% else %}
**{{ normal_count if normal_count is not none else total }} microinverters normal.** No inventory warnings are reported.
{% endif %}`;
}

function overviewView(discovery) {
  const e = discovery.entities;
  const sections = [
    {
      type: "grid",
      cards: [
        heading("At a glance", "mdi:white-balance-sunny"),
        tile(e.currentProductionPower, "Producing now", "mdi:solar-power", 6),
        dailyChangeCard(e.solarProductionEnergy, "Generated today"),
        { type: "markdown", content: overviewDigest(discovery), grid_options: { columns: "full" } },
      ],
    },
    {
      type: "grid",
      cards: [
        heading("Power today", "mdi:chart-areaspline"),
        historyCard("Power · 24 hours", 24, [
          { entity: e.currentProductionPower, name: "Solar production" },
        ]),
      ],
    },
    {
      type: "grid",
      cards: [
        heading("Recent days", "mdi:chart-bar"),
        changeGraph("Daily production · 7 days", 7, [
          { entity: e.solarProductionEnergy, name: "Solar" },
        ]),
      ],
    },
  ];

  if (discovery.capabilities.consumption || discovery.capabilities.grid || discovery.capabilities.battery) {
    const cards = [heading("Optional site flows", "mdi:transmission-tower")];
    cards.push(...compact([
      e.currentConsumptionPower && tile(e.currentConsumptionPower, "Home consumption", "mdi:home-lightning-bolt"),
      e.currentGridPower && tile(e.currentGridPower, "Grid (+ import / − export)", "mdi:transmission-tower"),
      e.currentBatteryPower && tile(e.currentBatteryPower, "Battery (+ supply / − charge)", "mdi:home-battery"),
      e.batteryChargeLevel && tile(e.batteryChargeLevel, "Battery charge", "mdi:battery-high"),
      e.batteryStatus && tile(e.batteryStatus, "Battery status", "mdi:battery-heart"),
    ]));
    sections.push({ type: "grid", cards });
  }

  if (discovery.capabilities.weather) {
    sections.push({
      type: "grid",
      cards: [
        heading("Site weather", "mdi:weather-partly-cloudy"),
        {
          type: "weather-forecast",
          entity: e.weather,
          show_current: true,
          show_forecast: true,
          forecast_type: "daily",
          grid_options: { columns: "full", rows: 5 },
        },
      ],
    });
  }

  return {
    title: "Overview",
    path: "overview",
    icon: "mdi:view-dashboard-outline",
    type: "sections",
    max_columns: 3,
    dense_section_placement: true,
    sections,
  };
}

function energyView(discovery) {
  const e = discovery.entities;
  const sections = [
    {
      type: "grid",
      cards: [
        heading("Production totals", "mdi:solar-power"),
        dailyChangeCard(e.solarProductionEnergy, "Generated today"),
        tile(e.solarProductionEnergy, "Lifetime production", "mdi:counter", 6),
      ],
    },
    {
      type: "grid",
      cards: [
        heading("Daily production", "mdi:chart-bar"),
        changeGraph("Daily production · 30 days", 30, [
          { entity: e.solarProductionEnergy, name: "Solar" },
        ]),
      ],
    },
    {
      type: "grid",
      cards: [
        heading("Power profile", "mdi:chart-areaspline"),
        historyCard("Power · 48 hours", 48, [
          { entity: e.currentProductionPower, name: "Solar production" },
        ]),
      ],
    },
  ];

  if (discovery.capabilities.consumption) {
    const cards = [heading("Consumption", "mdi:home-lightning-bolt")];
    if (e.currentConsumptionPower) cards.push(historyCard("Consumption power · last 48 hours", 48, [{ entity: e.currentConsumptionPower, name: "Home consumption" }]));
    if (e.consumptionEnergy) {
      cards.push(changeGraph("Daily consumption · last 30 days", 30, [{ entity: e.consumptionEnergy, name: "Home consumed" }]));
      cards.push(entitiesCard("Consumption total", [entityRow(e.consumptionEnergy, "Lifetime consumption")]));
    }
    sections.push({ type: "grid", cards });
  }

  if (discovery.capabilities.grid) {
    const cards = [heading("Grid exchange", "mdi:transmission-tower")];
    if (e.currentGridPower) cards.push(historyCard("Grid power · last 48 hours (+ import / − export)", 48, [{ entity: e.currentGridPower, name: "Grid" }]));
    const energyEntities = compact([
      e.gridImportEnergy && { entity: e.gridImportEnergy, name: "Imported" },
      e.gridExportEnergy && { entity: e.gridExportEnergy, name: "Exported" },
    ]);
    if (energyEntities.length) cards.push(changeGraph("Daily grid energy · last 30 days", 30, energyEntities));
    const totals = compact([
      e.gridImportEnergy && entityRow(e.gridImportEnergy, "Lifetime imported"),
      e.gridExportEnergy && entityRow(e.gridExportEnergy, "Lifetime exported"),
    ]);
    if (totals.length) cards.push(entitiesCard("Grid totals", totals));
    sections.push({ type: "grid", cards });
  }

  if (discovery.capabilities.battery) {
    const cards = [heading("Battery", "mdi:home-battery")];
    if (e.currentBatteryPower) cards.push(historyCard("Battery power · last 48 hours (+ supply / − charge)", 48, [{ entity: e.currentBatteryPower, name: "Battery" }]));
    const energyEntities = compact([
      e.batteryChargeEnergy && { entity: e.batteryChargeEnergy, name: "Charged" },
      e.batteryDischargeEnergy && { entity: e.batteryDischargeEnergy, name: "Discharged" },
    ]);
    if (energyEntities.length) cards.push(changeGraph("Daily battery energy · last 30 days", 30, energyEntities));
    const totals = compact([
      e.batteryChargeEnergy && entityRow(e.batteryChargeEnergy, "Lifetime charged"),
      e.batteryDischargeEnergy && entityRow(e.batteryDischargeEnergy, "Lifetime discharged"),
      e.batteryAvailableEnergy && entityRow(e.batteryAvailableEnergy, "Available energy"),
    ]);
    if (totals.length) cards.push(entitiesCard("Battery energy", totals));
    sections.push({ type: "grid", cards });
  }

  return {
    title: "Energy",
    path: "energy",
    icon: "mdi:chart-bar",
    type: "sections",
    max_columns: 3,
    dense_section_placement: true,
    sections,
  };
}

function microinvertersByArray(microinverters) {
  const groups = new Map();
  for (const microinverter of microinverters) {
    const records = groups.get(microinverter.arrayName) ?? [];
    records.push(microinverter);
    groups.set(microinverter.arrayName, records);
  }
  return [...groups.entries()].map(([arrayName, records]) => ({ arrayName, records }));
}

function inverterDisplayName(microinverter) {
  const prefix = `${microinverter.arrayName} · `;
  return microinverter.label.startsWith(prefix) ? microinverter.label.slice(prefix.length) : microinverter.label;
}

function microinvertersView(discovery) {
  const e = discovery.entities;
  const sections = [{
    type: "grid",
    cards: [
      heading("Array status", "mdi:solar-panel-large"),
      {
        type: "markdown",
        content: `${compactFleetDigest(e)}\n\n[Open array layout in Enphase ↗](https://enlighten.enphaseenergy.com/systems/5815605/arrays)`,
        grid_options: { columns: "full" },
      },
    ],
  }];

  for (const { arrayName, records } of microinvertersByArray(discovery.microinverters)) {
    const rows = [...records]
      .filter((microinverter) => microinverter.power)
      .sort((left, right) => Number(Boolean(right.problem)) - Number(Boolean(left.problem)))
      .map((microinverter) => entityRow(
        microinverter.power,
        inverterDisplayName(microinverter),
        microinverter.problem ? "mdi:alert-circle" : "mdi:flash",
        { showLastUpdated: false },
      ));
    if (!rows.length) continue;
    sections.push({
      type: "grid",
      cards: [
        heading(`${arrayName} array`, "mdi:solar-panel"),
        entitiesCard("Live power", rows),
      ],
    });
  }

  if (!discovery.capabilities.microinverters) {
    sections[0].cards.push({
      type: "markdown",
      content: "No enabled microinverter capability was discovered for site 2103. Enable microinverter inventory or telemetry in the Enphase Energy integration, then run preflight again.",
      grid_options: { columns: "full" },
    });
  }

  return {
    title: "Arrays",
    path: "microinverters",
    icon: "mdi:solar-panel-large",
    type: "sections",
    max_columns: 3,
    dense_section_placement: true,
    sections,
  };
}

function diagnosticsView(discovery) {
  const e = discovery.entities;
  const unavailable = compact([
    entityRow(e.currentProductionPower, "Local production"),
    entityRow(e.solarProductionEnergy, "Lifetime production"),
    e.currentConsumptionPower && entityRow(e.currentConsumptionPower, "Home consumption"),
    e.currentGridPower && entityRow(e.currentGridPower, "Grid power"),
    e.currentBatteryPower && entityRow(e.currentBatteryPower, "Battery power"),
    e.serviceStatus && entityRow(e.serviceStatus, "Cloud service"),
    e.cloudReachable && entityRow(e.cloudReachable, "Enphase cloud"),
  ]);
  const cloudRows = compact([
    e.serviceStatus && entityRow(e.serviceStatus, "Cloud service", "mdi:cloud-check"),
    e.cloudReachable && entityRow(e.cloudReachable, "Cloud reachable", "mdi:cloud-check-variant"),
    e.activeSystemEvents && entityRow(e.activeSystemEvents, "Active system events", "mdi:alert-circle-outline"),
    e.cloudErrorCode && entityRow(e.cloudErrorCode, "Cloud error", "mdi:cloud-alert"),
    e.lastSuccessfulUpdate && entityRow(e.lastSuccessfulUpdate, "Last successful update", "mdi:update"),
    e.cloudLatency && entityRow(e.cloudLatency, "Cloud latency", "mdi:speedometer"),
    e.cloudProductionPower && entityRow(e.cloudProductionPower, "Portal power snapshot (lagged)", "mdi:cloud-sync"),
  ]);
  const sections = [
    {
      type: "grid",
      cards: [
        heading("Current issues", "mdi:alert-circle-outline"),
        { type: "markdown", content: microinverterDigest(e), grid_options: { columns: "full" } },
        unavailableCard(unavailable),
      ],
    },
    {
      type: "grid",
      cards: [heading("Enphase cloud", "mdi:cloud-outline"), entitiesCard("Cloud details", cloudRows)],
    },
  ];

  const gatewayRows = compact([
    entityRow(e.currentProductionPower, "Local production telemetry", "mdi:solar-power"),
    e.gatewayStatus && entityRow(e.gatewayStatus, "Gateway inventory status", "mdi:router-wireless"),
    e.gatewayLastReported && entityRow(e.gatewayLastReported, "Gateway last reported", "mdi:clock-check-outline"),
    e.gatewayProductionMeter && entityRow(e.gatewayProductionMeter, "Production meter", "mdi:meter-electric-outline"),
    e.gatewayConsumptionMeter && entityRow(e.gatewayConsumptionMeter, "Consumption meter", "mdi:meter-electric"),
  ]);
  if (gatewayRows.length) {
    sections.push({
      type: "grid",
      cards: [heading("Gateway", "mdi:router-wireless"), entitiesCard("Gateway health", gatewayRows)],
    });
  }

  const batteryRows = compact([
    e.batteryStatus && entityRow(e.batteryStatus, "Battery status", "mdi:battery-heart"),
    e.batteryChargeLevel && entityRow(e.batteryChargeLevel, "Charge level", "mdi:battery-high"),
    e.batteryAvailablePower && entityRow(e.batteryAvailablePower, "Available power", "mdi:flash"),
    e.batteryAvailableEnergy && entityRow(e.batteryAvailableEnergy, "Available energy", "mdi:battery-charging"),
    e.batteryLastReported && entityRow(e.batteryLastReported, "Last reported", "mdi:clock-check-outline"),
  ]);
  if (batteryRows.length) {
    sections.push({
      type: "grid",
      cards: [heading("Storage health", "mdi:home-battery-outline"), entitiesCard("Battery status", batteryRows)],
    });
  }

  const microRows = compact([
    e.microinverterStatus && entityRow(e.microinverterStatus, "Fleet connectivity", "mdi:access-point-check"),
    e.microinverterReportingCount && entityRow(e.microinverterReportingCount, "Inventory devices", "mdi:solar-panel"),
    e.microinverterLastReported && entityRow(e.microinverterLastReported, "Inventory last reported", "mdi:clock-check-outline"),
  ]);
  if (microRows.length) {
    sections.push({
      type: "grid",
      cards: [heading("Array telemetry", "mdi:solar-panel-large"), entitiesCard("Raw fleet status", microRows)],
    });
  }

  for (const { arrayName, records } of microinvertersByArray(discovery.microinverters)) {
    const rows = records
      .filter((microinverter) => microinverter.lifetimeEnergy)
      .map((microinverter) => entityRow(
        microinverter.lifetimeEnergy,
        `${inverterDisplayName(microinverter)} · ${microinverter.serial}`,
        "mdi:counter",
      ));
    if (!rows.length) continue;
    sections.push({
      type: "grid",
      cards: [heading(`${arrayName} counters`, "mdi:counter"), entitiesCard("Lifetime production", rows)],
    });
  }

  sections.push({
    type: "grid",
    cards: [
      heading("About the data", "mdi:information-outline"),
      {
        type: "markdown",
        content: `**Site:** 2103 · Enlighten system **${discovery.site.systemId}**<br>
**IQ Gateway:** **${discovery.site.gatewaySerial}**

Live production and per-inverter power come directly from the local IQ Gateway. Lifetime energy and equipment inventory come from Enlighten, and Home Assistant Recorder calculates daily production from that lifetime counter.

The gateway's local today and seven-day counters are excluded because they can report zero during active production. This dashboard is independent of Home Assistant's global Energy configuration and does not use Enphase's paid developer API. A cloud status of **Degraded** can reflect optional endpoint families even while core solar telemetry remains available.`,
        grid_options: { columns: "full" },
      },
    ],
  });

  return {
    title: "Diagnostics",
    path: "system",
    icon: "mdi:stethoscope",
    type: "sections",
    max_columns: 3,
    dense_section_placement: true,
    sections,
  };
}

export function buildDashboard(discovery) {
  if (!discovery?.site || !discovery?.entities) throw new TypeError("Valid Enphase discovery is required");
  return {
    views: [
      overviewView(discovery),
      energyView(discovery),
      microinvertersView(discovery),
      diagnosticsView(discovery),
    ],
  };
}

export const dashboardMetadata = Object.freeze({
  urlPath: "enphase-2103",
  title: "Enphase 2103",
  icon: "mdi:solar-panel-large",
  showInSidebar: true,
  requireAdmin: false,
});
