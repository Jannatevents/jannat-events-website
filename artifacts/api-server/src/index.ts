import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeeded } from "./seed";
import { refreshPastEvents } from "./lib/eventStatus";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const disableStartupWrites = process.env["DISABLE_STARTUP_WRITES"] === "true";

if (!disableStartupWrites) {
  await ensureSeeded();
}

app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info(`Server listening on 0.0.0.0:${port}`);
  if (disableStartupWrites) {
    logger.info("Startup database writes and event refresh are disabled");
    return;
  }

  const refresh = () => {
    void refreshPastEvents().catch((error) => logger.error({ error }, "Could not refresh event statuses"));
  };
  refresh();
  setInterval(refresh, 60_000);
});
