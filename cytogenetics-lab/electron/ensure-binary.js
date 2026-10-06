/**
 * Electron's own installer can leave an incomplete dist folder on this path.
 * If the executable is missing, unpack the cached zip with tar.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(root, "node_modules", "electron");
const binaryName = process.platform === "win32"
  ? "electron.exe"
  : process.platform === "darwin"
    ? "Electron.app/Contents/MacOS/Electron"
    : "electron";
const exe = path.join(electronDir, "dist", binaryName);
const pathFile = path.join(electronDir, "path.txt");

if (!fs.existsSync(path.join(electronDir, "package.json"))) process.exit(0);
if (fs.existsSync(exe) && fs.existsSync(pathFile)) process.exit(0);

const { downloadArtifact } = require("@electron/get");
const { version } = require(path.join(electronDir, "package.json"));
const zip = await downloadArtifact({
  version,
  artifactName: "electron",
  platform: process.platform,
  arch: process.arch,
});
const dist = path.join(electronDir, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
execFileSync("tar", ["-xf", zip, "-C", dist], { stdio: "inherit" });
fs.writeFileSync(pathFile, binaryName);
console.log(`Electron ${version} ready.`);
