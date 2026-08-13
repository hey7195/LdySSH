import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const releaseDir = resolve(root, "prismssh-cpp/x64/Release");
const distDir = resolve(root, "LdySSH_Portable_v1.0.0");

if (!existsSync(releaseDir)) {
  console.error("Release folder not found:", releaseDir);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });

console.log("Copying executable files to portable directory...");
cpSync(resolve(releaseDir, "prismssh-cpp.exe"), resolve(distDir, "LdySSH.exe"), { force: true });
cpSync(resolve(releaseDir, "WebView2Loader.dll"), resolve(distDir, "WebView2Loader.dll"), { force: true });

if (existsSync(resolve(releaseDir, "ui"))) {
  cpSync(resolve(releaseDir, "ui"), resolve(distDir, "ui"), { recursive: true, force: true });
}

if (existsSync(resolve(releaseDir, "tools"))) {
  cpSync(resolve(releaseDir, "tools"), resolve(distDir, "tools"), { recursive: true, force: true });
}

console.log("Successfully created portable directory:", distDir);
