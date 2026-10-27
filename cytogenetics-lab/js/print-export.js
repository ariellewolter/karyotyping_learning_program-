/**
 * Open printable HTML as a PDF.
 * In the Electron desktop app this uses a Save dialog + printToPDF.
 * In the browser it uses the system print dialog (Save as PDF / Print to PDF).
 */

function desktopApi() {
  return typeof window !== "undefined" ? window.cytogeneticsDesktop : null;
}

function printViaIframe(html, title = "Report") {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", title);
  // Non-zero size: zero-size iframes often produce empty/failed prints in Chromium/Electron.
  frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1";
  frame.srcdoc = html;
  const cleanup = () => {
    try { frame.remove(); } catch { /* already gone */ }
  };
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener("afterprint", cleanup, { once: true });
    win.focus();
    win.print();
    // Fallback if afterprint never fires (some Electron / OS print paths).
    window.setTimeout(cleanup, 120000);
  };
  document.body.append(frame);
}

/**
 * @param {string} html Full HTML document
 * @param {{ title?: string, defaultName?: string }} [options]
 */
export async function exportPrintablePDF(html, { title = "Report", defaultName = "cytogenetics-report.pdf" } = {}) {
  const desktop = desktopApi();
  if (desktop?.savePdf) {
    try {
      await desktop.savePdf(String(html || ""), defaultName);
      return;
    } catch {
      // Fall through to iframe print if the desktop bridge fails.
    }
  }
  printViaIframe(html, title);
}
