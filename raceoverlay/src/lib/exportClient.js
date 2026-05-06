/**
 * Client for the backend export API.
 *
 * Flow:
 *   1. POST /api/export with the source File + a JSON config (scene,
 *      samples, laps, syncOffset). Returns { jobId }.
 *   2. Poll GET /api/export/:id until state is 'done', 'failed', or
 *      'cancelled'.
 *   3. On 'done', GET /api/export/:id/result to download the MP4.
 *
 * Cancellation: if the caller signals via shouldCancel(), POST
 *   /api/export/:id/cancel and stop polling.
 */

const POLL_INTERVAL_MS = 1000;

// Production sends export requests directly to a non-proxied origin
// hostname so Cloudflare's 100 MB upload limit doesn't apply. In dev
// we go through Vite's /api proxy.
const API_BASE = import.meta.env.PROD ? 'https://api.race-overlay.com' : '';

/**
 * @param {object} args
 * @param {File} args.videoFile
 * @param {object} args.config           — { scene, samples, laps, syncOffset }
 * @param {(s:{ state:string, stage:string, progress:number }) => void} [args.onProgress]
 * @param {() => boolean} [args.shouldCancel]
 * @returns {Promise<{ blob: Blob, cancelled: boolean }>}
 */
export async function exportViaBackend({
  videoFile,
  config,
  onProgress,
  shouldCancel,
}) {
  if (!videoFile) throw new Error('Video file is required.');

  const form = new FormData();
  form.append('video', videoFile, videoFile.name);
  form.append('config', JSON.stringify(config));

  const startRes = await fetch(`${API_BASE}/api/export`, {
    method: 'POST',
    body: form,
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => '');
    throw new Error(`Export request failed: ${startRes.status} ${text}`);
  }
  const { jobId } = await startRes.json();
  if (!jobId) throw new Error('Server did not return a job id.');

  while (true) {
    if (shouldCancel?.()) {
      await fetch(`${API_BASE}/api/export/${jobId}/cancel`, {
        method: 'POST',
      }).catch(() => {});
      return { blob: null, cancelled: true };
    }

    const statusRes = await fetch(`${API_BASE}/api/export/${jobId}`);
    if (!statusRes.ok) {
      throw new Error(`Status check failed: ${statusRes.status}`);
    }
    const status = await statusRes.json();
    onProgress?.(status);

    if (status.state === 'done') break;
    if (status.state === 'failed') {
      throw new Error(status.error || 'Export failed on the server.');
    }
    if (status.state === 'cancelled') {
      return { blob: null, cancelled: true };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const resultRes = await fetch(`${API_BASE}/api/export/${jobId}/result`);
  if (!resultRes.ok) {
    throw new Error(`Could not download result: ${resultRes.status}`);
  }
  const blob = await resultRes.blob();
  return { blob, cancelled: false };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
