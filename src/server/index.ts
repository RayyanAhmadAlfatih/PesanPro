import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

try {
  // Complete Next's Node setup before evaluating any application imports.
  await import("next/dist/server/node-environment.js");
  await import("./runtime");
} catch (error) {
  console.error("[Server] Bootstrap failed:", error);
  process.exitCode = 1;
}
