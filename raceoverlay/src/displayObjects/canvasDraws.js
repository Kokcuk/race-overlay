/**
 * Canvas-render functions for every Display Object.
 *
 * The export pipeline (lib/videoExporter.js) draws each frame onto an
 * offscreen canvas at the video's native resolution. Each widget needs
 * a `drawCanvas(ctx, args)` mirror of its React rendering so the export
 * looks the same as the live preview.
 *
 * `args.renderScale` translates "CSS pixels at the displayed stage size"
 * into "canvas pixels at the video's native resolution" — without this,
 * a 64-pixel speedometer at 800-px stage display would look much smaller
 * on a 1920-pixel native canvas.
 */

import {
  getSpeedAtTime,
  getPositionAtTime,
  computeEffectiveTime,
} from '../lib/speedEngine.js';
import { getLapAtTime, getBestLap, formatLapTime } from '../lib/lapEngine.js';
import { KPH_TO_MPH } from '../lib/constants.js';
import { buildTrack, projectPoint } from '../lib/trackProjection.js';

export const CANVAS_DRAWS = {
  speedometer: drawSpeedometer,
  'track-map': drawTrackMap,
  'current-lap-time': drawCurrentLap,
  'best-lap-time': drawBestLap,
};

function drawSpeedometer(ctx, args) {
  const { samples, videoTime, syncOffset, config, stageW, stageH, renderScale } = args;
  const eff = computeEffectiveTime(videoTime, syncOffset);
  const { speedKph, inDeadZone } = getSpeedAtTime(samples, eff);
  const speed = config.unit === 'mph' ? speedKph * KPH_TO_MPH : speedKph;
  const valueText = inDeadZone ? '--' : String(Math.round(speed));
  const unitText = config.unit === 'mph' ? 'mph' : 'km/h';

  const px = (config.position.x / 100) * stageW;
  const py = (config.position.y / 100) * stageH;
  const k = (config.scale ?? 1) * renderScale;

  const fs = config.style.fontSize * k;
  const ufs = Math.round(fs * 0.3);
  const padX = 12 * k;
  const padY = 8 * k;

  ctx.save();
  ctx.translate(px, py);
  ctx.globalAlpha = inDeadZone ? 0.5 : 1;

  // Measure
  ctx.font = fontString(config.style, fs);
  ctx.textBaseline = 'top';
  const valueW = ctx.measureText(valueText).width;
  ctx.font = fontString(config.style, ufs, 400);
  const unitW = ctx.measureText(unitText).width;

  const boxW = Math.max(valueW, unitW) + padX * 2;
  const boxH = fs + ufs + padY * 2 + 2 * k;

  // Background
  ctx.fillStyle = config.style.backgroundColor;
  fillRoundRect(ctx, 0, 0, boxW, boxH, (config.style.borderRadius || 6) * k);

  // Value with outline
  ctx.font = fontString(config.style, fs);
  ctx.fillStyle = config.style.color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4 * k;
  ctx.lineJoin = 'round';
  ctx.strokeText(valueText, padX, padY);
  ctx.fillText(valueText, padX, padY);

  // Unit with outline
  ctx.font = fontString(config.style, ufs, 400);
  ctx.lineWidth = 2 * k;
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * 0.85;
  ctx.strokeText(unitText, padX, padY + fs + 2 * k);
  ctx.fillText(unitText, padX, padY + fs + 2 * k);
  ctx.globalAlpha = baseAlpha;

  ctx.restore();
}

function drawCurrentLap(ctx, args) {
  const { laps, videoTime, syncOffset, config } = args;
  const eff = computeEffectiveTime(videoTime, syncOffset);
  const lap = getLapAtTime(laps, eff);
  const value = lap ? formatLapTime(eff - lap.startTime) : '--';
  drawLabeledTime(ctx, args, config.label, value, !lap);
}

function drawBestLap(ctx, args) {
  const { laps, config } = args;
  const best = getBestLap(laps);
  const value = best ? formatLapTime(best.duration) : '--';
  drawLabeledTime(ctx, args, config.label, value, !best);
}

function drawLabeledTime(ctx, args, label, value, dimmed) {
  const { config, stageW, stageH, renderScale } = args;
  const px = (config.position.x / 100) * stageW;
  const py = (config.position.y / 100) * stageH;
  const k = (config.scale ?? 1) * renderScale;

  const fs = config.style.fontSize * k;
  const lfs = Math.round(fs * 0.4);
  const padX = 10 * k;
  const padY = 6 * k;

  ctx.save();
  ctx.translate(px, py);
  ctx.globalAlpha = dimmed ? 0.5 : 1;
  ctx.textBaseline = 'top';

  ctx.font = fontString(config.style, fs);
  const valueW = ctx.measureText(value).width;
  ctx.font = fontString(config.style, lfs, 400);
  const labelW = ctx.measureText(label).width;
  const boxW = Math.max(valueW, labelW) + padX * 2;
  const boxH = lfs + fs + padY * 2 + 2 * k;

  // Background
  ctx.fillStyle = config.style.backgroundColor;
  fillRoundRect(ctx, 0, 0, boxW, boxH, (config.style.borderRadius || 6) * k);

  // Label (small, above)
  ctx.font = fontString(config.style, lfs, 400);
  ctx.fillStyle = config.style.color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2 * k;
  ctx.lineJoin = 'round';
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * 0.85;
  ctx.strokeText(label, padX, padY);
  ctx.fillText(label, padX, padY);
  ctx.globalAlpha = baseAlpha;

  // Value
  ctx.font = fontString(config.style, fs);
  ctx.lineWidth = 4 * k;
  ctx.strokeText(value, padX, padY + lfs + 2 * k);
  ctx.fillText(value, padX, padY + lfs + 2 * k);

  ctx.restore();
}

function drawTrackMap(ctx, args) {
  const {
    samples,
    videoTime,
    syncOffset,
    config,
    stageW,
    stageH,
    renderScale,
    cache,
  } = args;

  if (!cache.trackMap) cache.trackMap = buildTrack(samples);
  const data = cache.trackMap;
  if (!data) return;

  const px = (config.position.x / 100) * stageW;
  const py = (config.position.y / 100) * stageH;
  const k = (config.scale ?? 1) * renderScale;

  const w = config.size.width * k;
  const h = config.size.height * k;
  const padding = config.style.padding * k;

  ctx.save();
  ctx.translate(px, py);

  // Background
  ctx.fillStyle = config.style.backgroundColor;
  fillRoundRect(ctx, 0, 0, w, h, (config.style.borderRadius || 6) * k);

  // Map projection: viewBox coords → canvas coords
  const innerW = w - padding * 2;
  const innerH = h - padding * 2;
  const sx = innerW / data.viewBox.w;
  const sy = innerH / data.viewBox.h;
  const mapScale = Math.min(sx, sy);
  const offsetX = (innerW - data.viewBox.w * mapScale) / 2 + padding;
  const offsetY = (innerH - data.viewBox.h * mapScale) / 2 + padding;

  const project = (x, y) => ({
    x: (x - data.viewBox.x) * mapScale + offsetX,
    y: (y - data.viewBox.y) * mapScale + offsetY,
  });

  // Path
  ctx.strokeStyle = config.style.trackColor;
  ctx.lineWidth = data.strokeWidth * config.style.trackWidth * mapScale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < data.points.length; i++) {
    const p = project(data.points[i].x, data.points[i].y);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // Dot
  const eff = computeEffectiveTime(videoTime, syncOffset);
  const pos = getPositionAtTime(samples, eff);
  if (!pos.inDeadZone) {
    const projected = projectPoint(pos.lat, pos.long, data.cosLatScale);
    const p = project(projected.x, projected.y);
    const r = data.strokeWidth * config.style.dotRadius * mapScale;

    ctx.fillStyle = config.style.dotColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = config.style.dotStrokeColor;
    ctx.lineWidth = data.strokeWidth * config.style.dotStrokeWidth * mapScale;
    ctx.stroke();
  }

  ctx.restore();
}

// --- helpers ---

function fontString(style, sizePx, weightOverride) {
  const weight = weightOverride ?? style.fontWeight ?? 400;
  return `${weight} ${Math.round(sizePx)}px ${style.fontFamily}`;
}

function fillRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
