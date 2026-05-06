/**
 * VBO file parser for RaceChrono exports.
 *
 * Handles the real VBO format:
 *   [header]       — channel descriptions (e.g. "velocity kmh")
 *   [column names] — space-separated column identifiers
 *   [data]         — space-separated rows of numeric values
 *
 * Time column uses GPS HHMMSS.SS format which is converted to
 * elapsed seconds from the first sample.
 */

import { MIN_VBO_SAMPLES, ERROR_MESSAGES } from './constants.js';
import { computeLaps } from './lapEngine.js';

/**
 * Convert GPS time (HHMMSS.SS format) to total seconds.
 * @param {number} gpsTime - e.g. 025839.59
 * @returns {number} total seconds (e.g. 10719.59)
 */
function gpsTimeToSeconds(gpsTime) {
  const hours = Math.floor(gpsTime / 10000);
  const minutes = Math.floor((gpsTime % 10000) / 100);
  const seconds = gpsTime % 100;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parse a VBO file string into an array of speed samples.
 *
 * @param {string} text - Raw VBO file content
 * @returns {{ samples: Array<{time: number, velocity: number}>, timeRange: {start: number, end: number}, sampleCount: number }}
 * @throws {Error} with a code property for specific parse failures
 */
export function parseVBO(text) {
  const lines = text.split(/\r?\n/);

  // Find section boundaries
  let columnNamesIdx = -1;
  let dataIdx = -1;
  let lapTimingIdx = -1;
  let lapTimingEndIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim().toLowerCase();
    if (trimmed === '[column names]') {
      columnNamesIdx = i;
      if (lapTimingIdx !== -1 && lapTimingEndIdx === -1) lapTimingEndIdx = i;
    } else if (trimmed === '[data]') {
      dataIdx = i;
      if (lapTimingIdx !== -1 && lapTimingEndIdx === -1) lapTimingEndIdx = i;
    } else if (trimmed === '[laptiming]') {
      lapTimingIdx = i;
    } else if (lapTimingIdx !== -1 && lapTimingEndIdx === -1 && /^\[.+\]$/.test(trimmed)) {
      lapTimingEndIdx = i;
    }
  }

  if (columnNamesIdx === -1) {
    throw createParseError('MISSING_COLUMN_NAMES_SECTION');
  }

  if (dataIdx === -1) {
    throw createParseError('MISSING_DATA_SECTION');
  }

  // Parse column names — the line immediately following [column names]
  const columnLine = lines[columnNamesIdx + 1];
  if (!columnLine || !columnLine.trim()) {
    throw createParseError('PARSE_ERROR');
  }

  const columns = columnLine.trim().split(/\s+/);
  const timeIdx = columns.indexOf('time');
  const velocityIdx = columns.indexOf('velocity');

  // Also try alternate names
  const velIdx = velocityIdx !== -1
    ? velocityIdx
    : columns.indexOf('velocity-calc');

  // GPS columns are optional — when missing the TrackMap widget hides itself.
  // RaceChrono uses 'lat'/'long' or sometimes 'latitude'/'longitude'.
  const latIdx =
    columns.indexOf('lat') !== -1
      ? columns.indexOf('lat')
      : columns.indexOf('latitude');
  const longIdx =
    columns.indexOf('long') !== -1
      ? columns.indexOf('long')
      : columns.indexOf('longitude');

  if (timeIdx === -1) {
    throw createParseError('MISSING_TIME_COLUMN');
  }

  if (velIdx === -1) {
    throw createParseError('MISSING_VELOCITY_COLUMN');
  }

  // Parse data rows
  const samples = [];
  let firstTimeSeconds = null;

  for (let i = dataIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Stop if we hit another section
    if (line.startsWith('[')) break;

    const fields = line.split(/\s+/);

    const rawTime = parseFloat(fields[timeIdx]);
    const rawVelocity = parseFloat(fields[velIdx]);

    if (isNaN(rawTime) || isNaN(rawVelocity)) continue;

    const totalSeconds = gpsTimeToSeconds(rawTime);

    if (firstTimeSeconds === null) {
      firstTimeSeconds = totalSeconds;
    }

    // Handle midnight rollover: if time suddenly drops, add 24h
    let elapsed = totalSeconds - firstTimeSeconds;
    if (elapsed < 0) {
      elapsed += 86400; // 24 hours
    }

    const lat = latIdx !== -1 ? parseFloat(fields[latIdx]) : NaN;
    const long = longIdx !== -1 ? parseFloat(fields[longIdx]) : NaN;

    samples.push({
      time: elapsed,
      velocity: Math.abs(rawVelocity),
      lat,
      long,
    });
  }

  if (samples.length < MIN_VBO_SAMPLES) {
    throw createParseError('INSUFFICIENT_DATA');
  }

  const startFinishLine = parseStartFinishLine(
    lines,
    lapTimingIdx,
    lapTimingEndIdx === -1 ? lines.length : lapTimingEndIdx
  );
  const laps = computeLaps(samples, startFinishLine);

  return {
    samples,
    sampleCount: samples.length,
    timeRange: {
      start: samples[0].time,
      end: samples[samples.length - 1].time,
    },
    startFinishLine,
    laps,
  };
}

/**
 * Parse the [laptiming] block and return the start/finish line, or null
 * if no usable line is present. RaceLogic's format is:
 *
 *   Start   long1 lat1 long2 lat2 ¬ Comment
 *
 * Some files use a different first token (e.g. a circuit name). We
 * accept the first row whose first four numeric fields are finite.
 */
function parseStartFinishLine(lines, fromIdx, toIdx) {
  if (fromIdx === -1) return null;
  for (let i = fromIdx + 1; i < toIdx; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const beforeComment = raw.split('¬')[0].trim();
    if (!beforeComment) continue;
    const parts = beforeComment.split(/\s+/);
    // Drop a non-numeric leading label (e.g. "Start").
    const numbers = parts.map((p) => parseFloat(p)).filter(Number.isFinite);
    if (numbers.length < 4) continue;
    const [long1, lat1, long2, lat2] = numbers;
    return {
      p1: { lat: lat1, long: long1 },
      p2: { lat: lat2, long: long2 },
    };
  }
  return null;
}

/**
 * Create an error with a code property for structured error handling.
 * @param {string} code - Error code from ERROR_MESSAGES
 * @returns {Error}
 */
function createParseError(code) {
  const err = new Error(ERROR_MESSAGES[code] || ERROR_MESSAGES.PARSE_ERROR);
  err.code = code;
  return err;
}
