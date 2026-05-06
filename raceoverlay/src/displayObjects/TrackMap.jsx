import { useMemo } from 'react';
import { getPositionAtTime, computeEffectiveTime } from '../lib/speedEngine.js';

const PADDING_RATIO = 0.06;

export default function TrackMap({ samples, videoTime, syncOffset, config }) {
  const track = useMemo(() => buildTrack(samples), [samples]);
  if (!track) return null;

  const effectiveTime = computeEffectiveTime(videoTime, syncOffset);
  const pos = getPositionAtTime(samples, effectiveTime);
  const dot = pos.inDeadZone
    ? null
    : projectPoint(pos.lat, pos.long, track.cosLatScale);

  const { size, style } = config;

  const wrapperStyle = {
    width: size.width,
    height: size.height,
    backgroundColor: style.backgroundColor,
    borderRadius: style.borderRadius,
    padding: style.padding,
    boxSizing: 'border-box',
  };

  return (
    <div style={wrapperStyle}>
      <svg
        width="100%"
        height="100%"
        viewBox={track.viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={track.d}
          fill="none"
          stroke={style.trackColor}
          strokeWidth={track.strokeWidth * style.trackWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dot && (
          <circle
            cx={dot.x}
            cy={dot.y}
            r={track.strokeWidth * style.dotRadius}
            fill={style.dotColor}
            stroke={style.dotStrokeColor}
            strokeWidth={track.strokeWidth * style.dotStrokeWidth}
          />
        )}
      </svg>
    </div>
  );
}

function buildTrack(samples) {
  if (!samples || samples.length < 2) return null;

  const valid = samples.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.long)
  );
  if (valid.length < 2) return null;

  let latSum = 0;
  for (const s of valid) latSum += s.lat;
  const meanLat = latSum / valid.length;
  // VBO lat/long are in arc-minutes. Cosine correction uses radians.
  const cosLatScale = Math.cos((meanLat / 60) * (Math.PI / 180));

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const points = new Array(valid.length);
  for (let i = 0; i < valid.length; i++) {
    const p = projectPoint(valid[i].lat, valid[i].long, cosLatScale);
    points[i] = p;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height) || 1;
  const padding = span * PADDING_RATIO;

  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = width + padding * 2;
  const vbH = height + padding * 2;

  let d = '';
  for (let i = 0; i < points.length; i++) {
    d += (i === 0 ? 'M' : 'L') + points[i].x.toFixed(4) + ' ' + points[i].y.toFixed(4);
  }

  // strokeWidth scales with the viewBox so it reads as "pixels" regardless of size.
  const strokeWidth = span / 100;

  return {
    d,
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    cosLatScale,
    strokeWidth,
  };
}

function projectPoint(lat, long, cosLatScale) {
  // RaceLogic VBO stores longitude in arc-minutes, positive WEST. To make
  // east render on the right side of the screen we flip the x sign.
  return { x: -long * cosLatScale, y: -lat };
}
