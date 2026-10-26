/**
 * Desktop shell for the teaching laboratory.
 * The renderer stays the existing browser app. A local app:// origin
 * serves the same files the Python server serves, so module imports and
 * fetch() keep working.
 */

import { spawnSync } from "node:child_process";
import { app, BrowserWindow, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEME = "app";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function fileForRequest(requestUrl) {
  const url = new URL(requestUrl);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const relative = pathname.replace(/^[/\\]+/, "");
  const resolved = path.resolve(ROOT, relative);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (resolved !== ROOT && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Cytogenetics Laboratory",
    backgroundColor: "#120f18",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`${SCHEME}://lab/index.html`);
}

function referenceResponse(requestUrl) {
  const url = new URL(requestUrl);
  const script = path.join(ROOT, "reference-database", "src", "adapters", "api.py");
  const unavailable = { available: false, reason: "Reference module is unavailable. Laboratory activities are unchanged." };
  if (!fs.existsSync(script)) {
    return new Response(JSON.stringify(unavailable), { headers: { "content-type": "application/json" } });
  }
  const result = spawnSync("python3", [script, url.pathname, url.search.replace(/^\?/, "")], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) {
    return new Response(JSON.stringify(unavailable), { headers: { "content-type": "application/json" } });
  }
  return new Response(result.stdout, { headers: { "content-type": "application/json" } });
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/reference")) return referenceResponse(request.url);
    const filePath = fileForRequest(request.url);
    if (!filePath) return new Response("Forbidden", { status: 403 });
    try {
      const body = await fs.promises.readFile(filePath);
      const type = TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      return new Response(body, { headers: { "content-type": type } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
