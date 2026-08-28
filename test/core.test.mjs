import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboard, dashboardMetadata } from "../src/dashboard.mjs";
import { defaultTargetSite, discoveryContract, discoverEnphase } from "../src/discovery.mjs";
import {
  applyDashboard,
  collectDashboardTemplates,
  collectEntityReferences,
  createBackup,
  loadBackup,
  planDashboard,
  restoreBackup,
  stableString,
  validateDashboard,
  validateDashboardTemplates,
  validationPolicy,
} from "../src/deployer.mjs";

const BASELINE_KEYS = new Set([
  "cloudProductionPower",
  "solarProductionEnergy",
  "cloudReachable",
  "activeSystemEvents",
  "serviceStatus",
  "cloudErrorCode",
  "cloudBackoffEnds",
  "gatewayStatus",
  "microinverterStatus",
  "microinverterReportingCount",
]);

function fixture({ includeAllOptional = false, unavailableKeys = [], microinverterCount = 2 } = {}) {
  const targetEntryId = "entry-target-cloud";
  const localEntryId = "entry-target-local";
  const otherEntryId = "entry-other";
  const configEntries = [
    { entry_id: localEntryId, domain: "enphase_envoy", title: "Envoy 202433005093", unique_id: null, state: "loaded" },
    { entry_id: otherEntryId, domain: "enphase_ev", title: "Site: 9999999", unique_id: "9999999", state: "loaded" },
    { entry_id: targetEntryId, domain: "enphase_ev", title: "Site: 5815605", unique_id: null, state: "loaded" },
  ];
  const devices = [
    { id: "target-cloud", config_entries: null, identifiers: [["enphase_ev", "type:5815605:cloud"]], disabled_by: null },
    { id: "target-micro", config_entries: null, identifiers: [["enphase_ev", "type:5815605:microinverter"]], disabled_by: null },
    { id: "target-envoy", config_entries: null, identifiers: [["enphase_envoy", "202433005093"]], disabled_by: null },
    { id: "other-cloud", config_entries: [otherEntryId], identifiers: [["enphase_ev", "type:9999999:cloud"]], disabled_by: null },
  ];
  const entities = [];
  const states = [];
  let sequence = 0;
  const unavailable = new Set(unavailableKeys);
  const inventoryDevices = Array.from({ length: microinverterCount }, (_, index) => ({
    serial_number: `48223704${String(5136 + index).padStart(4, "0")}`,
    array_name: index === 0 ? "Pool shade" : "South west",
    status: index === 0 ? "micro" : "normal",
    statusText: index === 0 ? "Microinverter Not Reporting" : "Normal",
  }));
  for (const [logicalKey, specification] of Object.entries(discoveryContract.cloudEntities)) {
    if (!includeAllOptional && !BASELINE_KEYS.has(logicalKey)) continue;
    sequence += 1;
    const entityId = `${specification.domain}.renamed_2103_${String(sequence).padStart(2, "0")}`;
    entities.push({
      entity_id: entityId,
      unique_id: `enphase_ev_site_5815605_${specification.key}`,
      config_entry_id: targetEntryId,
      device_id: logicalKey.includes("microinverter") ? "target-micro" : "target-cloud",
      platform: "enphase_ev",
      disabled_by: null,
    });
    const attributes = { unit_of_measurement: specification.key.includes("power") ? "W" : undefined };
    if (logicalKey === "gatewayStatus") attributes.primary_gateway_serial = "202433005093";
    if (logicalKey === "microinverterReportingCount") {
      attributes.device_count = microinverterCount;
      attributes.devices = inventoryDevices;
    }
    if (logicalKey === "microinverterStatus") {
      attributes.status_counts = { total: microinverterCount, normal: Math.max(0, microinverterCount - 1), warning: 0, error: microinverterCount ? 1 : 0 };
    }
    states.push({
      entity_id: entityId,
      state: unavailable.has(logicalKey)
        ? "unavailable"
        : (logicalKey === "cloudReachable" ? "on" : logicalKey === "activeSystemEvents" ? "off" : logicalKey === "microinverterStatus" ? "Online" : logicalKey === "microinverterReportingCount" ? String(microinverterCount) : "1"),
      attributes,
    });
  }
  for (const [logicalKey, specification] of Object.entries(discoveryContract.localEntities)) {
    const entityId = `sensor.renamed_local_${specification.uniqueIdSuffix}`;
    entities.push({
      entity_id: entityId,
      unique_id: `202433005093_${specification.uniqueIdSuffix}`,
      config_entry_id: localEntryId,
      device_id: "target-envoy",
      platform: "enphase_envoy",
      disabled_by: null,
    });
    states.push({ entity_id: entityId, state: logicalKey === "currentProductionPower" ? "3.527" : "10791.48", attributes: { unit_of_measurement: "kW" } });
  }
  for (let index = 1; index <= microinverterCount; index += 1) {
    const entityId = `sensor.renamed_local_inverter_${index}`;
    const lifetimeEntityId = `sensor.renamed_cloud_inverter_${index}_lifetime`;
    entities.push({
      entity_id: entityId,
      unique_id: inventoryDevices[index - 1].serial_number,
      config_entry_id: localEntryId,
      device_id: "target-envoy",
      platform: "enphase_envoy",
      disabled_by: null,
    });
    states.push({ entity_id: entityId, state: index === 1 ? "0" : "0.271", attributes: { unit_of_measurement: "kW" } });
    entities.push({
      entity_id: lifetimeEntityId,
      unique_id: `enphase_ev_inverter_${inventoryDevices[index - 1].serial_number}_lifetime_energy`,
      config_entry_id: targetEntryId,
      device_id: "target-micro",
      platform: "enphase_ev",
      disabled_by: null,
    });
    states.push({ entity_id: lifetimeEntityId, state: String(100 + index), attributes: { unit_of_measurement: "kWh" } });
  }
  entities.push({
    entity_id: "sensor.other_site_production",
    unique_id: "enphase_ev_site_9999999_current_production_power",
    config_entry_id: otherEntryId,
    platform: "enphase_ev",
    disabled_by: null,
  });
  states.push({ entity_id: "sensor.other_site_production", state: "9000", attributes: { unit_of_measurement: "W" } });
  return { configEntries, devices, entities, states, targetEntryId, localEntryId };
}

function discover(data = fixture()) {
  return discoverEnphase({ ...data, target: defaultTargetSite });
}

function dashboardTypes(value, result = []) {
  if (Array.isArray(value)) {
    for (const child of value) dashboardTypes(child, result);
  } else if (value && typeof value === "object") {
    if (typeof value.type === "string") result.push(value.type);
    for (const child of Object.values(value)) dashboardTypes(child, result);
  }
  return result;
}

function valuesOfType(value, type, result = []) {
  if (Array.isArray(value)) {
    for (const child of value) valuesOfType(child, type, result);
  } else if (value && typeof value === "object") {
    if (value.type === type) result.push(value);
    for (const child of Object.values(value)) valuesOfType(child, type, result);
  }
  return result;
}

test("selects cloud site 5815605 and its loaded local Envoy across two cloud sites", () => {
  const data = fixture();
  const result = discover(data);
  assert.equal(result.site.systemId, "5815605");
  assert.equal(result.site.name, "2103");
  assert.equal(result.site.cloudConfigEntryId, data.targetEntryId);
  assert.equal(result.site.localConfigEntryId, data.localEntryId);
  assert.equal(result.site.gatewaySerial, "202433005093");
  assert.ok(result.site.identityEvidence.includes("config-entry title") || result.site.identityEvidence.includes("entity unique_id"));
  assert.match(result.entities.currentProductionPower, /^sensor\.renamed_local_production/);
  assert.notEqual(result.entities.currentProductionPower, "sensor.enphase_cloud_current_production_power");
  assert.match(result.microinverters[0].lifetimeEnergy, /^sensor\.renamed_cloud_inverter_/);
});

test("fails closed for duplicate target entries, a wrong target, unloaded entry, and missing required state", () => {
  const ambiguous = fixture();
  ambiguous.configEntries.push({ entry_id: "duplicate", domain: "enphase_ev", title: "Site: 5815605", unique_id: "5815605", state: "loaded" });
  assert.throws(() => discover(ambiguous), /exactly one enabled enphase_ev config entry/);

  const wrong = fixture();
  assert.throws(() => discoverEnphase({
    ...wrong,
    target: { ...defaultTargetSite, systemId: "1234567", siteName: "Wrong" },
  }), /found 0/);

  const unloaded = fixture();
  unloaded.configEntries.find((entry) => entry.entry_id === unloaded.targetEntryId).state = "setup_retry";
  assert.throws(() => discover(unloaded), /not loaded/);

  const localUnloaded = fixture();
  localUnloaded.configEntries.find((entry) => entry.entry_id === localUnloaded.localEntryId).state = "setup_retry";
  assert.throws(() => discover(localUnloaded), /Local Enphase gateway .* is not loaded/);

  const localAmbiguous = fixture();
  localAmbiguous.configEntries.push({ entry_id: "second-local", domain: "enphase_envoy", title: "Envoy 202433005093", unique_id: null, state: "loaded" });
  assert.throws(() => discover(localAmbiguous), /exactly one enabled enphase_envoy config entry/);

  const registryOnlyLocal = fixture();
  registryOnlyLocal.configEntries.find((entry) => entry.entry_id === registryOnlyLocal.localEntryId).title = "Envoy";
  assert.equal(discover(registryOnlyLocal).site.localConfigEntryId, registryOnlyLocal.localEntryId);

  const missing = fixture();
  const requiredId = discover(missing).entities.currentProductionPower;
  missing.states = missing.states.filter((state) => state.entity_id !== requiredId);
  assert.throws(() => discover(missing), /Required local currentProductionPower entity is absent/);
});

test("optional capabilities appear only when registered and suppress unavailable values", () => {
  const minimal = discover(fixture());
  assert.equal(minimal.capabilities.consumption, false);
  assert.equal(minimal.capabilities.grid, false);
  assert.equal(minimal.capabilities.battery, false);
  assert.equal(minimal.capabilities.weather, false);
  assert.equal(minimal.capabilities.microinverters, true);
  assert.equal(minimal.entities.consumptionEnergy, null);

  const all = discover(fixture({ includeAllOptional: true, microinverterCount: 2 }));
  assert.equal(all.capabilities.consumption, true);
  assert.equal(all.capabilities.grid, true);
  assert.equal(all.capabilities.battery, true);
  assert.equal(all.capabilities.weather, true);
  assert.equal(all.microinverters.length, 2);
  assert.equal(all.microinverters[0].arrayName, "Pool shade");
  assert.equal(all.microinverters[0].problem, true);
  assert.equal(all.microinverters[0].serial, "482237045136");

  const unavailable = discover(fixture({
    includeAllOptional: true,
    unavailableKeys: [
      "currentConsumptionPower", "consumptionEnergy", "currentGridPower", "gridImportEnergy", "gridExportEnergy",
      "currentBatteryPower", "batteryChargeEnergy", "batteryDischargeEnergy", "batteryChargeLevel", "batteryStatus",
      "batteryAvailableEnergy", "batteryAvailablePower", "batteryLastReported", "weather",
    ],
  }));
  assert.equal(unavailable.capabilities.consumption, false);
  assert.equal(unavailable.capabilities.grid, false);
  assert.equal(unavailable.capabilities.battery, false);
  assert.equal(unavailable.capabilities.weather, false);
});

test("dashboard has four native Sections views, no global Energy cards, and only live references", () => {
  const data = fixture({ includeAllOptional: true, microinverterCount: 3 });
  const dashboard = buildDashboard(discover(data));
  const result = validateDashboard(dashboard, data.states);
  const types = dashboardTypes(dashboard);
  assert.deepEqual(dashboard.views.map((view) => view.path), ["overview", "energy", "microinverters", "system"]);
  assert.ok(dashboard.views.every((view) => view.type === "sections"));
  assert.ok(types.every((type) => validationPolicy.allowedTypes.includes(type)));
  assert.ok(!types.some((type) => type.startsWith("energy-")));
  assert.ok(!stableString(dashboard).includes("custom:"));
  assert.ok(!stableString(dashboard).includes('"action":"navigate"'));
  assert.ok(!stableString(dashboard).includes('"action":"toggle"'));
  assert.equal(result.viewCount, 4);
  assert.equal(collectEntityReferences(dashboard).size, result.references.length);
  assert.ok(result.references.every((entityId) => data.states.some((state) => state.entity_id === entityId)));
  assert.ok(stableString(dashboard).includes("482237045136"));
  assert.ok(stableString(dashboard).includes("https://enlighten.enphaseenergy.com/systems/5815605/arrays"));
  assert.ok(!stableString(dashboard).includes("daily_production"));
  assert.ok(!stableString(dashboard).includes("seven_days_production"));

  const completeArrayDashboard = buildDashboard(discover(fixture({ microinverterCount: 14 })));
  const remainderCard = valuesOfType(completeArrayDashboard, "entities")
    .find((card) => card.title === "Live power · group 2");
  assert.equal(remainderCard.entities.length, 2);
  assert.equal(remainderCard.grid_options.rows, 4);
});

test("minimal dashboard omits optional flow cards and keeps dynamic digest honest", () => {
  const data = fixture();
  const dashboard = buildDashboard(discover(data));
  const serialized = stableString(dashboard);
  assert.ok(!serialized.includes("Daily consumption"));
  assert.ok(!serialized.includes("Daily grid energy"));
  assert.ok(!serialized.includes("Daily battery energy"));
  const templates = collectDashboardTemplates(dashboard);
  assert.equal(templates.length, 2);
  assert.ok(templates[0].includes("Solar telemetry is unavailable"));
  assert.ok(templates[0].includes("solar_raw | lower in unavailable"));
  assert.ok(templates[0].includes("status_counts"));
  assert.ok(templates[0].includes("even if fleet connectivity says Online"));
  const discovered = discover(data);
  assert.ok(templates[0].includes(`state_attr('${discovered.entities.microinverterStatus}', 'status_counts')`));
  assert.ok(templates[0].includes(`state_attr('${discovered.entities.microinverterReportingCount}', 'devices')`));
});

test("validation rejects missing entities, unsafe card types, controls, and navigation", () => {
  const data = fixture();
  const dashboard = buildDashboard(discover(data));
  assert.throws(() => validateDashboard(dashboard, data.states.slice(1)), /missing live entities/);

  const custom = structuredClone(dashboard);
  custom.views[0].sections[0].cards.push({ type: "custom:power-flow-card" });
  assert.throws(() => validateDashboard(custom, data.states), /unsupported card/);

  const control = structuredClone(dashboard);
  control.views[0].sections[0].cards.push({ type: "tile", entity: "switch.unsafe", tap_action: { action: "toggle" } });
  assert.throws(
    () => validateDashboard(control, [...data.states, { entity_id: "switch.unsafe", state: "off", attributes: {} }]),
    /disallowed entity domain/,
  );

  const navigation = structuredClone(dashboard);
  navigation.views[0].sections[0].cards.push({ type: "markdown", content: "leave", tap_action: { action: "navigate" }, navigation_path: "/config" });
  assert.throws(() => validateDashboard(navigation, data.states), /forbidden key|forbidden action/);
});

test("all Jinja is preflight-rendered through Home Assistant", async () => {
  const dashboard = buildDashboard(discover(fixture()));
  const calls = [];
  const client = {
    async request(path, options) {
      calls.push({ path, options });
      return "rendered";
    },
  };
  const templates = collectDashboardTemplates(dashboard);
  assert.deepEqual(await validateDashboardTemplates(client, dashboard), { templateCount: templates.length });
  assert.equal(calls.length, templates.length);
  assert.ok(calls.every((call) => call.path === "/api/template" && call.options.method === "POST" && call.options.responseType === "text"));
});

class FakeWs {
  constructor({ failOn } = {}) {
    this.calls = [];
    this.failOn = failOn;
    this.failed = false;
  }

  async call(command) {
    this.calls.push(structuredClone(command));
    if (this.failOn && command.type === this.failOn && !this.failed) {
      this.failed = true;
      throw new Error("injected failure");
    }
    if (command.type === "lovelace/dashboards/create") return { id: "enphase_2103" };
    return null;
  }
}

test("deployment planning creates, updates, skips unchanged, rejects YAML, and rolls back failure", async () => {
  const candidate = { views: [{ title: "Overview", path: "overview" }] };
  assert.equal(planDashboard({ existing: null, existingConfig: null, candidate, metadata: dashboardMetadata }).action, "create");

  const createWs = new FakeWs();
  const created = await applyDashboard({ ws: createWs, existing: null, existingConfig: null, candidate, metadata: dashboardMetadata });
  assert.equal(created.dashboardId, "enphase_2103");
  assert.deepEqual(createWs.calls.map((call) => call.type), ["lovelace/dashboards/create", "lovelace/config/save"]);

  const existing = {
    id: "enphase_2103",
    url_path: dashboardMetadata.urlPath,
    mode: "storage",
    title: dashboardMetadata.title,
    icon: dashboardMetadata.icon,
    show_in_sidebar: true,
    require_admin: false,
  };
  assert.equal(planDashboard({ existing, existingConfig: candidate, candidate, metadata: dashboardMetadata }).action, "unchanged");
  assert.equal(planDashboard({ existing, existingConfig: { views: [] }, candidate, metadata: dashboardMetadata }).action, "update");
  assert.throws(
    () => planDashboard({ existing: { ...existing, mode: "yaml" }, existingConfig: null, candidate, metadata: dashboardMetadata }),
    /refusing to replace/,
  );

  const failing = new FakeWs({ failOn: "lovelace/config/save" });
  await assert.rejects(
    applyDashboard({ ws: failing, existing: null, existingConfig: null, candidate, metadata: dashboardMetadata }),
    /automatic rollback completed/,
  );
  assert.deepEqual(failing.calls.map((call) => call.type), ["lovelace/dashboards/create", "lovelace/config/save", "lovelace/dashboards/delete"]);
});

test("backup is private and checksummed; restore guards drift and restores prior config", async () => {
  const priorConfig = { views: [{ title: "Prior", path: "prior" }] };
  const candidate = { views: [{ title: "Overview", path: "overview" }] };
  const priorMetadata = {
    id: "enphase_2103",
    url_path: dashboardMetadata.urlPath,
    mode: "storage",
    title: "Prior dashboard",
    icon: "mdi:old",
    show_in_sidebar: false,
    require_admin: true,
  };
  const created = createBackup({
    baseUrl: "https://ha.invalid",
    haVersion: "2026.8.3",
    metadata: dashboardMetadata,
    existing: priorMetadata,
    existingConfig: priorConfig,
    candidate,
  });
  try {
    assert.equal(statSync(created.path).mode & 0o777, 0o600);
    assert.ok(!readFileSync(created.path, "utf8").includes("super-secret-token"));
    const backup = loadBackup(created.path);

    const driftedWs = {
      async call(command) {
        if (command.type === "lovelace/dashboards/list") return [{ id: "enphase_2103", url_path: backup.dashboard_path, mode: "storage", ...backup.deployed.metadata }];
        if (command.type === "lovelace/config") return { views: [{ title: "Operator edit", path: "edited" }] };
        throw new Error(`unexpected command ${command.type}`);
      },
    };
    await assert.rejects(restoreBackup({ ws: driftedWs, backup }), /has drifted/);

    const restoreCalls = [];
    const restoreWs = {
      async call(command) {
        restoreCalls.push(structuredClone(command));
        if (command.type === "lovelace/dashboards/list") return [{ id: "enphase_2103", url_path: backup.dashboard_path, mode: "storage", ...backup.deployed.metadata }];
        if (command.type === "lovelace/config") return candidate;
        return null;
      },
    };
    assert.deepEqual(await restoreBackup({ ws: restoreWs, backup }), { action: "restored-prior-dashboard" });
    assert.deepEqual(restoreCalls.map((call) => call.type), [
      "lovelace/dashboards/list", "lovelace/config", "lovelace/config/save", "lovelace/dashboards/update",
    ]);
    assert.deepEqual(restoreCalls[2].config, priorConfig);

    const tamperedPath = `${created.path}.tampered`;
    const tampered = JSON.parse(readFileSync(created.path, "utf8"));
    tampered.dashboard_path = "something-else";
    writeFileSync(tamperedPath, JSON.stringify(tampered), { mode: 0o600 });
    assert.throws(() => loadBackup(tamperedPath), /document checksum/);
    rmSync(tamperedPath, { force: true });
  } finally {
    rmSync(dirname(created.path), { recursive: true, force: true });
  }
});
