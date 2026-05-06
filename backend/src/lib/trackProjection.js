/**
 * Shared GPS-track projection math used by both the SVG TrackMap widget
 * and the canvas-render path for export.
 *
 * VBO lat/long are arc-minutes with RaceLogic's "positive west" sign
 * convention; we negate longitude so east renders on the right, and
 * apply a cos(meanLat) correction so circuits don't get squashed.
 */

const PADDING_RATIO = 0.06;

/**
 * Project a single (lat, long) sample.
 * @param {number} lat
 * @param {number} long
 * @param {number} cosLatScale
 * @returns {{ x:number, y:number }}
 */
export function projectPoint(lat, long, cosLatScale) {
  return { x: -long * cosLatScale, y: -lat };
}

/**
 * Build the static track geometry from a samples array. Returns null
 * when the data has no usable GPS.
 *
 * @param {Array<{lat:number, long:number}>} samples
 * @returns {{
 *   points: Array<{x:number,y:number}>,
 *   cosLatScale: number,
 *   bounds: { minX:number, maxX:number, minY:number, maxY:number },
 *   viewBox: { x:number, y:number, w:number, h:number },
 *   strokeWidth: number,
 * } | null}
 */
export function buildTrack(samples) {
  if (!samples || samples.length < 2) return null;

  const valid = samples.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.long)
  );
  if (valid.length < 2) return null;

  let latSum = 0;
  for (const s of valid) latSum += s.lat;
  const meanLat = latSum / valid.length;
  const cosLatScale = Math.cos((meanLat / 60) * (Math.PI / 180));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const points = new Array(valid.length);
  for (let i = 0; i < valid.length; i++) {
    const p = projectPoint(valid[i].lat, valid[i].long, cosLatScale);
    points[i] = p;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height) || 1;
  const padding = span * PADDING_RATIO;

  return {
    points,
    cosLatScale,
    bounds: { minX, maxX, minY, maxY },
    viewBox: {
      x: minX - padding,
      y: minY - padding,
      w: width + padding * 2,
      h: height + padding * 2,
    },
    // Stroke width scaled with the viewBox so the path reads consistently
    // at any rendered size.
    strokeWidth: span / 100,
  };
}
