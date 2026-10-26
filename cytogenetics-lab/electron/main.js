/**
 * Desktop shell for the teaching laboratory.
 * Serves the static app over app:// and answers /api/reference/* in-process
 * from the packaged SQLite database — students do not need Python or npm.
 */

import { app, BrowserWindow, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureReferenceApi, respond as referenceRespond } from "./reference-api.js";

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

function staticRoot() {
  if (app.isPackaged) return app.getAppPath();
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** SQLite + native modules must live on a real filesystem path (asarUnpack). */
function unpackedRoot() {
  if (!app.isPackaged) return staticRoot();
  return path.join(process.resourcesPath, "app.asar.unpacked");
}

function fileForRequest(requestUrl) {
  const url = new URL(requestUrl);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const relative = pathname.replace(/^[/\\]+/, "");
  const root = staticRoot();
  const resolved = path.resolve(root, relative);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function referenceResponse(requestUrl) {
  const url = new URL(requestUrl);
  const payload = referenceRespond(url.pathname, url.search.replace(/^\?/, ""));
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
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
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https:\/\//i.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.loadURL(`${SCHEME}://lab/index.html`);
}

app.whenReady().then(() => {
  const unpacked = unpackedRoot();
  configureReferenceApi({
    unpackedRoot: unpacked,
    // diseases.json is unpacked beside reference-database for teaching-index links
    labDataRoot: unpacked,
  });
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
