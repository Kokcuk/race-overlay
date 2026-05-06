/**
 * Speed interpolation engine.
 *
 * Given a set of VBO samples, computes the speed at any point in time
 * using binary search + linear interpolation. Handles dead zone detection
 * when the requested time falls outside the data range.
 */

import { KPH_TO_MPH } from './constants.js';

/**
 * Get the interpolated speed at a given effective VBO time.
 *
 * @param {Array<{time: number, velocity: number}>} samples - Parsed VBO samples sorted by time
 * @param {number} effectiveTime - Video time adjusted by sync offset (seconds)
 * @returns {{ speedKph: number, speedMph: number, inDeadZone: boolean }}
 */
export function getSpeedAtTime(samples, effectiveTime) {
  if (!samples || samples.length === 0) {
    return { speedKph: 0, speedMph: 0, inDeadZone: true };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];

  // Dead zone: before first sample or after last sample
  if (effectiveTime < first.time || effectiveTime > last.time) {
    return { speedKph: 0, speedMph: 0, inDeadZone: true };
  }

  // Exact match on first or last
  if (effectiveTime <= first.time) {
    return makeResult(first.velocity);
  }
  if (effectiveTime >= last.time) {
    return makeResult(last.velocity);
  }

  // Binary search for the two surrounding samples
  let lo = 0;
  let hi = samples.length - 1;

  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time <= effectiveTime) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const s0 = samples[lo];
  const s1 = samples[hi];

  // Linear interpolation
  const dt = s1.time - s0.time;
  if (dt === 0) {
    return makeResult(s0.velocity);
  }

  const t = (effectiveTime - s0.time) / dt;
  const speedKph = s0.velocity + t * (s1.velocity - s0.velocity);

  return makeResult(speedKph);
}

/**
 * Build a display-ready speed result.
 * @param {number} speedKph
 * @returns {{ speedKph: number, speedMph: number, inDeadZone: boolean }}
 */
function makeResult(speedKph) {
  return {
    speedKph,
    speedMph: speedKph * KPH_TO_MPH,
    inDeadZone: false,
  };
}

/**
 * Get the interpolated GPS position at a given effective VBO time.
 * Returns lat/long in the raw VBO units (RaceChrono uses arc-minutes).
 * Returns inDeadZone=true outside the data range or when GPS is missing.
 *
 * @param {Array<{time:number, lat:number, long:number}>} samples
 * @param {number} effectiveTime
 * @returns {{ lat:number, long:number, inDeadZone:boolean }}
 */
export function getPositionAtTime(samples, effectiveTime) {
  if (!samples || samples.length === 0) {
    return { lat: 0, long: 0, inDeadZone: true };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];

  if (effectiveTime < first.time || effectiveTime > last.time) {
    return { lat: 0, long: 0, inDeadZone: true };
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].time <= effectiveTime) lo = mid;
    else hi = mid;
  }

  const s0 = samples[lo];
  const s1 = samples[hi];

  if (Number.isNaN(s0.lat) || Number.isNaN(s0.long)) {
    return { lat: 0, long: 0, inDeadZone: true };
  }

  const dt = s1.time - s0.time;
  if (dt === 0) {
    return { lat: s0.lat, long: s0.long, inDeadZone: false };
  }

  const t = (effectiveTime - s0.time) / dt;
  return {
    lat: s0.lat + t * (s1.lat - s0.lat),
    long: s0.long + t * (s1.long - s0.long),
    inDeadZone: false,
  };
}

/**
 * Compute the effective VBO time for a given video time and sync offset.
 *
 * effectiveTime = videoTime - syncOffset
 *
 * If syncOffset is positive, it means the VBO started before the video,
 * so we subtract the offset to map video time to VBO time.
 *
 * @param {number} videoTime - Current video playback position (seconds)
 * @param {number} syncOffset - Sync offset in seconds
 * @returns {number} Effective VBO time
 */
export function computeEffectiveTime(videoTime, syncOffset) {
  return videoTime - syncOffset;
}
