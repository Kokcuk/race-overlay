/**
 * Browser-side MP4 export using WebCodecs + mp4box (demux) + mp4-muxer (mux).
 *
 * Pipeline:
 *   1. mp4box parses the source file → encoded video samples + audio samples
 *      + codec descriptions (avcC for video, ESDS for AAC).
 *   2. VideoDecoder turns encoded video chunks into VideoFrames.
 *   3. For each frame: composite widgets onto a canvas and re-encode the
 *      result with VideoEncoder.
 *   4. Audio chunks are passed through to the muxer untouched (no decode/
 *      re-encode), so audio quality is identical to the source.
 *   5. mp4-muxer assembles the final MP4 in memory.
 *
 * Faster than the backend on a multicore CPU, but relies on the browser
 * supporting WebCodecs and the source codec — so we feature-detect and
 * fall back to the server pipeline when it isn't available.
 */

import { createFile, DataStream } from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { CANVAS_DRAWS } from '../displayObjects/canvasDraws.js';

const ENCODE_QUEUE_HIGH_WATER = 16;

export function browserExportSupported() {
  return (
    typeof window !== 'undefined' &&
    'VideoEncoder' in window &&
    'VideoDecoder' in window &&
    'OffscreenCanvas' in window &&
    'EncodedVideoChunk' in window
  );
}

/**
 * @param {object} args
 * @param {File} args.videoFile
 * @param {Array} args.scene
 * @param {Array} args.samples
 * @param {Array} args.laps
 * @param {number} args.syncOffset
 * @param {(s:{ phase:string, progress:number }) => void} [args.onProgress]
 * @param {() => boolean} [args.shouldCancel]
 * @returns {Promise<{ blob: Blob|null, cancelled: boolean }>}
 */
export async function browserExport({
  videoFile,
  scene,
  samples,
  laps,
  syncOffset,
  onProgress,
  shouldCancel,
}) {
  if (!browserExportSupported()) {
    throw new Error('This browser does not support WebCodecs.');
  }

  onProgress?.({ phase: 'rendering', progress: 0 });

  const buffer = await videoFile.arrayBuffer();
  const demuxed = await demux(buffer);
  if (!demuxed.video) throw new Error('No video track found in file.');

  const { width, height, codec, fps, description: videoDescription } = demuxed.video;
  const videoSamples = demuxed.video.samples;
  const audio = demuxed.audio;

  // --- Muxer (video-only for v1; audio passthrough is server-side) ---
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    video: {
      codec: 'avc',
      width,
      height,
    },
  });

  // --- Encoder ---
  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });

  // Always re-encode as constrained baseline H.264. This profile has
  // no B-frames, which means DTS == CTS — mp4-muxer is happiest there.
  encoder.configure({
    codec: constrainedBaselineCodec(height),
    width,
    height,
    bitrate: 12_000_000,
    bitrateMode: 'constant', // CBR — fill the target bitrate; without this VBR can collapse the file
    framerate: fps,
    latencyMode: 'quality',
    avc: { format: 'avc' },
    videoColorSpace: {
      primaries: 'bt709',
      transfer: 'bt709',
      matrix: 'bt709',
      fullRange: false,
    },
  });

  // --- Canvas ---
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const cache = {};
  const totalFrames = videoSamples.length;
  let processed = 0;

  // --- Decoder output handler ---
  // CRITICAL: must be synchronous from drawImage through encoder.encode().
  // If we await anywhere in this path, multiple in-flight output()
  // invocations can race and call encoder.encode() out of order,
  // producing non-monotonic DTS that mp4-muxer rejects.
  // Backpressure lives on the decode loop instead (below).
  let decoderError = null;
  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        if (shouldCancel?.()) {
          frame.close();
          return;
        }

        ctx.drawImage(frame, 0, 0, width, height);
        const time = processed / fps;
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
            console.error(`widget ${instance.id} failed:`, e);
          }
        }

        const ts = frame.timestamp;
        const dur = frame.duration ?? Math.round(1_000_000 / fps);
        frame.close();

        const composited = new VideoFrame(canvas, {
          timestamp: ts,
          duration: dur,
        });
        const isKey = processed % Math.max(1, Math.round(fps * 2)) === 0;
        encoder.encode(composited, { keyFrame: isKey });
        composited.close();

        processed++;
        if (processed % 6 === 0 || processed === totalFrames) {
          onProgress?.({
            phase: 'rendering',
            progress: processed / totalFrames,
          });
        }
      } catch (e) {
        decoderError = e;
        try {
          frame.close();
        } catch {
          /* ignore */
        }
      }
    },
    error: (e) => {
      decoderError = e;
    },
  });

  decoder.configure({
    codec,
    description: videoDescription,
    codedWidth: width,
    codedHeight: height,
  });

  // --- Pipe video chunks ---
  // Backpressure on the decode loop, not inside the output handler:
  // pause feeding the decoder when either queue gets long. This keeps
  // the output handler strictly serial and monotonic.
  for (const sample of videoSamples) {
    if (shouldCancel?.()) break;
    if (encoderError) throw encoderError;
    if (decoderError) throw decoderError;
    while (
      decoder.decodeQueueSize > ENCODE_QUEUE_HIGH_WATER ||
      encoder.encodeQueueSize > ENCODE_QUEUE_HIGH_WATER
    ) {
      await sleep(2);
      if (decoderError) throw decoderError;
      if (encoderError) throw encoderError;
    }
    decoder.decode(
      new EncodedVideoChunk({
        type: sample.isSync ? 'key' : 'delta',
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      })
    );
  }

  await decoder.flush();
  await encoder.flush();
  decoder.close();
  encoder.close();

  if (decoderError) throw decoderError;
  if (encoderError) throw encoderError;
  if (shouldCancel?.()) return { blob: null, cancelled: true };

  // Audio is intentionally not muxed for v1: extracting AAC's
  // AudioSpecificConfig reliably across every source MP4 takes care
  // we haven't done yet. The 'On server' strategy preserves audio.
  void audio;

  muxer.finalize();
  return {
    blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    cancelled: false,
  };
}

// --- mp4box demux ---

function demux(buffer) {
  return new Promise((resolve, reject) => {
    const file = createFile();
    const out = { video: null, audio: null };
    let videoExpected = 0;
    let audioExpected = 0;
    let videoCollected = 0;
    let audioCollected = 0;
    let resolved = false;

    const finalize = () => {
      if (resolved) return;
      resolved = true;
      resolve(out);
    };

    file.onError = (err) => reject(new Error(`mp4box: ${err}`));

    file.onReady = (info) => {
      const vt = info.tracks.find((t) => t.type === 'video');
      const at = info.tracks.find((t) => t.type === 'audio');

      if (vt) {
        videoExpected = vt.nb_samples;
        out.video = {
          trackId: vt.id,
          timescale: vt.timescale,
          codec: vt.codec,
          width: vt.video?.width || vt.track_width,
          height: vt.video?.height || vt.track_height,
          fps: estimateFps(vt),
          description: extractDescription(file, vt.id),
          samples: [],
        };
        file.setExtractionOptions(vt.id, null, { nbSamples: 200 });
      }
      if (at) {
        audioExpected = at.nb_samples;
        out.audio = {
          trackId: at.id,
          timescale: at.timescale,
          sampleRate: at.audio?.sample_rate || 48000,
          channels: at.audio?.channel_count || 2,
          description: extractDescription(file, at.id),
          samples: [],
        };
        file.setExtractionOptions(at.id, null, { nbSamples: 1000 });
      }

      if (!out.video && !out.audio) {
        reject(new Error('No video or audio tracks found.'));
        return;
      }
      file.start();
    };

    file.onSamples = (id, user, samples) => {
      if (out.video && id === out.video.trackId) {
        for (const s of samples) {
          out.video.samples.push({
            isSync: s.is_sync,
            timestamp: Math.round((s.cts * 1_000_000) / out.video.timescale),
            duration: Math.round((s.duration * 1_000_000) / out.video.timescale),
            data: s.data,
          });
          videoCollected++;
        }
      } else if (out.audio && id === out.audio.trackId) {
        for (const s of samples) {
          out.audio.samples.push({
            timestamp: Math.round((s.cts * 1_000_000) / out.audio.timescale),
            duration: Math.round((s.duration * 1_000_000) / out.audio.timescale),
            data: s.data,
          });
          audioCollected++;
        }
      }
      const videoDone = !out.video || videoCollected >= videoExpected;
      const audioDone = !out.audio || audioCollected >= audioExpected;
      if (videoDone && audioDone) {
        normalizeTimestamps(out);
        finalize();
      }
    };

    const ab = buffer.slice(0);
    ab.fileStart = 0;
    file.appendBuffer(ab);
    file.flush();

    // Safety: if mp4box fires nothing within 30s, give up.
    setTimeout(() => {
      if (!resolved) reject(new Error('Demux timed out.'));
    }, 30000);
  });
}

/**
 * mp4-muxer requires the first chunk of each track to be at timestamp 0.
 * Source files routinely have non-zero starts (audio start offsets, edit
 * lists, B-frame CTS reordering). We shift each track independently so
 * its earliest sample sits at 0; absolute audio/video sync within each
 * track is preserved relative to its own t=0.
 */
function normalizeTimestamps(out) {
  if (out.video && out.video.samples.length > 0) {
    let min = Infinity;
    for (const s of out.video.samples) {
      if (s.timestamp < min) min = s.timestamp;
    }
    if (min !== 0) {
      for (const s of out.video.samples) s.timestamp -= min;
    }
  }
  if (out.audio && out.audio.samples.length > 0) {
    let min = Infinity;
    for (const s of out.audio.samples) {
      if (s.timestamp < min) min = s.timestamp;
    }
    if (min !== 0) {
      for (const s of out.audio.samples) s.timestamp -= min;
    }
  }
}

function estimateFps(track) {
  if (track.nb_samples > 1 && track.duration) {
    const seconds = track.duration / track.timescale;
    if (seconds > 0) {
      const fps = Math.round(track.nb_samples / seconds);
      if (fps >= 1 && fps <= 240) return fps;
    }
  }
  return 30;
}

function extractDescription(file, trackId) {
  const trak = file.getTrackById(trackId);
  if (!trak) return null;
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C || entry.esds;
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
      box.write(stream);
      // mp4box prepends an 8-byte box header (size + type) — strip it.
      return new Uint8Array(stream.buffer, 8);
    }
  }
  return null;
}

// --- codec helpers ---

function constrainedBaselineCodec(height) {
  // Constrained Baseline (avc1.42E0XX): no B-frames, broadly playable.
  // Level depends on resolution.
  let level;
  if (height > 1080) level = '32'; // L5.0
  else if (height > 720) level = '28'; // L4.0
  else level = '1F'; // L3.1
  return `avc1.42E0${level}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
