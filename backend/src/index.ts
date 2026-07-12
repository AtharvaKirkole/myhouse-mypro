import { createApp, startSchedulers } from "./gateway/app";
import { config } from "./core/config"; // validates env at import — fail fast
import { flushEvents } from "./core/events";
import { log, logAt } from "./core/http";

const app = createApp();
const server = app.listen(config.port, () => {
  log(null, "gateway", `listening on :${config.port} (${config.env})`, { aiProvider: config.aiProvider });
});
const scheduler = startSchedulers();

/* graceful shutdown: stop accepting, drain the queue, exit */
async function shutdown(signal: string) {
  logAt("warn", null, "gateway", `shutdown:${signal}`);
  clearInterval(scheduler);
  server.close(async () => {
    await flushEvents();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard deadline
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => logAt("error", null, "gateway", "unhandledRejection", { err: String(err) }));
process.on("uncaughtException", (err) => {
  logAt("fatal", null, "gateway", "uncaughtException", { err: String(err) });
  process.exit(1);
});
