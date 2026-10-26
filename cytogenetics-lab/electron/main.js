/**
 * Desktop shell for the teaching laboratory.
 * Serves the same static app over app:// and answers /api/reference/*
 * by calling the Python reference adapter when Python is available.
 */

import { spawnSync } from "node:child_process";
import { app, BrowserWindow, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** Static files live in the asar (or project root in development). */
function staticRoot() {
  if (app.isPackaged) return app.getAppPath();
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * Python cannot read asar archives. Reference code, SQLite, and teaching JSON
 * are asarUnpack'd so they sit on a real path beside the asar.
 */
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

function findPython() {
  const attempts = process.platform === "win32"
    ? [
      { cmd: "py", args: ["-3"] },
      { cmd: "python", args: [] },
      { cmd: "python3", args: [] },
    ]
    : [
      { cmd: "python3", args: [] },
      { cmd: "python", args: [] },
    ];
  for (const attempt of attempts) {
    try {
      const probe = spawnSync(attempt.cmd, [...attempt.args, "-c", "import sys; print(sys.executable)"], {
        encoding: "utf8",
        env: process.env,
        windowsHide: true,
      });
      if (probe.status === 0 && probe.stdout?.trim()) {
        return { cmd: attempt.cmd, args: attempt.args };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function referenceUnavailable(reason) {
  return new Response(JSON.stringify({
    available: false,
    reason: reason || "Reference module is unavailable. Laboratory activities are unchanged.",
  }), { headers: { "content-type": "application/json" } });
}

function referenceResponse(requestUrl) {
  const url = new URL(requestUrl);
  const root = unpackedRoot();
  const script = path.join(root, "reference-database", "src", "adapters", "api.py");
  const src = path.join(root, "reference-database", "src");
  if (!fs.existsSync(script)) {
    return referenceUnavailable("The reference adapter is not packaged with this build.");
  }
  const python = findPython();
  if (!python) {
    return referenceUnavailable(
      "Python 3 was not found on this computer. Install Python 3 to enable the Reference library. Karyotyping and FISH casework still work.",
    );
  }
  const result = spawnSync(
    python.cmd,
    [...python.args, script, url.pathname, url.search.replace(/^\?/, "")],
    {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: src },
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0 || !result.stdout) {
    const detail = String(result.stderr || result.error?.message || "").trim().slice(0, 240);
    return referenceUnavailable(
      detail
        ? `Reference module is unavailable. ${detail}`
        : "Reference module is unavailable. Laboratory activities are unchanged.",
    );
  }
  return new Response(result.stdout, { headers: { "content-type": "application/json" } });
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
