/**
 * App-wide runtime config. These are *developer* knobs — the values
 * here are baked into the bundle. End users don't see them.
 */

/**
 * Which export pipeline to use.
 *
 *   'browser' — render in the browser via WebCodecs. Fast, no upload,
 *               keeps audio bit-identical to the source.
 *   'server'  — upload the source video and render with ffmpeg on the
 *               backend. Slower but works in any browser.
 *
 * Falls back automatically to 'server' if 'browser' is selected but
 * WebCodecs isn't available.
 */
export const EXPORT_STRATEGY = 'browser';
