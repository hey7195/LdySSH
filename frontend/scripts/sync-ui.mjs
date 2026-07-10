import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dist = resolve(root, "frontend/dist");
const targets = [
  resolve(root, "prismssh-cpp/ui"),
  resolve(root, "src/ui")
];

if (!existsSync(dist)) {
  throw new Error(`Missing build output: ${dist}`);
}

for (const target of targets) {
  mkdirSync(target, { recursive: true });
  rmSync(resolve(target, "assets"), { recursive: true, force: true });
  cpSync(resolve(dist, "index.html"), resolve(target, "template.html"));
  cpSync(resolve(dist, "assets"), resolve(target, "assets"), { recursive: true });
  cpSync(resolve(dist, "favicon.ico"), resolve(target, "favicon.ico"));
}
