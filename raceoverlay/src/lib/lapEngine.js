/**
 * Lap-timing computations.
 *
 * The VBO file's [laptiming] section defines a start/finish line as a
 * segment between two GPS points. We detect each time the path between
 * two consecutive samples crosses that segment; each crossing is a lap
 * boundary. Crossing time is interpolated linearly between samples.
 *
 * A "complete" lap is one whose start and end are both crossings.
 * Partial laps (recording starts mid-lap, or stops mid-lap) are kept
 * but flagged `complete: false` and excluded from the best-lap query.
 */

/**
 * @typedef {{ startTime:number, endTime:number, duration:number, complete:boolean, index:number }} Lap
 */

/**
 * Compute laps from VBO samples and a start/finish line.
 *
 * @param {Array<{time:number, lat:number, long:number}>} samples
 * @param {{ p1:{lat:number,long:number}, p2:{lat:number,long:number} } | null} startFinishLine
 * @returns {Lap[]}
 */
export function computeLaps(samples, startFinishLine) {
  if (!samples || samples.length < 2) return [];

  if (!startFinishLine) {
    // No line defined — treat the whole recording as one incomplete lap
    // so widgets can still show a relative timer.
    return [
      {
        index: 1,
        startTime: samples[0].time,
        endTime: samples[samples.length - 1].time,
        duration: samples[samples.length - 1].time - samples[0].time,
        complete: false,
      },
    ];
  }

  const { p1: L1, p2: L2 } = startFinishLine;

  const crossings = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (
      !Number.isFinite(a.lat) ||
      !Number.isFinite(a.long) ||
      !Number.isFinite(b.lat) ||
      !Number.isFinite(b.long)
    ) {
      continue;
    }
    const t = segmentCrossingParam(
      { x: a.long, y: a.lat },
      { x: b.long, y: b.lat },
      { x: L1.long, y: L1.lat },
      { x: L2.long, y: L2.lat }
    );
    if (t !== null) {
      crossings.push(a.time + t * (b.time - a.time));
    }
  }

  const laps = [];
  const firstSampleTime = samples[0].time;
  const lastSampleTime = samples[samples.length - 1].time;

  if (crossings.length === 0) {
    laps.push({
      index: 1,
      startTime: firstSampleTime,
      endTime: lastSampleTime,
      duration: lastSampleTime - firstSampleTime,
      complete: false,
    });
    return laps;
  }

  if (crossings[0] > firstSampleTime + 1e-6) {
    laps.push({
      index: laps.length + 1,
      startTime: firstSampleTime,
      endTime: crossings[0],
      duration: crossings[0] - firstSampleTime,
      complete: false,
    });
  }

  for (let i = 0; i < crossings.length - 1; i++) {
    laps.push({
      index: laps.length + 1,
      startTime: crossings[i],
      endTime: crossings[i + 1],
      duration: crossings[i + 1] - crossings[i],
      complete: true,
    });
  }

  if (lastSampleTime > crossings[crossings.length - 1] + 1e-6) {
    laps.push({
      index: laps.length + 1,
      startTime: crossings[crossings.length - 1],
      endTime: lastSampleTime,
      duration: lastSampleTime - crossings[crossings.length - 1],
      complete: false,
    });
  }

  return laps;
}

/** Find the lap covering an effective VBO time, or null. */
export function getLapAtTime(laps, effectiveTime) {
  if (!laps || laps.length === 0) return null;
  for (const lap of laps) {
    if (effectiveTime >= lap.startTime && effectiveTime <= lap.endTime) {
      return lap;
    }
  }
  return null;
}

/** Return the fastest complete lap, or null if none. */
export function getBestLap(laps) {
  if (!laps) return null;
  let best = null;
  for (const lap of laps) {
    if (lap.complete && (!best || lap.duration < best.duration)) best = lap;
  }
  return best;
}

/**
 * Return the parameter `t ∈ [0, 1]` at which segment p1→p2 crosses
 * line segment l1→l2, or null if they don't cross.
 */
function segmentCrossingParam(p1, p2, l1, l2) {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = l2.x - l1.x;
  const sy = l2.y - l1.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const qx = l1.x - p1.x;
  const qy = l1.y - p1.y;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

/** Format seconds → "M:SS.fff" (e.g. 65.123 → "1:05.123"). */
export function formatLapTime(seconds) {
  const safe = Math.max(0, seconds);
  const totalMs = Math.round(safe * 1000);
  const min = Math.floor(totalMs / 60000);
  const sec = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${min}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
