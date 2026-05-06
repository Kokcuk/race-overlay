/**
 * Client for the backend export API.
 *
 * Three phases reported via onProgress:
 *   - phase 'uploading'   — bytes-uploaded / total
 *   - phase 'processing'  — server-side render + encode (polled)
 *   - phase 'downloading' — fetching the resulting MP4
 *
 * Upload uses XMLHttpRequest because fetch() can't expose
 * upload.onprogress in current browsers.
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
 * @param {(s:{ phase:string, progress:number, stage?:string }) => void} [args.onProgress]
 * @param {() => boolean} [args.shouldCancel]
 * @returns {Promise<{ blob: Blob|null, cancelled: boolean }>}
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

  // --- Phase 1: upload ---
  onProgress?.({ phase: 'uploading', progress: 0 });
  let jobId;
  try {
    const res = await uploadWithProgress(`${API_BASE}/api/export`, form, (p) => {
      onProgress?.({ phase: 'uploading', progress: p });
    });
    const parsed = JSON.parse(res);
    jobId = parsed.jobId;
  } catch (e) {
    throw new Error(`Upload failed: ${e.message}`);
  }
  if (!jobId) throw new Error('Server did not return a job id.');
  onProgress?.({ phase: 'uploading', progress: 1 });

  // --- Phase 2: poll for processing completion ---
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
    onProgress?.({
      phase: 'processing',
      progress: status.progress ?? 0,
      stage: status.stage,
    });

    if (status.state === 'done') break;
    if (status.state === 'failed') {
      throw new Error(status.error || 'Export failed on the server.');
    }
    if (status.state === 'cancelled') {
      return { blob: null, cancelled: true };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // --- Phase 3: download result ---
  onProgress?.({ phase: 'downloading', progress: 0 });
  const resultRes = await fetch(`${API_BASE}/api/export/${jobId}/result`);
  if (!resultRes.ok) {
    throw new Error(`Could not download result: ${resultRes.status}`);
  }
  const blob = await streamBlobWithProgress(resultRes, (p) => {
    onProgress?.({ phase: 'downloading', progress: p });
  });
  onProgress?.({ phase: 'downloading', progress: 1 });
  return { blob, cancelled: false };
}

function uploadWithProgress(url, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
      } else {
        reject(new Error(`HTTP ${xhr.status} ${xhr.responseText.slice(0, 200)}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('network error')));
    xhr.addEventListener('abort', () => reject(new Error('aborted')));
    xhr.send(body);
  });
}

async function streamBlobWithProgress(response, onProgress) {
  const total = parseInt(response.headers.get('Content-Length') || '0', 10);
  if (!total || !response.body) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received / total);
  }
  const type = response.headers.get('Content-Type') || 'video/mp4';
  return new Blob(chunks, { type });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
