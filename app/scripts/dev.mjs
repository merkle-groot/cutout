import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const viteEntry = join(dirname(require.resolve("vite")), "cli.js");
const children = [
  spawn(process.execPath, [viteEntry, "--host", "0.0.0.0"], { stdio: "inherit" }),
  spawn(process.execPath, ["server/index.mjs"], { stdio: "inherit" }),
];

function shutdown() {
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const child of children) child.on("error", (error) => {
  console.error(error);
  shutdown();
  process.exitCode = 1;
});
for (const child of children) child.on("exit", (code) => {
  if (code && code !== 143) process.exitCode = code;
});
