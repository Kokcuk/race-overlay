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

  // --- Muxer ---
  const muxerConfig = {
    target: new ArrayBufferTarget(),
    fastStart: 'in-memory',
    video: {
      codec: muxerVideoCodec(codec),
      width,
      height,
    },
  };
  if (audio) {
    muxerConfig.audio = {
      codec: 'aac',
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels,
    };
  }
  const muxer = new Muxer(muxerConfig);

  // --- Encoder ---
  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });

  const encoderConfig = {
    codec: encoderCodecString(codec, height),
    width,
    height,
    bitrate: 12_000_000,
    framerate: fps,
  };
  if (codec.startsWith('avc1') || codec.startsWith('avc3')) {
    encoderConfig.avc = { format: 'avc' };
  }
  encoder.configure(encoderConfig);

  // --- Canvas ---
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const cache = {};
  const totalFrames = videoSamples.length;
  let processed = 0;

  // --- Decoder feeds composite+encode in its output callback ---
  let decoderError = null;
  const decoder = new VideoDecoder({
    output: async (frame) => {
      try {
        if (shouldCancel?.()) {
          frame.close();
          return;
        }
        while (encoder.encodeQueueSize > ENCODE_QUEUE_HIGH_WATER) {
          await sleep(1);
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

        const composited = new VideoFrame(canvas, { timestamp: ts, duration: dur });
        const isKey = processed % Math.max(1, Math.round(fps * 2)) === 0;
        encoder.encode(composited, { keyFrame: isKey });
        composited.close();

        processed++;
        if (processed % 6 === 0 || processed === totalFrames) {
          onProgress?.({ phase: 'rendering', progress: processed / totalFrames });
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
  for (const sample of videoSamples) {
    if (shouldCancel?.()) break;
    decoder.decode(
      new EncodedVideoChunk({
        type: sample.isSync ? 'key' : 'delta',
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      })
    );
    while (decoder.decodeQueueSize > ENCODE_QUEUE_HIGH_WATER * 4) {
      await sleep(2);
      if (decoderError) throw decoderError;
    }
  }

  await decoder.flush();
  await encoder.flush();
  decoder.close();
  encoder.close();

  if (decoderError) throw decoderError;
  if (encoderError) throw encoderError;
  if (shouldCancel?.()) return { blob: null, cancelled: true };

  // --- Audio passthrough ---
  if (audio && audio.description && audio.samples.length) {
    for (const sample of audio.samples) {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      });
      muxer.addAudioChunk(chunk, {
        decoderConfig: { description: audio.description },
      });
    }
  }

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
      if (videoDone && audioDone) finalize();
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

function muxerVideoCodec(codecString) {
  if (codecString.startsWith('avc')) return 'avc';
  if (codecString.startsWith('hvc') || codecString.startsWith('hev')) return 'hevc';
  if (codecString.startsWith('vp09')) return 'vp9';
  if (codecString.startsWith('av01')) return 'av1';
  return 'avc';
}

function encoderCodecString(sourceCodec, height) {
  // Re-encode as H.264 main/high profile for broad playback compatibility.
  if (sourceCodec.startsWith('avc')) {
    // Match the source profile when possible; otherwise pick a sane high profile.
    return sourceCodec;
  }
  // For HEVC/VP9/AV1 source, transcode to H.264 high profile, level depends on resolution.
  const level = height > 1080 ? '32' : height > 720 ? '28' : '1f'; // 5.0 / 4.0 / 3.1
  return `avc1.6400${level.toUpperCase()}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
