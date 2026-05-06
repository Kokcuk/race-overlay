import express from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm } from 'node:fs/promises';
import { createReadStream, statSync } from 'node:fs';
import { renderExport } from './exporter.js';
import * as d1 from './d1.js';

// Throttle progress writes to D1 — once per second per job is plenty.
const D1_PROGRESS_INTERVAL_MS = 1000;

const PORT = parseInt(process.env.PORT || '3000', 10);
const JOBS_ROOT = process.env.JOBS_ROOT || path.join(os.tmpdir(), 'raceoverlay-jobs');
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${4 * 1024 * 1024 * 1024}`, 10);
const JOB_TTL_MS = 30 * 60 * 1000;

await mkdir(JOBS_ROOT, { recursive: true });

const upload = multer({
  dest: JOBS_ROOT,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const app = express();

// Permissive CORS — production has nginx in front making this same-origin,
// but local dev (Vite at :5173) needs it.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const jobs = new Map();

app.get('/api/health', (req, res) =>
  res.json({ ok: true, d1: d1.isEnabled() })
);

app.get('/api/jobs/recent', async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const rows = await d1.listRecent(limit);
  res.json({ jobs: rows });
});

app.post('/api/export', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'video file is required' });

  let scene;
  let samples;
  let laps;
  let syncOffset;
  try {
    const cfg = JSON.parse(req.body.config);
    scene = cfg.scene;
    samples = cfg.samples;
    laps = cfg.laps;
    syncOffset = cfg.syncOffset || 0;
    if (!Array.isArray(scene) || !Array.isArray(samples)) {
      throw new Error('scene and samples must be arrays');
    }
  } catch (e) {
    await rm(req.file.path, { force: true });
    return res.status(400).json({ error: `invalid config: ${e.message}` });
  }

  const id = uuid();
  const jobDir = path.join(JOBS_ROOT, id);
  await mkdir(jobDir, { recursive: true });
  const outputPath = path.join(jobDir, 'output.mp4');

  const job = {
    id,
    state: 'processing',
    progress: 0,
    stage: 'rendering',
    error: null,
    createdAt: Date.now(),
    sourcePath: req.file.path,
    outputPath,
    abort: new AbortController(),
    lastD1Write: 0,
  };
  jobs.set(id, job);

  // Persist a row to D1 immediately. Don't block the response on it.
  d1.insertJob({
    id,
    state: 'processing',
    sourceFilename: req.file.originalname || null,
    sourceBytes: req.file.size,
    sceneWidgetCount: scene.length,
  }).catch(() => {});

  res.status(202).json({ jobId: id });

  // Run async after responding.
  (async () => {
    try {
      await renderExport({
        sourcePath: job.sourcePath,
        outputPath,
        scene,
        samples,
        laps: laps || [],
        syncOffset,
        signal: job.abort.signal,
        onProgress: ({ stage, progress }) => {
          job.stage = stage;
          job.progress = progress;
          const now = Date.now();
          if (now - job.lastD1Write > D1_PROGRESS_INTERVAL_MS) {
            job.lastD1Write = now;
            d1.updateJob(id, { stage, progress }).catch(() => {});
          }
        },
      });
      if (job.abort.signal.aborted) {
        job.state = 'cancelled';
        d1.finalizeJob(id, { state: 'cancelled', progress: job.progress }).catch(() => {});
      } else {
        job.state = 'done';
        job.progress = 1;
        let outputBytes = null;
        try {
          outputBytes = statSync(outputPath).size;
        } catch {
          /* ignore */
        }
        d1.finalizeJob(id, {
          state: 'done',
          progress: 1,
          stage: 'done',
          output_bytes: outputBytes,
        }).catch(() => {});
      }
    } catch (e) {
      console.error(`job ${id} failed:`, e);
      job.state = 'failed';
      job.error = e.message;
      d1.finalizeJob(id, { state: 'failed', error: e.message }).catch(() => {});
    } finally {
      // Source file is no longer needed once render finishes.
      rm(job.sourcePath, { force: true }).catch(() => {});
    }
  })();
});

app.get('/api/export/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    id: job.id,
    state: job.state,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
  });
});

app.get('/api/export/:id/result', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  if (job.state !== 'done') return res.status(409).json({ error: `job is ${job.state}` });

  const filename = `export-${job.id.slice(0, 8)}.mp4`;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stream = createReadStream(job.outputPath);
  stream.on('error', (err) => {
    console.error(`stream error for ${job.id}:`, err);
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
  res.on('close', () => {
    // Cleanup output once delivered (or client disconnected).
    setTimeout(() => {
      rm(job.outputPath, { force: true }).catch(() => {});
      jobs.delete(job.id);
    }, 2000);
  });
});

app.post('/api/export/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();
  if (job.state === 'processing') {
    job.abort.abort();
  }
  res.json({ ok: true });
});

// GC stale jobs every 5 minutes.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      rm(job.outputPath, { force: true }).catch(() => {});
      rm(job.sourcePath, { force: true }).catch(() => {});
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`raceoverlay backend listening on :${PORT}`);
});
