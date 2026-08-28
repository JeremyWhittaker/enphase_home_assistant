const ENTITY_ID_PATTERN = /^[a-z_]+\.[a-z0-9_]+$/;
const CLOUD_DOMAIN = "enphase_ev";
const LOCAL_DOMAIN = "enphase_envoy";
const UNAVAILABLE = new Set(["unavailable"]);

export const defaultTargetSite = Object.freeze({
  systemId: "5815605",
  siteName: "2103",
  gatewaySerial: "202433005093",
});

const CLOUD_ENTITY_SPECS = Object.freeze({
  cloudProductionPower: { key: "current_production_power", domain: "sensor" },
  solarProductionEnergy: { key: "solar_production", domain: "sensor", required: true },
  currentConsumptionPower: { key: "site_consumption_power", domain: "sensor" },
  consumptionEnergy: { key: "consumption", domain: "sensor" },
  currentGridPower: { key: "grid_power", domain: "sensor" },
  gridImportEnergy: { key: "grid_import", domain: "sensor" },
  gridExportEnergy: { key: "grid_export", domain: "sensor" },
  currentBatteryPower: { key: "battery_power", domain: "sensor" },
  batteryChargeEnergy: { key: "battery_charge", domain: "sensor" },
  batteryDischargeEnergy: { key: "battery_discharge", domain: "sensor" },
  batteryChargeLevel: { key: "battery_overall_charge", domain: "sensor" },
  batteryStatus: { key: "battery_overall_status", domain: "sensor" },
  batteryAvailableEnergy: { key: "battery_available_energy", domain: "sensor" },
  batteryAvailablePower: { key: "battery_available_power", domain: "sensor" },
  batteryLastReported: { key: "battery_last_reported", domain: "sensor" },
  cloudReachable: { key: "cloud_reachable", domain: "binary_sensor" },
  activeSystemEvents: { key: "active_system_events", domain: "binary_sensor" },
  serviceStatus: { key: "service_status", domain: "sensor" },
  cloudErrorCode: { key: "last_error_code", domain: "sensor" },
  cloudBackoffEnds: { key: "backoff_ends", domain: "sensor" },
  lastSuccessfulUpdate: { key: "last_update", domain: "sensor" },
  cloudLatency: { key: "latency_ms", domain: "sensor" },
  gatewayStatus: { key: "gateway_connectivity_status", domain: "sensor" },
  gatewayLastReported: { key: "gateway_last_reported", domain: "sensor" },
  gatewayProductionMeter: { key: "gateway_production_meter", domain: "sensor" },
  gatewayConsumptionMeter: { key: "gateway_consumption_meter", domain: "sensor" },
  microinverterStatus: { key: "microinverter_connectivity_status", domain: "sensor" },
  microinverterReportingCount: { key: "microinverter_reporting_count", domain: "sensor" },
  microinverterLastReported: { key: "microinverter_last_reported", domain: "sensor" },
  weather: { key: "weather", domain: "weather" },
});

const LOCAL_ENTITY_SPECS = Object.freeze({
  currentProductionPower: { uniqueIdSuffix: "production", required: true },
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function enabled(value) {
  return value?.disabled_by == null;
}

function entryId(entry) {
  return entry?.entry_id ?? entry?.id ?? null;
}

function exactTokenMatch(value, target) {
  if (value == null) return false;
  const text = normalize(value);
  const expected = normalize(target);
  if (text === expected) return true;
  return text.split(/[^a-z0-9]+/).filter(Boolean).includes(expected);
}

function identifierPairs(device) {
  return Array.isArray(device?.identifiers)
    ? device.identifiers.filter((identifier) => Array.isArray(identifier) && identifier.length >= 2)
    : [];
}

function deviceBelongsToEntry(device, candidateEntryId) {
  const ids = Array.isArray(device?.config_entries) ? device.config_entries : [];
  return ids.includes(candidateEntryId);
}

function cloudEntryEvidence(entry, devices, entities, systemId) {
  const candidateEntryId = entryId(entry);
  if (!candidateEntryId) return [];
  const evidence = [];
  if (exactTokenMatch(entry.unique_id, systemId)) evidence.push("config-entry unique_id");
  if (exactTokenMatch(entry.title, systemId)) evidence.push("config-entry title");
  if (exactTokenMatch(entry.data?.site_id, systemId)) evidence.push("config-entry site_id");
  if (devices.some((device) =>
    deviceBelongsToEntry(device, candidateEntryId)
    && identifierPairs(device).some(([domain, identifier]) =>
      domain === CLOUD_DOMAIN && exactTokenMatch(identifier, systemId)))) {
    evidence.push("device identifier");
  }
  if (entities.some((entity) =>
    entity.config_entry_id === candidateEntryId
    && entity.platform === CLOUD_DOMAIN
    && normalize(entity.unique_id).startsWith(`${CLOUD_DOMAIN}_site_${normalize(systemId)}_`))) {
    evidence.push("entity unique_id");
  }
  return evidence;
}

function selectCloudEntry({ configEntries, devices, entities, systemId }) {
  const matches = configEntries
    .filter((entry) => entry?.domain === CLOUD_DOMAIN && enabled(entry))
    .map((entry) => ({ entry, evidence: cloudEntryEvidence(entry, devices, entities, systemId) }))
    .filter(({ evidence }) => evidence.length > 0);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one enabled ${CLOUD_DOMAIN} config entry for Enphase site ${systemId}; found ${matches.length}`);
  }
  if (matches[0].entry.state && matches[0].entry.state !== "loaded") {
    throw new Error(`Enphase site ${systemId} cloud config entry is not loaded (state: ${matches[0].entry.state})`);
  }
  return matches[0];
}

function selectLocalEntry(configEntries, entities, gatewaySerial) {
  const matches = configEntries.filter((entry) => {
    if (entry?.domain !== LOCAL_DOMAIN || !enabled(entry)) return false;
    const candidateEntryId = entryId(entry);
    const entityEvidence = entities.some((entity) =>
      entity.config_entry_id === candidateEntryId
      && entity.platform === LOCAL_DOMAIN
      && normalize(entity.unique_id) === `${normalize(gatewaySerial)}_production`);
    return exactTokenMatch(entry.unique_id, gatewaySerial)
      || exactTokenMatch(entry.title, gatewaySerial)
      || entityEvidence;
  });
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one enabled ${LOCAL_DOMAIN} config entry for gateway ${gatewaySerial}; found ${matches.length}`);
  }
  if (matches[0].state && matches[0].state !== "loaded") {
    throw new Error(`Local Enphase gateway ${gatewaySerial} is not loaded (state: ${matches[0].state})`);
  }
  return matches[0];
}

function validEntityId(entityId, logicalKey) {
  if (!ENTITY_ID_PATTERN.test(entityId)) throw new Error(`Discovered invalid entity id for ${logicalKey}`);
  return entityId;
}

function resolveCloudEntity({ registry, liveStateMap, configEntryId, systemId, logicalKey, specification }) {
  const expected = `${CLOUD_DOMAIN}_site_${systemId}_${specification.key}`;
  const matches = registry.filter((entity) =>
    entity.config_entry_id === configEntryId
    && entity.platform === CLOUD_DOMAIN
    && enabled(entity)
    && entity.entity_id?.startsWith(`${specification.domain}.`)
    && normalize(entity.unique_id) === normalize(expected));
  if (matches.length > 1) throw new Error(`Ambiguous ${logicalKey} entity for Enphase site ${systemId}; found ${matches.length}`);
  if (matches.length === 0) {
    if (specification.required) throw new Error(`Missing required ${logicalKey} entity for Enphase site ${systemId} (unique_id ${expected})`);
    return null;
  }
  const entityId = validEntityId(matches[0].entity_id, logicalKey);
  const state = liveStateMap.get(entityId);
  if (!state) {
    if (specification.required) throw new Error(`Required ${logicalKey} entity is absent from live state`);
    return null;
  }
  if (!specification.required && UNAVAILABLE.has(normalize(state.state))) return null;
  return entityId;
}

function resolveLocalEntity({ registry, liveStateMap, configEntryId, gatewaySerial, logicalKey, specification }) {
  const expected = `${gatewaySerial}_${specification.uniqueIdSuffix}`;
  const matches = registry.filter((entity) =>
    entity.config_entry_id === configEntryId
    && entity.platform === LOCAL_DOMAIN
    && enabled(entity)
    && entity.entity_id?.startsWith("sensor.")
    && normalize(entity.unique_id) === normalize(expected));
  if (matches.length > 1) throw new Error(`Ambiguous local ${logicalKey} entity for gateway ${gatewaySerial}; found ${matches.length}`);
  if (matches.length === 0) {
    if (specification.required) throw new Error(`Missing required local ${logicalKey} entity (unique_id ${expected})`);
    return null;
  }
  const entityId = validEntityId(matches[0].entity_id, logicalKey);
  const state = liveStateMap.get(entityId);
  if (!state) {
    if (specification.required) throw new Error(`Required local ${logicalKey} entity is absent from live state`);
    return null;
  }
  if (!specification.required && UNAVAILABLE.has(normalize(state.state))) return null;
  return entityId;
}

function inventoryBySerial(liveStateMap, reportingEntityId) {
  const devices = liveStateMap.get(reportingEntityId)?.attributes?.devices;
  if (!Array.isArray(devices)) return new Map();
  return new Map(devices
    .filter((device) => device && /^\d+$/.test(String(device.serial_number ?? "")))
    .map((device) => [String(device.serial_number), device]));
}

function cloudLifetimeBySerial(registry, liveStateMap, configEntryId) {
  const result = new Map();
  const pattern = /^enphase_ev_inverter_(\d{12})_lifetime_energy$/i;
  for (const entity of registry) {
    const match = String(entity.unique_id ?? "").match(pattern);
    if (!match
      || entity.config_entry_id !== configEntryId
      || entity.platform !== CLOUD_DOMAIN
      || !enabled(entity)
      || !entity.entity_id?.startsWith("sensor.")) continue;
    const state = liveStateMap.get(entity.entity_id);
    if (!state || UNAVAILABLE.has(normalize(state.state))) continue;
    if (result.has(match[1])) throw new Error(`Ambiguous cloud lifetime energy for microinverter ${match[1]}`);
    result.set(match[1], validEntityId(entity.entity_id, "microinverter lifetime energy"));
  }
  return result;
}

function problemStatus(inventory) {
  const status = normalize(inventory?.status);
  const text = normalize(inventory?.statusText);
  if (!inventory) return null;
  return status !== "normal" || text.includes("not reporting") || text.includes("error") || text.includes("warning");
}

function resolveLocalMicroinverters({
  registry,
  cloudRegistry,
  liveStateMap,
  configEntryId,
  cloudConfigEntryId,
  gatewaySerial,
  cloudReportingEntity,
}) {
  const inventory = inventoryBySerial(liveStateMap, cloudReportingEntity);
  const lifetimeBySerial = cloudLifetimeBySerial(cloudRegistry, liveStateMap, cloudConfigEntryId);
  const records = [];
  for (const entity of registry) {
    const serial = String(entity.unique_id ?? "");
    if (entity.config_entry_id !== configEntryId
      || entity.platform !== LOCAL_DOMAIN
      || !enabled(entity)
      || !entity.entity_id?.startsWith("sensor.")
      || !/^\d{12}$/.test(serial)
      || serial === gatewaySerial) continue;
    const state = liveStateMap.get(entity.entity_id);
    if (!state || UNAVAILABLE.has(normalize(state.state))) continue;
    const cloud = inventory.get(serial) ?? null;
    records.push({
      serial,
      power: validEntityId(entity.entity_id, "microinverter power"),
      arrayName: String(cloud?.array_name ?? "Unassigned array"),
      status: cloud?.status == null ? null : String(cloud.status),
      statusText: cloud?.statusText == null ? null : String(cloud.statusText),
      problem: problemStatus(cloud),
      lifetimeEnergy: lifetimeBySerial.get(serial) ?? null,
    });
  }
  records.sort((left, right) =>
    left.arrayName.localeCompare(right.arrayName) || left.serial.localeCompare(right.serial));
  const arrayIndexes = new Map();
  return records.map((record) => {
    const next = (arrayIndexes.get(record.arrayName) ?? 0) + 1;
    arrayIndexes.set(record.arrayName, next);
    return Object.freeze({
      ...record,
      label: `${record.arrayName} · inverter ${String(next).padStart(2, "0")}`,
    });
  });
}

function verifyGatewayLink(liveStateMap, gatewayStatusEntity, gatewaySerial) {
  if (!gatewayStatusEntity) return { verified: true, evidence: "pinned gateway serial" };
  const attributes = liveStateMap.get(gatewayStatusEntity)?.attributes ?? {};
  const reported = [
    attributes.primary_gateway_serial,
    attributes.default_gateway_serial,
    attributes.preferred_gateway_serial,
  ].filter((value) => value != null).map(String).filter((value) => /^\d{12}$/.test(value));
  if (reported.length && !reported.includes(gatewaySerial)) {
    throw new Error(`Cloud site gateway identity does not match local gateway ${gatewaySerial}`);
  }
  return {
    verified: true,
    evidence: reported.includes(gatewaySerial) ? "cloud gateway attribute" : "pinned gateway serial",
  };
}

function hasAny(entityMap, keys) {
  return keys.some((key) => Boolean(entityMap[key]));
}

export function discoverEnphase({ configEntries, devices, entities, states, target = defaultTargetSite }) {
  if (![configEntries, devices, entities, states].every(Array.isArray)) {
    throw new TypeError("configEntries, devices, entities, and states must be arrays");
  }
  const systemId = String(target?.systemId ?? "").trim();
  const siteName = String(target?.siteName ?? "").trim();
  const gatewaySerial = String(target?.gatewaySerial ?? "").trim();
  if (!/^\d+$/.test(systemId)) throw new Error("Target Enphase system id must be numeric");
  if (!siteName) throw new Error("Target Enphase site name is required");
  if (!/^\d{12}$/.test(gatewaySerial)) throw new Error("Target Enphase gateway serial must be 12 digits");

  const cloud = selectCloudEntry({ configEntries, devices, entities, systemId });
  const localEntry = selectLocalEntry(configEntries, entities, gatewaySerial);
  const cloudEntryId = entryId(cloud.entry);
  const localEntryId = entryId(localEntry);
  const liveStateMap = new Map(states.map((state) => [state.entity_id, state]));
  const cloudRegistry = entities.filter((entity) => entity.config_entry_id === cloudEntryId && entity.platform === CLOUD_DOMAIN);
  const localRegistry = entities.filter((entity) => entity.config_entry_id === localEntryId && entity.platform === LOCAL_DOMAIN);
  const entityMap = Object.fromEntries(Object.entries(CLOUD_ENTITY_SPECS).map(([logicalKey, specification]) => [
    logicalKey,
    resolveCloudEntity({
      registry: cloudRegistry,
      liveStateMap,
      configEntryId: cloudEntryId,
      systemId,
      logicalKey,
      specification,
    }),
  ]));
  for (const [logicalKey, specification] of Object.entries(LOCAL_ENTITY_SPECS)) {
    entityMap[logicalKey] = resolveLocalEntity({
      registry: localRegistry,
      liveStateMap,
      configEntryId: localEntryId,
      gatewaySerial,
      logicalKey,
      specification,
    });
  }
  const gatewayLink = verifyGatewayLink(liveStateMap, entityMap.gatewayStatus, gatewaySerial);
  const microinverters = resolveLocalMicroinverters({
    registry: localRegistry,
    cloudRegistry,
    liveStateMap,
    configEntryId: localEntryId,
    cloudConfigEntryId: cloudEntryId,
    gatewaySerial,
    cloudReportingEntity: entityMap.microinverterReportingCount,
  });

  const capabilities = Object.freeze({
    consumption: hasAny(entityMap, ["currentConsumptionPower", "consumptionEnergy"]),
    grid: hasAny(entityMap, ["currentGridPower", "gridImportEnergy", "gridExportEnergy"]),
    battery: hasAny(entityMap, ["currentBatteryPower", "batteryChargeLevel", "batteryStatus", "batteryChargeEnergy", "batteryDischargeEnergy"]),
    weather: Boolean(entityMap.weather),
    microinverters: hasAny(entityMap, ["microinverterStatus", "microinverterReportingCount", "microinverterLastReported"]) || microinverters.length > 0,
    gateway: hasAny(entityMap, ["gatewayStatus", "gatewayLastReported", "gatewayProductionMeter", "gatewayConsumptionMeter"]),
  });
  const siteDevices = devices.filter((device) => deviceBelongsToEntry(device, cloudEntryId));

  return Object.freeze({
    site: Object.freeze({
      systemId,
      name: siteName,
      gatewaySerial,
      cloudConfigEntryId: cloudEntryId,
      localConfigEntryId: localEntryId,
      cloudEntryTitle: cloud.entry.title ?? null,
      localEntryTitle: localEntry.title ?? null,
      identityEvidence: Object.freeze([...cloud.evidence, gatewayLink.evidence]),
      deviceCount: siteDevices.length,
    }),
    entities: Object.freeze(entityMap),
    microinverters: Object.freeze(microinverters),
    capabilities,
  });
}

export const discoveryContract = Object.freeze({
  cloudDomain: CLOUD_DOMAIN,
  localDomain: LOCAL_DOMAIN,
  cloudEntities: CLOUD_ENTITY_SPECS,
  localEntities: LOCAL_ENTITY_SPECS,
});
