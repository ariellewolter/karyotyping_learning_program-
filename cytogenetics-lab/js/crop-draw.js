/** Draws one rectangular crop of a metaphase image into a canvas, turned and mirrored as the student set it. */
export function drawCrop(ctx, image, piece, width, height, { pad = 8, background = "#f4f4f2" } = {}) {
  const sx = piece.x * image.naturalWidth / 100;
  const sy = piece.y * image.naturalHeight / 100;
  const sw = piece.width * image.naturalWidth / 100;
  const sh = piece.height * image.naturalHeight / 100;
  const rot = cropRotation(piece);
  const sideways = rot === 90 || rot === 270;
  const boxW = sideways ? sh : sw;
  const boxH = sideways ? sw : sh;
  const scale = Math.min((width - pad * 2) / boxW, (height - pad * 2) / boxH);
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(rot * Math.PI / 180);
  if (piece.flip) ctx.scale(-1, 1);
  ctx.drawImage(image, sx, sy, sw, sh, -sw * scale / 2, -sh * scale / 2, sw * scale, sh * scale);
  ctx.restore();
}

export function cropRotation(piece) {
  return [0, 90, 180, 270].includes(piece?.rot) ? piece.rot : 0;
}
