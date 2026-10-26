/** Download an SVG figure as SVG or PNG. Figures must be self-contained SVG markup. */

const EXPORT_STYLE = `text { font-family: "Helvetica Neue", Arial, sans-serif; fill: #241c33; }
.ideo-lab, .ideo-pole { font-size: 10px; }
.cw-caption { font-size: 11px; font-weight: 600; }
.cw-caption.changed { fill: #8a3b12; }
.cw-title { font-size: 13px; font-weight: 700; }`;

function standalone(markup) {
  let text = String(markup || "").trim();
  if (!/xmlns=/.test(text.slice(0, 200))) text = text.replace(/^<svg\b/, `<svg xmlns="http://www.w3.org/2000/svg"`);
  return text.replace(/^(<svg\b[^>]*>)/, `$1<style>${EXPORT_STYLE}</style><rect width="100%" height="100%" fill="#ffffff"/>`);
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(text, extension) {
  const stem = String(text || "figure").replace(/[^\w.+-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "figure";
  return `${stem}.${extension}`;
}

export function downloadSVG(markup, filename) {
  save(new Blob([standalone(markup)], { type: "image/svg+xml" }), filename);
}

export function downloadPNG(markup, filename, scale = 2) {
  const text = standalone(markup);
  const width = Number(text.match(/<svg\b[^>]*\bwidth="([\d.]+)"/)?.[1]) || 800;
  const height = Number(text.match(/<svg\b[^>]*\bheight="([\d.]+)"/)?.[1]) || 600;
  const image = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("PNG export failed"));
        save(blob, filename);
        resolve();
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("PNG export failed"));
    };
    image.src = url;
  });
}
