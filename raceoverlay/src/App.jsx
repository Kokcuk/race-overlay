import { useState, useCallback, useEffect, useRef } from 'react';
import FilesPanel from './components/FilesPanel.jsx';
import DisplayObjectsPanel from './components/DisplayObjectsPanel.jsx';
import Timeline from './components/Timeline.jsx';
import DisplayObjectLayer from './components/DisplayObjectLayer.jsx';
import { useAnimationFrame } from './hooks/useAnimationFrame.js';
import { parseVBO } from './lib/vboParser.js';
import { ERROR_MESSAGES, MAX_VBO_FILE_SIZE } from './lib/constants.js';
import {
  DEFAULT_SCENE,
  getDisplayObjectById,
} from './displayObjects/registry.js';

const SCENE_STORAGE_KEY = 'raceoverlay.scene.v1';

function loadScene() {
  try {
    const raw = localStorage.getItem(SCENE_STORAGE_KEY);
    if (!raw) return DEFAULT_SCENE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SCENE;
    const valid = parsed
      .filter((s) => s && typeof s.id === 'string' && getDisplayObjectById(s.id))
      .map((s) => {
        const def = getDisplayObjectById(s.id);
        return { id: s.id, config: { ...def.defaultConfig, ...s.config } };
      });
    return valid.length ? valid : DEFAULT_SCENE;
  } catch {
    return DEFAULT_SCENE;
  }
}

export default function App() {
  // --- Files ---
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoFileName, setVideoFileName] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(null);

  const [vboSamples, setVboSamples] = useState(null);
  const [vboLaps, setVboLaps] = useState(null);
  const [vboFileName, setVboFileName] = useState('');
  const [vboDuration, setVboDuration] = useState(0);
  const [vboLoading, setVboLoading] = useState(false);
  const [vboError, setVboError] = useState(null);

  // --- Sync + timeline ---
  const [syncOffset, setSyncOffset] = useState(0);

  // --- Display ---
  const [scene, setScene] = useState(loadScene);
  const [selectedDisplayObjectId, setSelectedDisplayObjectId] = useState(null);
  const [videoTime, setVideoTime] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(scene));
    } catch {
      // localStorage may be unavailable (private mode, quota); ignore.
    }
  }, [scene]);

  const handleConfigChange = useCallback((idx, partial) => {
    setScene((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, config: { ...s.config, ...partial } } : s
      )
    );
  }, []);

  const handleAddToScene = useCallback((id) => {
    const def = getDisplayObjectById(id);
    if (!def) return;
    setScene((prev) =>
      prev.some((s) => s.id === id)
        ? prev
        : [...prev, { id: def.id, config: { ...def.defaultConfig } }]
    );
  }, []);

  const handleRemoveFromScene = useCallback((id) => {
    setScene((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const videoRef = useRef(null);
  const prevVideoUrl = useRef(null);

  useEffect(() => {
    return () => {
      if (prevVideoUrl.current) URL.revokeObjectURL(prevVideoUrl.current);
    };
  }, []);

  const handleAddVideo = useCallback((file) => {
    setVideoError(null);
    if (
      !file.type.startsWith('video/') &&
      !file.name.toLowerCase().endsWith('.mp4')
    ) {
      setVideoError(ERROR_MESSAGES.VIDEO_LOAD_ERROR);
      return;
    }

    setVideoLoading(true);

    if (prevVideoUrl.current) URL.revokeObjectURL(prevVideoUrl.current);
    const url = URL.createObjectURL(file);
    prevVideoUrl.current = url;

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      setVideoUrl(url);
      setVideoFileName(file.name);
      setVideoDuration(probe.duration || 0);
      setVideoLoading(false);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      prevVideoUrl.current = null;
      setVideoError(ERROR_MESSAGES.VIDEO_LOAD_ERROR);
      setVideoLoading(false);
    };
    probe.src = url;
  }, []);

  const handleAddVbo = useCallback((file) => {
    setVboError(null);
    if (file.size > MAX_VBO_FILE_SIZE) {
      setVboError(ERROR_MESSAGES.FILE_TOO_LARGE);
      return;
    }
    setVboLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = parseVBO(e.target.result);
        setVboSamples(result.samples);
        setVboLaps(result.laps);
        setVboFileName(file.name);
        setVboDuration(result.timeRange.end - result.timeRange.start);
        setVboLoading(false);
      } catch (err) {
        setVboError(err.message || ERROR_MESSAGES.PARSE_ERROR);
        setVboLoading(false);
      }
    };
    reader.onerror = () => {
      setVboError(ERROR_MESSAGES.FILE_READ_ERROR);
      setVboLoading(false);
    };
    reader.readAsText(file);
  }, []);

  const handleRemoveVideo = useCallback(() => {
    if (prevVideoUrl.current) {
      URL.revokeObjectURL(prevVideoUrl.current);
      prevVideoUrl.current = null;
    }
    setVideoUrl(null);
    setVideoFileName('');
    setVideoDuration(0);
    setVideoError(null);
    setVideoTime(0);
  }, []);

  const handleRemoveVbo = useCallback(() => {
    setVboSamples(null);
    setVboLaps(null);
    setVboFileName('');
    setVboDuration(0);
    setVboError(null);
    setSyncOffset(0);
  }, []);

  const tickVideoTime = useCallback(() => {
    const v = videoRef.current;
    if (v) setVideoTime(v.currentTime);
  }, []);

  useAnimationFrame(tickVideoTime, Boolean(videoUrl));

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => setVideoTime(v.currentTime);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('seeked', onTimeUpdate);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('seeked', onTimeUpdate);
    };
  }, [videoUrl]);

  return (
    <>
      <nav className="navbar navbar-dark bg-dark mb-3">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">Race Overlay</span>
        </div>
      </nav>

      <div className="container-fluid">
        <div className="app-main">
          <section className="app-stage">
            {videoUrl ? (
              <div className="video-stage mb-3">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                />
                <DisplayObjectLayer
                  scene={scene}
                  samples={vboSamples}
                  laps={vboLaps}
                  videoTime={videoTime}
                  syncOffset={syncOffset}
                  selectedId={selectedDisplayObjectId}
                  onSelect={setSelectedDisplayObjectId}
                  onConfigChange={handleConfigChange}
                />
              </div>
            ) : (
              <div className="video-stage video-stage--empty mb-3">
                <div className="text-muted text-center">
                  <p className="h5 mb-1">No video loaded</p>
                  <p className="small mb-0">
                    Use the <strong>Files</strong> panel to add one.
                  </p>
                </div>
              </div>
            )}

            <Timeline
              videoDuration={videoDuration}
              telemetryDuration={vboDuration}
              videoTime={videoTime}
              syncOffset={syncOffset}
              onSyncOffsetChange={setSyncOffset}
            />
          </section>

          <aside className="app-side">
            <FilesPanel
              videoFileName={videoFileName}
              videoLoading={videoLoading}
              videoError={videoError}
              vboFileName={vboFileName}
              vboLoading={vboLoading}
              vboError={vboError}
              onAddVideo={handleAddVideo}
              onAddVbo={handleAddVbo}
              onRemoveVideo={handleRemoveVideo}
              onRemoveVbo={handleRemoveVbo}
            />
            <DisplayObjectsPanel
              scene={scene}
              selectedId={selectedDisplayObjectId}
              onSelect={setSelectedDisplayObjectId}
              onAdd={handleAddToScene}
              onRemove={handleRemoveFromScene}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
