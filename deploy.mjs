#!/usr/bin/env node

import { buildDashboard, dashboardMetadata } from "./src/dashboard.mjs";
import { defaultTargetSite, discoverEnphase } from "./src/discovery.mjs";
import { HomeAssistantClient } from "./src/ha-client.mjs";
import {
  applyDashboard,
  createBackup,
  loadBackup,
  planDashboard,
  restoreBackup,
  validateDashboard,
  validateDashboardTemplates,
  verifyDashboard,
} from "./src/deployer.mjs";

function parseArguments(argv) {
  const args = { check: false, restore: null, forceRestore: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--check") args.check = true;
    else if (value === "--restore") args.restore = argv[++index];
    else if (value === "--force-restore") args.forceRestore = true;
    else if (value === "--help" || value === "-h") {
      console.log("Usage: node deploy.mjs [--check] [--restore BACKUP.json [--force-restore]]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (args.check && args.restore) throw new Error("--check and --restore are mutually exclusive");
  if (args.forceRestore && !args.restore) throw new Error("--force-restore requires --restore BACKUP.json");
  if (args.restore === undefined) throw new Error("--restore requires a backup path");
  return args;
}

function targetFromEnvironment() {
  const configured = {
    systemId: process.env.ENPHASE_SITE_ID ?? defaultTargetSite.systemId,
    siteName: process.env.ENPHASE_SITE_NAME ?? defaultTargetSite.siteName,
    gatewaySerial: process.env.ENPHASE_GATEWAY_SERIAL ?? defaultTargetSite.gatewaySerial,
  };
  for (const key of Object.keys(defaultTargetSite)) {
    if (String(configured[key]) !== String(defaultTargetSite[key])) {
      throw new Error(`This project is pinned to Enphase 2103; ${key} must remain ${defaultTargetSite[key]}`);
    }
  }
  return configured;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const client = new HomeAssistantClient({
    baseUrl: process.env.HA_BASE_URL,
    token: process.env.ENPHASE_HA_TOKEN ?? process.env.HA_TOKEN,
    timeoutMs: Number(process.env.HA_TIMEOUT_MS ?? 15_000),
  });
  await client.connect();
  try {
    const user = await client.call({ type: "auth/current_user" });
    if (!user?.is_admin) throw new Error("The Home Assistant token must belong to an administrator");

    if (args.restore) {
      const backup = loadBackup(args.restore);
      if (backup.dashboard_path !== dashboardMetadata.urlPath) {
        throw new Error(`Backup targets ${backup.dashboard_path}, not ${dashboardMetadata.urlPath}`);
      }
      const result = await restoreBackup({ ws: client, backup, force: args.forceRestore });
      console.log(`restore-ok action=${result.action} dashboard=${backup.dashboard_path}`);
      return;
    }

    const [config, states, configEntries, devices, entities, dashboards] = await Promise.all([
      client.request("/api/config"),
      client.request("/api/states"),
      client.call({ type: "config_entries/get" }),
      client.call({ type: "config/device_registry/list" }),
      client.call({ type: "config/entity_registry/list" }),
      client.call({ type: "lovelace/dashboards/list" }),
    ]);
    const discovery = discoverEnphase({
      configEntries,
      devices,
      entities,
      states,
      target: targetFromEnvironment(),
    });
    const candidate = buildDashboard(discovery);
    const validation = validateDashboard(candidate, states);
    const templates = await validateDashboardTemplates(client, candidate);
    const existing = dashboards.find((dashboard) => dashboard.url_path === dashboardMetadata.urlPath) ?? null;
    const existingConfig = existing?.mode === "storage"
      ? await client.call({ type: "lovelace/config", url_path: dashboardMetadata.urlPath, force: true })
      : null;
    const plan = planDashboard({ existing, existingConfig, candidate, metadata: dashboardMetadata });

    const enabledCapabilities = Object.entries(discovery.capabilities)
      .filter(([, available]) => available)
      .map(([name]) => name)
      .join("+") || "solar-only";
    const summary = [
      `ha=${config.version ?? client.version ?? "unknown"}`,
      `site=${discovery.site.name}`,
      `system=${discovery.site.systemId}`,
      `entities=${validation.references.length}`,
      `cards=${validation.cardCount}`,
      `views=${validation.viewCount}`,
      `templates=${templates.templateCount}`,
      `capabilities=${enabledCapabilities}`,
      `dashboard=${dashboardMetadata.urlPath}`,
      `action=${plan.action}`,
    ].join(" ");
    if (args.check) {
      console.log(`preflight-ok ${summary}`);
      return;
    }
    if (plan.action === "unchanged") {
      await verifyDashboard({ ws: client, metadata: dashboardMetadata, candidate });
      console.log(`deployment-ok unchanged ${summary}`);
      return;
    }

    const { path: backupPath } = createBackup({
      baseUrl: client.baseUrl,
      haVersion: config.version ?? client.version,
      metadata: dashboardMetadata,
      existing,
      existingConfig,
      candidate,
    });
    console.log(`backup=${backupPath}`);
    const result = await applyDashboard({
      ws: client,
      existing,
      existingConfig,
      candidate,
      metadata: dashboardMetadata,
      verify: () => verifyDashboard({ ws: client, metadata: dashboardMetadata, candidate }),
    });
    console.log(`deployment-ok action=${result.action} dashboard=${dashboardMetadata.urlPath} views=${validation.viewCount} entities=${validation.references.length}`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
