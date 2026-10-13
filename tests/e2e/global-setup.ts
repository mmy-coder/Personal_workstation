import { fork } from "node:child_process";
import path from "node:path";

export default async function globalSetup() {
  const child = fork(path.resolve("scripts/e2e-server.mjs"), [], {
    env: {
      ...process.env,
      DATABASE_URL: "file:./e2e.db",
      NEXT_DIST_DIR: ".next-e2e",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true,
    execArgv: [],
  });
  let exited = false;
  const exit = new Promise<number | null>((resolve) =>
    child.once("exit", (code) => {
      exited = true;
      resolve(code);
    }),
  );
  async function shutdown() {
    if (exited) return;
    if (child.connected) child.send("stop");
    const timer = setTimeout(() => child.kill(), 15000);
    try {
      const code = await exit;
      if (code !== 0)
        throw new Error(`E2E server did not shut down cleanly (${code}).`);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("E2E server startup timed out")),
        180000,
      );
      const ready = (message: unknown) => {
        if (message === "ready") {
          clearTimeout(timer);
          resolve();
        }
      };
      child.on("message", ready);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      void exit.then((code) => {
        clearTimeout(timer);
        reject(
          new Error(
            `E2E server exited before startup (${code}); check port 3100.`,
          ),
        );
      });
    });
  } catch (error) {
    await shutdown().catch(() => {});
    throw error;
  }
  return shutdown;
}
