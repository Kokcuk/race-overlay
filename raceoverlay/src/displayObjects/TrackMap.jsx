import { useMemo } from 'react';
import { getPositionAtTime, computeEffectiveTime } from '../lib/speedEngine.js';
import { buildTrack, projectPoint } from '../lib/trackProjection.js';

export default function TrackMap({ samples, videoTime, syncOffset, config }) {
  const track = useMemo(() => buildTrack(samples), [samples]);
  const pathD = useMemo(() => {
    if (!track) return '';
    let d = '';
    for (let i = 0; i < track.points.length; i++) {
      d +=
        (i === 0 ? 'M' : 'L') +
        track.points[i].x.toFixed(4) +
        ' ' +
        track.points[i].y.toFixed(4);
    }
    return d;
  }, [track]);

  if (!track) return null;

  const effectiveTime = computeEffectiveTime(videoTime, syncOffset);
  const pos = getPositionAtTime(samples, effectiveTime);
  const dot = pos.inDeadZone
    ? null
    : projectPoint(pos.lat, pos.long, track.cosLatScale);

  const { size, style } = config;
  const { viewBox, strokeWidth } = track;

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
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={pathD}
          fill="none"
          stroke={style.trackColor}
          strokeWidth={strokeWidth * style.trackWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dot && (
          <circle
            cx={dot.x}
            cy={dot.y}
            r={strokeWidth * style.dotRadius}
            fill={style.dotColor}
            stroke={style.dotStrokeColor}
            strokeWidth={strokeWidth * style.dotStrokeWidth}
          />
        )}
      </svg>
    </div>
  );
}
