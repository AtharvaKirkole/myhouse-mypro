import { createApp, startSchedulers } from "./gateway/app";
import { config } from "./core/config";
import { log } from "./core/http";

const app = createApp();
app.listen(config.port, () => {
  log(null, "gateway", `listening on :${config.port} (${config.env})`, { aiProvider: config.aiProvider });
  startSchedulers();
});
