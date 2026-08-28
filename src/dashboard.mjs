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
    state_content: ["state", "last_updated"],
    grid_options: { columns, rows: 2 },
    ...readOnlyActions(),
  };
}

function badge(entity, name, icon) {
  return { type: "entity", entity, name, icon, ...readOnlyActions() };
}

function heading(text, icon, style = "title") {
  return { type: "heading", heading: text, heading_style: style, icon };
}

function entityRow(entity, name, icon) {
  return { entity, name, ...(icon ? { icon } : {}), secondary_info: "last-updated" };
}

function compact(values) {
  return values.filter(Boolean);
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function entitiesCard(title, rows) {
  return {
    type: "entities",
    title,
    show_header_toggle: false,
    state_color: true,
    entities: rows,
    // Size to the actual row count so small remainder groups do not create
    // multi-screen blank cards on mobile. Twelve-row groups remain capped.
    grid_options: { columns: "full", rows: Math.max(3, Math.min(12, rows.length + 2)) },
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

function powerText(entity, variable) {
  return `{% set ${variable}_raw = states('${entity}') %}
{% set ${variable}_unit = state_attr('${entity}', 'unit_of_measurement') or '' %}`;
}

function renderPower(variable) {
  return `{% if ${variable}_unit | lower == 'w' %}{{ ((${variable}_raw | float) / 1000) | round(2) }} kW{% else %}{{ ${variable}_raw }} {{ ${variable}_unit }}{% endif %}`;
}

function liveDigest(discovery) {
  const e = discovery.entities;
  const setup = [
    "{% set unavailable = ['unknown', 'unavailable', 'none', ''] %}",
    powerText(e.currentProductionPower, "solar"),
  ];
  if (e.currentConsumptionPower) setup.push(powerText(e.currentConsumptionPower, "consumption"));
  if (e.currentGridPower) setup.push(powerText(e.currentGridPower, "grid"));
  if (e.currentBatteryPower) setup.push(powerText(e.currentBatteryPower, "battery"));
  if (e.batteryChargeLevel) setup.push(`{% set battery_soc_raw = states('${e.batteryChargeLevel}') %}`);

  const details = [];
  if (e.currentConsumptionPower) {
    details.push(`{% if consumption_raw | lower not in unavailable %}Home consumption is **${renderPower("consumption")}**.{% endif %}`);
  }
  if (e.currentGridPower) {
    details.push(`{% if grid_raw | lower not in unavailable %}{% set grid_value = grid_raw | float %}{% if grid_value > 50 %}Importing **${renderPower("grid")}** from the grid.{% elif grid_value < -50 %}Exporting **{% if grid_unit | lower == 'w' %}{{ ((grid_value | abs) / 1000) | round(2) }} kW{% else %}{{ grid_value | abs }} {{ grid_unit }}{% endif %}** to the grid.{% else %}Grid exchange is effectively neutral.{% endif %}{% endif %}`);
  }
  if (e.currentBatteryPower || e.batteryChargeLevel) {
    const clauses = [];
    if (e.batteryChargeLevel) {
      clauses.push(`{% if battery_soc_raw | lower not in unavailable %}Battery is **{{ battery_soc_raw }}{{ state_attr('${e.batteryChargeLevel}', 'unit_of_measurement') or '%' }}**{% endif %}`);
    }
    if (e.currentBatteryPower) {
      clauses.push(`{% if battery_raw | lower not in unavailable %}{% set battery_value = battery_raw | float %}{% if battery_value > 50 %}Battery is supplying **${renderPower("battery")}**.{% elif battery_value < -50 %}Battery is charging at **{% if battery_unit | lower == 'w' %}{{ ((battery_value | abs) / 1000) | round(2) }} kW{% else %}{{ battery_value | abs }} {{ battery_unit }}{% endif %}**.{% else %}Battery power is effectively idle.{% endif %}{% endif %}`);
    }
    details.push(clauses.join(" · "));
  }
  if (e.microinverterReportingCount) {
    details.push(`{% set reporting = states('${e.microinverterReportingCount}') %}
{% set total = state_attr('${e.microinverterReportingCount}', 'device_count') %}
{% set fleet = state_attr('${e.microinverterReportingCount}', 'devices') or [] %}
{% set status_counts = state_attr('${e.microinverterStatus ?? e.microinverterReportingCount}', 'status_counts') or {} %}
{% set error_count = status_counts.get('error', 0) | int %}
{% set warning_count = status_counts.get('warning', 0) | int %}
{% set issues = namespace(count=0) %}
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') | lower %}
{% if status != 'normal' or 'not reporting' in status_text or 'error' in status_text or 'warning' in status_text %}{% set issues.count = issues.count + 1 %}{% endif %}
{% endfor %}
{% if error_count > 0 or warning_count > 0 or issues.count > 0 %}
⚠️ **Microinverter attention:** {{ error_count }} error and {{ warning_count }} warning status{% if error_count + warning_count != 1 %}es{% endif %}, even if fleet connectivity says Online.
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') %}
{% if status != 'normal' or 'not reporting' in status_text | lower or 'error' in status_text | lower or 'warning' in status_text | lower %}
- **{{ inverter.get('array_name', 'Unassigned array') }} · {{ inverter.get('serial_number', 'unknown inverter') }}:** {{ status_text or status }}
{% endif %}
{% endfor %}
{% elif reporting | lower not in unavailable %}
**{{ reporting }}** microinverters are reporting{% if total is not none %} out of **{{ total }}**{% endif %} with no inventory warnings.
{% endif %}`);
  }
  if (e.serviceStatus) {
    details.push(`{% set service = states('${e.serviceStatus}') %}{% if service | lower == 'degraded' %}Cloud solar data is available; one or more optional cloud endpoint families are **degraded**.{% else %}Cloud service health: **{{ service }}**.{% endif %}`);
  }
  if (e.cloudReachable) {
    details.push(`Cloud connection: {% if is_state('${e.cloudReachable}', 'on') %}**reachable**{% else %}**not reachable**{% endif %}.`);
  }
  if (e.activeSystemEvents) {
    details.push(`{% if is_state('${e.activeSystemEvents}', 'on') %}⚠️ **An active Enphase system event is reported.**{% endif %}`);
  }
  if (e.weather) {
    details.push(`Site weather: **{{ states('${e.weather}') }}**{% set temperature = state_attr('${e.weather}', 'temperature') %}{% if temperature is not none %}, {{ temperature }}{{ state_attr('${e.weather}', 'temperature_unit') or '°' }}{% endif %}.`);
  }

  return `${setup.join("\n")}
{% if solar_raw | lower in unavailable %}
## ⚠️ Solar telemetry is unavailable
The integration is not currently providing production power. The dashboard leaves the value unavailable rather than treating it as zero.
{% else %}
{% set solar_value = solar_raw | float %}
{% set solar_w = solar_value if solar_unit | lower == 'w' else solar_value * 1000 if solar_unit | lower == 'kw' else solar_value %}
{% if solar_w > 25 %}
## ☀️ 2103 is producing now
Current solar output is **${renderPower("solar")}**.
{% else %}
## 🌙 2103 is currently quiet
Current solar output is **${renderPower("solar")}**.
{% endif %}
${details.join("\n")}
{% endif %}`;
}

function microinverterDigest(e) {
  if (!e.microinverterReportingCount && !e.microinverterStatus) {
    return "Per-microinverter summary telemetry is not enabled for this site. Only enabled, live Enphase entities are included below.";
  }
  const lines = ["## Microinverter fleet"];
  if (e.microinverterReportingCount) {
    lines.push(`{% set reporting = states('${e.microinverterReportingCount}') %}
{% set total = state_attr('${e.microinverterReportingCount}', 'device_count') %}
{% set fleet = state_attr('${e.microinverterReportingCount}', 'devices') or [] %}
{% set status_counts = state_attr('${e.microinverterStatus ?? e.microinverterReportingCount}', 'status_counts') or {} %}
{% set error_count = status_counts.get('error', 0) | int %}
{% set warning_count = status_counts.get('warning', 0) | int %}
{% set issues = namespace(count=0) %}
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') | lower %}
{% if status != 'normal' or 'not reporting' in status_text or 'error' in status_text or 'warning' in status_text %}{% set issues.count = issues.count + 1 %}{% endif %}
{% endfor %}
**{{ reporting }}** reporting{% if total is not none %} of **{{ total }}** installed{% endif %}.
{% if error_count > 0 or warning_count > 0 or issues.count > 0 %}
### ⚠️ Inventory reports {{ error_count }} error / {{ warning_count }} warning
{% for inverter in fleet %}
{% set status = inverter.get('status', '') | lower %}
{% set status_text = inverter.get('statusText', '') %}
{% if status != 'normal' or 'not reporting' in status_text | lower or 'error' in status_text | lower or 'warning' in status_text | lower %}
- **{{ inverter.get('array_name', 'Unassigned array') }} · {{ inverter.get('serial_number', 'unknown inverter') }}:** {{ status_text or status }}
{% endif %}
{% endfor %}
{% else %}
Inventory reports no warning or error status.
{% endif %}`);
  }
  if (e.microinverterStatus) lines.push(`Connectivity: **{{ states('${e.microinverterStatus}') }}**.`);
  return lines.join("\n");
}

function overviewView(discovery) {
  const e = discovery.entities;
  const badges = compact([
    badge(e.currentProductionPower, "Solar", "mdi:solar-power"),
    e.currentConsumptionPower && badge(e.currentConsumptionPower, "Home", "mdi:home-lightning-bolt"),
    e.batteryChargeLevel && badge(e.batteryChargeLevel, "Battery", "mdi:home-battery"),
    e.microinverterReportingCount && badge(e.microinverterReportingCount, "Microinverters", "mdi:solar-panel"),
  ]);
  const unavailable = compact([
    entityRow(e.currentProductionPower, "Solar production"),
    entityRow(e.solarProductionEnergy, "Lifetime solar energy"),
    e.currentConsumptionPower && entityRow(e.currentConsumptionPower, "Home consumption"),
    e.currentGridPower && entityRow(e.currentGridPower, "Grid power"),
    e.currentBatteryPower && entityRow(e.currentBatteryPower, "Battery power"),
    e.serviceStatus && entityRow(e.serviceStatus, "Cloud service health"),
    e.cloudReachable && entityRow(e.cloudReachable, "Enphase cloud"),
  ]);

  const sections = [
    {
      type: "grid",
      cards: [
        heading("Live solar", "mdi:solar-power"),
        { type: "markdown", content: liveDigest(discovery), grid_options: { columns: "full" } },
        unavailableCard(unavailable),
        tile(e.currentProductionPower, "Solar production", "mdi:solar-power", 6),
        tile(e.solarProductionEnergy, "Lifetime solar", "mdi:counter", 6),
        dailyChangeCard(e.solarProductionEnergy, "Solar today"),
        heading("Production history", "mdi:chart-areaspline", "subtitle"),
        historyCard("Solar power · last 24 hours", 24, [
          { entity: e.currentProductionPower, name: "Solar production" },
        ]),
        changeGraph("Daily solar energy · last 7 days", 7, [
          { entity: e.solarProductionEnergy, name: "Solar generated" },
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
    badges,
    sections,
  };
}

function energyView(discovery) {
  const e = discovery.entities;
  const sections = [
    {
      type: "grid",
      cards: [
        heading("Solar production history", "mdi:solar-power"),
        {
          type: "markdown",
          content: "Daily bars are calculated from Recorder long-term statistics for the selected 2103 cloud lifetime counter. Recorder statistics begin with this deployment, so the first complete daily bar appears after the next midnight; an empty or partial first day is expected. The local today and seven-day counters are intentionally excluded because they can report zero during active production. This view is independent of Home Assistant’s global Energy configuration.",
          grid_options: { columns: "full" },
        },
        changeGraph("Daily solar energy · last 30 days", 30, [
          { entity: e.solarProductionEnergy, name: "Solar generated" },
        ]),
        historyCard("Solar power · last 48 hours", 48, [
          { entity: e.currentProductionPower, name: "Solar production" },
        ]),
        entitiesCard("Solar totals", [entityRow(e.solarProductionEnergy, "Lifetime solar production", "mdi:counter")]),
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
    max_columns: 2,
    dense_section_placement: true,
    sections,
  };
}

function microinvertersView(discovery) {
  const e = discovery.entities;
  const summaryRows = compact([
    e.microinverterStatus && entityRow(e.microinverterStatus, "Connectivity", "mdi:access-point-check"),
    e.microinverterReportingCount && entityRow(e.microinverterReportingCount, "Reporting", "mdi:solar-panel"),
    e.microinverterLastReported && entityRow(e.microinverterLastReported, "Last reported", "mdi:clock-check-outline"),
  ]);
  const sections = [{
    type: "grid",
    cards: compact([
      heading("Microinverter fleet", "mdi:solar-panel-large"),
      { type: "markdown", content: microinverterDigest(e), grid_options: { columns: "full" } },
      {
        type: "markdown",
        content: "[Open Enlighten array view](https://enlighten.enphaseenergy.com/systems/5815605/arrays)",
        grid_options: { columns: "full" },
      },
      summaryRows.length && entitiesCard("Fleet status", summaryRows),
    ]),
  }];

  const powerRows = discovery.microinverters
    .filter((microinverter) => microinverter.power)
    .map((microinverter) => entityRow(
      microinverter.power,
      `${microinverter.label} · ${microinverter.serial}`,
      microinverter.problem ? "mdi:alert-circle" : "mdi:flash",
    ));
  for (const [index, rows] of chunks(powerRows, 12).entries()) {
    sections.push({
      type: "grid",
      cards: [
        heading(index === 0 ? "Per-inverter power" : `Per-inverter power · ${index + 1}`, "mdi:flash-outline"),
        entitiesCard(`Live power ${index === 0 ? "" : `· group ${index + 1}`}`.trim(), rows),
      ],
    });
  }

  const energyRows = discovery.microinverters
    .filter((microinverter) => microinverter.lifetimeEnergy)
    .map((microinverter) => entityRow(microinverter.lifetimeEnergy, `${microinverter.label} lifetime energy`, "mdi:counter"));
  for (const [index, rows] of chunks(energyRows, 12).entries()) {
    sections.push({
      type: "grid",
      cards: [
        heading(index === 0 ? "Per-inverter production" : `Per-inverter production · ${index + 1}`, "mdi:counter"),
        entitiesCard(`Lifetime production ${index === 0 ? "" : `· group ${index + 1}`}`.trim(), rows),
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
    title: "Microinverters",
    path: "microinverters",
    icon: "mdi:solar-panel-large",
    type: "sections",
    max_columns: 3,
    dense_section_placement: true,
    sections,
  };
}

function systemView(discovery) {
  const e = discovery.entities;
  const healthRows = compact([
    e.serviceStatus && entityRow(e.serviceStatus, "Cloud service", "mdi:cloud-check"),
    e.cloudReachable && entityRow(e.cloudReachable, "Cloud reachable", "mdi:cloud-check-variant"),
    e.activeSystemEvents && entityRow(e.activeSystemEvents, "Active system events", "mdi:alert-circle-outline"),
    e.cloudErrorCode && entityRow(e.cloudErrorCode, "Cloud error", "mdi:cloud-alert"),
    e.cloudBackoffEnds && entityRow(e.cloudBackoffEnds, "Cloud backoff ends", "mdi:timer-sand"),
    e.lastSuccessfulUpdate && entityRow(e.lastSuccessfulUpdate, "Last successful update", "mdi:update"),
    e.cloudLatency && entityRow(e.cloudLatency, "Cloud latency", "mdi:speedometer"),
    entityRow(e.currentProductionPower, "Production telemetry", "mdi:solar-power"),
    e.cloudProductionPower && entityRow(e.cloudProductionPower, "Portal power snapshot (lagged)", "mdi:cloud-sync"),
  ]);
  const sections = [
    {
      type: "grid",
      cards: [
        heading("Site 2103", "mdi:home-lightning-bolt-outline"),
        {
          type: "markdown",
          content: `## Enphase site 2103
Enlighten system **${discovery.site.systemId}** is the only site admitted by this dashboard. Current production and per-panel power come from the official local **enphase_envoy** integration for the verified gateway. Lifetime energy and inventory health come from read-only **enphase_ev** entities. The paid official API is not used by this project.`,
          grid_options: { columns: "full" },
        },
        entitiesCard("Integration health", healthRows),
      ],
    },
  ];

  const gatewayRows = compact([
    e.gatewayStatus && entityRow(e.gatewayStatus, "Cloud gateway inventory", "mdi:router-wireless"),
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
    e.microinverterStatus && entityRow(e.microinverterStatus, "Microinverter connectivity", "mdi:access-point-check"),
    e.microinverterReportingCount && entityRow(e.microinverterReportingCount, "Microinverters reporting", "mdi:solar-panel"),
    e.microinverterLastReported && entityRow(e.microinverterLastReported, "Last reported", "mdi:clock-check-outline"),
  ]);
  if (microRows.length) {
    sections.push({
      type: "grid",
      cards: [heading("Array health", "mdi:solar-panel-large"), entitiesCard("Microinverter health", microRows)],
    });
  }

  return {
    title: "System",
    path: "system",
    icon: "mdi:heart-pulse",
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
      systemView(discovery),
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
