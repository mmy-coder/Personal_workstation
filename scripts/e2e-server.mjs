// Test-only server: IPC gives Windows a direct, bounded shutdown path.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import next from "next";

if (
  process.env.DATABASE_URL !== "file:./e2e.db" ||
  process.env.NEXT_DIST_DIR !== ".next-e2e"
)
  throw new Error(
    "E2E server requires its isolated database and build directory.",
  );

let app;
let stopping = false;
const server = createServer((request, response) => {
  if (!app) {
    response.writeHead(503).end();
    return;
  }
  app.getRequestHandler()(request, response);
});
async function stop() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  server.closeAllConnections();
  server.close();
  try {
    await app?.close();
    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.on("message", (message) => {
  if (message === "stop") void stop();
});
process.on("disconnect", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

try {
  // Reserve the port before touching test data. Never reuse an unknown server.
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3100, "127.0.0.1", resolve);
  });
  execFileSync(process.execPath, ["scripts/init-db.mjs"], {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  // Exercise the production bundle, without hot-reload manifest races.
  execFileSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build", "--webpack"],
    {
      stdio: "inherit",
      env: process.env,
      windowsHide: true,
    },
  );
  app = next({
    dev: false,
    hostname: "127.0.0.1",
    port: 3100,
    httpServer: server,
  });
  await app.prepare();
  process.send?.("ready");
} catch (error) {
  console.error(error);
  process.exit(1);
}
