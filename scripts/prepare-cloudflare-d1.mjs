import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const WRANGLER_CONFIG = resolve(ROOT, "wrangler.jsonc");
const RESOLVED_CACHE = resolve(ROOT, ".wrangler", "resolved-d1.json");
const TARGET_BINDING = "DB";

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const readConfig = () => JSON.parse(readFileSync(WRANGLER_CONFIG, "utf8"));

const writeJson = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const normalizeDb = (record) => {
  if (!record || typeof record !== "object") return null;
  const databaseId = record.database_id ?? record.uuid ?? record.id;
  const databaseName = record.database_name ?? record.name;
  if (!databaseName || !databaseId) return null;
  return {
    database_name: databaseName,
    database_id: databaseId,
  };
};

const findDb = (records, databaseName) =>
  records.map(normalizeDb).find((record) => record?.database_name === databaseName);

const parseWranglerJson = (output) => {
  const trimmed = output.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstArray = trimmed.indexOf("[");
    const firstObject = trimmed.indexOf("{");
    const first =
      firstArray === -1
        ? firstObject
        : firstObject === -1
          ? firstArray
          : Math.min(firstArray, firstObject);
    if (first === -1) return null;
    return JSON.parse(trimmed.slice(first));
  }
};

const listWithWrangler = (databaseName) => {
  try {
    const output = execFileSync(npxBin, ["wrangler", "d1", "list", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = parseWranglerJson(output);
    const records = Array.isArray(parsed) ? parsed : parsed?.result;
    return Array.isArray(records) ? findDb(records, databaseName) : null;
  } catch {
    return null;
  }
};

const resolveWithEnv = (databaseName) => {
  const databaseId =
    process.env.CLOUDFLARE_D1_DATABASE_ID ??
    process.env.D1_DATABASE_ID ??
    process.env.DB_DATABASE_ID;

  if (!databaseId) return null;
  if (!isUuid(databaseId)) {
    throw new Error("CLOUDFLARE_D1_DATABASE_ID must be the D1 database UUID.");
  }

  return {
    database_name: databaseName,
    database_id: databaseId,
  };
};

const cfRequest = async (path, options = {}) => {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
  if (!apiToken) return null;

  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message =
      payload.errors?.map((error) => error.message).join("; ") ||
      `Cloudflare API returned ${response.status}`;
    throw new Error(message);
  }
  return payload.result;
};

const resolveWithApi = async (databaseName) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) return null;

  const listResult = await cfRequest(`/accounts/${accountId}/d1/database`);
  const existing = findDb(Array.isArray(listResult) ? listResult : [], databaseName);
  if (existing) return existing;

  const created = await cfRequest(`/accounts/${accountId}/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name: databaseName }),
  });
  return normalizeDb(created);
};

const main = async () => {
  if (!existsSync(WRANGLER_CONFIG)) {
    throw new Error("wrangler.jsonc was not found.");
  }

  const config = readConfig();
  const d1Databases = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  const target = d1Databases.find((database) => database.binding === TARGET_BINDING);

  if (!target) {
    console.log("No D1 DB binding found; skipping D1 preparation.");
    return;
  }

  if (isUuid(target.database_id)) {
    writeJson(RESOLVED_CACHE, {
      binding: target.binding,
      database_name: target.database_name,
      database_id: target.database_id,
      source: "wrangler.jsonc",
    });
    console.log(`D1 database '${target.database_name}' is already configured.`);
    return;
  }

  const databaseName = target.database_name;
  let resolvedDb = resolveWithEnv(databaseName);

  if (!resolvedDb) {
    try {
      resolvedDb = await resolveWithApi(databaseName);
    } catch (error) {
      console.warn(`Cloudflare API D1 lookup failed: ${error.message}`);
    }
  }

  resolvedDb ??= listWithWrangler(databaseName);

  if (!resolvedDb?.database_id) {
    const ciLike =
      process.env.CI ||
      process.env.CF_PAGES ||
      process.env.CF_WORKERS_CI ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CLOUDFLARE_API_TOKEN ||
      process.env.CLOUDFLARE_D1_DATABASE_ID;

    const message = [
      `Could not resolve D1 database '${databaseName}'.`,
      "Create it in Cloudflare D1, provide CLOUDFLARE_D1_DATABASE_ID, or provide CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN during deployment.",
    ].join(" ");

    if (ciLike) throw new Error(message);
    console.warn(`${message} Continuing local build without a remote D1 id.`);
    return;
  }

  const nextConfig = {
    ...config,
    d1_databases: d1Databases.map((database) =>
      database.binding === TARGET_BINDING
        ? { ...database, database_id: resolvedDb.database_id }
        : database,
    ),
  };

  writeFileSync(WRANGLER_CONFIG, `${JSON.stringify(nextConfig, null, 2)}\n`);
  writeJson(RESOLVED_CACHE, {
    binding: target.binding,
    database_name: databaseName,
    database_id: resolvedDb.database_id,
    source: "cloudflare",
  });

  console.log(`Resolved D1 database '${databaseName}' for Cloudflare deployment.`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
