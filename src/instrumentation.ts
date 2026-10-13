export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.DISABLE_AUTO_BACKUP !== "1"
  ) {
    const { startAutomaticBackups } = await import("./lib/automatic-backup");
    startAutomaticBackups();
  }
}
