import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const WRANGLER_CONFIG = resolve(ROOT, "wrangler.jsonc");
const RESOLVED_CACHE = resolve(ROOT, ".wrangler", "resolved-d1.json");
const TARGET_BINDING = "DB";

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const isRemoteBuild = Boolean(
  process.env.CI ||
    process.env.CF_PAGES ||
    process.env.CF_WORKERS_CI ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_D1_DATABASE_ID,
);

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const databaseName = () => {
  const config = readJson(WRANGLER_CONFIG);
  const binding = config.d1_databases?.find((database) => database.binding === TARGET_BINDING);
  return binding?.database_name;
};

const resolvedDatabase = () => {
  if (!existsSync(RESOLVED_CACHE)) return null;
  try {
    const cached = readJson(RESOLVED_CACHE);
    return cached?.database_name;
  } catch {
    return null;
  }
};

const main = () => {
  const database = resolvedDatabase() ?? databaseName();
  if (!database) {
    console.log("No D1 database found; skipping remote migrations.");
    return;
  }

  if (!isRemoteBuild) {
    console.log("No remote Cloudflare build context found; skipping remote D1 migrations locally.");
    return;
  }

  try {
    execFileSync(npxBin, ["wrangler", "d1", "migrations", "apply", database, "--remote"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "inherit",
    });
    console.log(`Remote D1 migrations applied for '${database}'.`);
  } catch (error) {
    throw new Error(
      `Remote D1 migrations failed for '${database}'. Check the Cloudflare D1 binding and deployment permissions.`,
      { cause: error },
    );
  }
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
