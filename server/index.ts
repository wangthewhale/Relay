import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { store } from "./store";
import { startAgentRuntime } from "./agentRuntime";

const app = createApp();
const isProduction = process.env.NODE_ENV === "production";

await store.seedDemo();
await startAgentRuntime();

if (isProduction) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(root, "public");
  app.use((await import("express")).default.static(publicDir, { immutable: true, maxAge: "1h" }));
  app.get("*splat", (_request, response) => response.sendFile(path.join(publicDir, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT || 5000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Relay listening on http://0.0.0.0:${port} (${isProduction ? "production" : "development"})`);
});
