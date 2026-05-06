/** Conversion factor: 1 km/h = 0.621371 mph */
export const KPH_TO_MPH = 0.621371;

/** Maximum supported VBO file size in bytes (50 MB) */
export const MAX_VBO_FILE_SIZE = 50 * 1024 * 1024;

/** Minimum data samples required for a valid VBO file */
export const MIN_VBO_SAMPLES = 2;

/** Nudge step values (milliseconds) shown on the timeline track controls. */
export const NUDGE_STEPS_MS = [10000, 1000, 500, 100, 10, 1];

/** Error codes and their user-facing messages. */
export const ERROR_MESSAGES = {
  MISSING_COLUMN_NAMES_SECTION:
    'Invalid VBO file: [column names] section not found. Is this a RaceChrono VBO export?',
  MISSING_DATA_SECTION:
    'Invalid VBO file: [data] section not found.',
  MISSING_TIME_COLUMN:
    "Invalid VBO file: no 'time' column found. Check your RaceChrono export settings.",
  MISSING_VELOCITY_COLUMN:
    "Invalid VBO file: no 'velocity' column found. Check your RaceChrono export settings.",
  INSUFFICIENT_DATA:
    'VBO file contains too few data points to be useful (fewer than 2 samples).',
  PARSE_ERROR:
    'Could not parse the VBO file. Please check it is a valid text export from RaceChrono.',
  FILE_TOO_LARGE:
    'File is too large. Maximum supported size is 50MB.',
  VIDEO_LOAD_ERROR:
    'This video could not be loaded. Please use an MP4 file compatible with your browser.',
  FILE_READ_ERROR:
    'Could not read the file. Please try again.',
};
