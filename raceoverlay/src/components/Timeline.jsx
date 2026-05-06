import { useMemo, useRef } from 'react';
import { NUDGE_STEPS_MS } from '../lib/constants.js';

/**
 * Two-clip timeline (video on top, telemetry below) on a shared seconds
 * axis. Only the telemetry clip is interactive — drag it horizontally to
 * adjust `syncOffset`, or use the nudge buttons below for finer steps.
 *
 * The video clip is read-only — it represents the anchor track at t=0.
 */
export default function Timeline({
  videoDuration,
  telemetryDuration,
  videoTime,
  syncOffset,
  onSyncOffsetChange,
}) {
  const areaRef = useRef(null);

  const layout = useMemo(() => {
    const videoStart = 0;
    const videoEnd = videoStart + (videoDuration || 0);
    const telemetryStart = syncOffset;
    const telemetryEnd = telemetryStart + (telemetryDuration || 0);

    const minT = Math.min(videoStart, telemetryStart, 0);
    const maxT = Math.max(videoEnd, telemetryEnd, 1);
    const span = Math.max(maxT - minT, 1);

    return { videoStart, videoEnd, telemetryStart, telemetryEnd, minT, maxT, span };
  }, [videoDuration, telemetryDuration, syncOffset]);

  const toPct = (t) => ((t - layout.minT) / layout.span) * 100;

  const ticks = useMemo(() => {
    const span = layout.span;
    let stepSec;
    if (span <= 10) stepSec = 1;
    else if (span <= 60) stepSec = 5;
    else if (span <= 300) stepSec = 30;
    else if (span <= 1800) stepSec = 60;
    else stepSec = 300;

    const out = [];
    const start = Math.ceil(layout.minT / stepSec) * stepSec;
    for (let t = start; t <= layout.maxT; t += stepSec) {
      out.push({ t, label: formatSeconds(t) });
    }
    return out;
  }, [layout]);

  const canEdit = Boolean(telemetryDuration);

  const handleNudge = (deltaMs) => {
    if (!canEdit) return;
    onSyncOffsetChange(syncOffset + deltaMs / 1000);
  };

  const startTelemetryDrag = (e) => {
    if (!canEdit) return;
    e.preventDefault();
    const area = areaRef.current?.getBoundingClientRect();
    if (!area) return;
    const startX = e.clientX;
    const startOffset = syncOffset;
    const pxPerSec = area.width / layout.span;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      onSyncOffsetChange(startOffset + dx / pxPerSec);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const playheadPct = toPct(videoTime);

  return (
    <div>
      <div className="timeline">
        <div className="timeline-inner">
          <div className="timeline-label-col">
            <div className="timeline-row-spacer" />
            <div className="timeline-row timeline-label">Video</div>
            <div className="timeline-row timeline-label">Telemetry</div>
          </div>
          <div className="timeline-area" ref={areaRef}>
            <div className="timeline-ruler">
              {ticks.map((tick) => (
                <span
                  key={tick.t}
                  className="timeline-tick"
                  style={{ left: `${toPct(tick.t)}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>

            <Clip
              kind="video"
              leftPct={toPct(layout.videoStart)}
              widthPct={toPct(layout.videoEnd) - toPct(layout.videoStart)}
              duration={videoDuration}
              enabled={Boolean(videoDuration)}
            />
            <Clip
              kind="telemetry"
              leftPct={toPct(layout.telemetryStart)}
              widthPct={toPct(layout.telemetryEnd) - toPct(layout.telemetryStart)}
              duration={telemetryDuration}
              offsetLabel={syncOffset}
              enabled={canEdit}
              draggable
              onMouseDown={startTelemetryDrag}
            />

            {Boolean(videoDuration) && (
              <div
                className="timeline-playhead"
                style={{ left: `${playheadPct}%` }}
              />
            )}
          </div>
        </div>
      </div>

      <NudgeControls
        canEdit={canEdit}
        syncOffset={syncOffset}
        onNudge={handleNudge}
        onReset={() => onSyncOffsetChange(0)}
      />
    </div>
  );
}

function Clip({
  kind,
  leftPct,
  widthPct,
  duration,
  offsetLabel,
  enabled,
  draggable,
  onMouseDown,
}) {
  if (!enabled) return <div className="timeline-track-area" />;
  return (
    <div className="timeline-track-area">
      <div
        className={`timeline-clip timeline-clip--${kind} ${
          draggable ? 'timeline-clip--draggable' : ''
        }`}
        style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
        onMouseDown={onMouseDown}
      >
        {duration ? formatSeconds(duration) : ''}
        {offsetLabel !== undefined ? ` · offset ${formatOffset(offsetLabel)}` : ''}
      </div>
    </div>
  );
}

function NudgeControls({ canEdit, syncOffset, onNudge, onReset }) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-1 mt-2 small">
      <span className="text-muted fw-semibold me-2">Adjust telemetry</span>

      {NUDGE_STEPS_MS.map((ms) => (
        <button
          key={`-${ms}`}
          type="button"
          className="btn btn-sm btn-light"
          disabled={!canEdit}
          onClick={() => onNudge(-ms)}
        >
          −{formatStep(ms)}
        </button>
      ))}
      <span className="vr mx-1" />
      {[...NUDGE_STEPS_MS].reverse().map((ms) => (
        <button
          key={`+${ms}`}
          type="button"
          className="btn btn-sm btn-light"
          disabled={!canEdit}
          onClick={() => onNudge(ms)}
        >
          +{formatStep(ms)}
        </button>
      ))}

      <span className="ms-auto text-muted font-monospace">
        offset = {formatOffset(syncOffset)}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={onReset}
        disabled={!canEdit || syncOffset === 0}
      >
        Reset
      </button>
    </div>
  );
}

function formatStep(ms) {
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function formatSeconds(t) {
  const sign = t < 0 ? '-' : '';
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  return `${sign}${m}:${s.toFixed(0).padStart(2, '0')}`;
}

function formatOffset(sec) {
  const sign = sec >= 0 ? '+' : '−';
  return `${sign}${Math.abs(sec).toFixed(3)}s`;
}
