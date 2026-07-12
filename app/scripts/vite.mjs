import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const viteEntry = join(dirname(require.resolve("vite")), "cli.js");
const child = spawn(process.execPath, [viteEntry, ...process.argv.slice(2)], { stdio: "inherit" });
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
