import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createCanvas } from 'canvas';
import { CANVAS_DRAWS } from './canvasDraws.js';

const execFileAsync = promisify(execFile);

const WIDGET_FPS = 30;

/**
 * Probe a video file with ffprobe.
 * @param {string} file
 * @returns {Promise<{ width:number, height:number, fps:number, duration:number }>}
 */
export async function probeVideo(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration',
    '-show_entries', 'format=duration',
    '-of', 'json',
    file,
  ]);
  const data = JSON.parse(stdout);
  const s = data.streams?.[0];
  if (!s) throw new Error('no video stream found');
  const [num, den] = String(s.r_frame_rate || '30/1').split('/').map(Number);
  const fps = den ? num / den : 30;
  const duration = parseFloat(s.duration ?? data.format?.duration ?? '0');
  if (!duration) throw new Error('could not determine video duration');
  return { width: s.width, height: s.height, fps, duration };
}

/**
 * Composite the given scene's widgets onto sourcePath and write an MP4
 * to outputPath. Reports progress via onProgress({ stage, progress }).
 * Aborts when signal.aborted becomes true.
 */
export async function renderExport({
  sourcePath,
  outputPath,
  scene,
  samples,
  laps,
  syncOffset,
  onProgress,
  signal,
}) {
  const info = await probeVideo(sourcePath);
  const { width, height, duration } = info;
  const totalWidgetFrames = Math.ceil(duration * WIDGET_FPS);

  const args = [
    '-y',
    '-i', sourcePath,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    '-framerate', String(WIDGET_FPS),
    '-i', 'pipe:0',
    '-filter_complex', '[0:v][1:v]overlay=format=auto[v]',
    '-map', '[v]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ];

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'] });
  let stderrTail = '';
  ffmpeg.stderr.on('data', (d) => {
    const s = d.toString();
    stderrTail = (stderrTail + s).slice(-4000);
    const m = /frame=\s*(\d+)/.exec(s);
    if (m) {
      const totalSourceFrames = Math.ceil(duration * info.fps);
      const f = parseInt(m[1], 10);
      onProgress?.({
        stage: 'encoding',
        progress: Math.min(1, f / totalSourceFrames),
      });
    }
  });

  const ffmpegExit = new Promise((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderrTail}`));
    });
  });

  if (signal) {
    signal.addEventListener('abort', () => {
      ffmpeg.kill('SIGKILL');
    });
  }

  // Render widget overlay frames into ffmpeg's stdin as raw RGBA.
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const cache = {};
  const stdin = ffmpeg.stdin;

  // If ffmpeg exits early (broken pipe), stop writing.
  let pipeOpen = true;
  stdin.on('error', () => {
    pipeOpen = false;
  });

  for (let i = 0; i < totalWidgetFrames; i++) {
    if (!pipeOpen) break;
    if (signal?.aborted) break;

    const time = i / WIDGET_FPS;
    ctx.clearRect(0, 0, width, height);
    for (const instance of scene) {
      const draw = CANVAS_DRAWS[instance.id];
      if (!draw) continue;
      try {
        draw(ctx, {
          samples,
          laps,
          videoTime: time,
          syncOffset,
          config: instance.config,
          stageW: width,
          stageH: height,
          renderScale: 1,
          cache,
        });
      } catch (e) {
        console.error(`widget ${instance.id} draw failed at t=${time}:`, e.message);
      }
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const buf = Buffer.from(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength
    );

    if (!stdin.write(buf)) {
      await new Promise((resolve) => stdin.once('drain', resolve));
    }

    if (i % 8 === 0) {
      onProgress?.({ stage: 'rendering', progress: i / totalWidgetFrames });
    }
  }

  try {
    stdin.end();
  } catch {
    /* already closed */
  }

  await ffmpegExit;
  return outputPath;
}
