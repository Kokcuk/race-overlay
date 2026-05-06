import { getBestLap, formatLapTime } from '../lib/lapEngine.js';

export default function BestLapTime({ laps, config }) {
  const best = getBestLap(laps);
  const value = best ? formatLapTime(best.duration) : '--';

  const { style, label } = config;

  const wrapperStyle = {
    color: style.color,
    fontFamily: style.fontFamily,
    backgroundColor: style.backgroundColor,
    padding: style.padding,
    borderRadius: style.borderRadius,
    textShadow: style.textShadow,
    lineHeight: 1,
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    opacity: best ? 1 : 0.5,
  };

  return (
    <div style={wrapperStyle}>
      <span style={{ fontSize: Math.round(style.fontSize * 0.4), opacity: 0.85 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          marginTop: 2,
        }}
      >
        {value}
      </span>
    </div>
  );
}
