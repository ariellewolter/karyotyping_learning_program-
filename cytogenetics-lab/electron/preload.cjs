/**
 * Exposes a narrow desktop bridge for PDF export.
 * Renderer stays sandboxed; only invoke channels listed here.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cytogeneticsDesktop", {
  savePdf: (html, defaultName) => ipcRenderer.invoke("desktop-save-pdf", { html, defaultName }),
});
