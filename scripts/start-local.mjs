import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { prepareLocalDatabase, projectRoot } from "./prepare-local-db.mjs";

// The main local app uses the same default state directory as the Vite plugin.
// Use prepare-local-db --persist-to separately for isolated QA databases.
if (process.argv.length > 2)
  throw new Error("Usage: node scripts/start-local.mjs");
await new Promise((done, reject) => {
  const probe = createServer();
  probe.once("error", () =>
    reject(
      new Error(
        "Stop the existing local app on port 3100 before applying migrations and restarting.",
      ),
    ),
  );
  probe.listen({ host: "127.0.0.1", port: 3100, exclusive: true }, () =>
    probe.close(done),
  );
});
await prepareLocalDatabase();
const child = spawn(
  process.execPath,
  [
    resolve(projectRoot, "node_modules/vinext/dist/cli.js"),
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: "false",
      WRANGLER_LOG_PATH: resolve(projectRoot, ".wrangler/local-dev-logs"),
    },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
