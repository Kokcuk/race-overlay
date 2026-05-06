import { getSpeedAtTime, computeEffectiveTime } from '../lib/speedEngine.js';
import { KPH_TO_MPH } from '../lib/constants.js';

export default function Speedometer({ samples, videoTime, syncOffset, config }) {
  const effectiveTime = computeEffectiveTime(videoTime, syncOffset);
  const { speedKph, inDeadZone } = getSpeedAtTime(samples, effectiveTime);

  const speedInUnit = config.unit === 'mph' ? speedKph * KPH_TO_MPH : speedKph;
  const value = inDeadZone ? '--' : Math.round(speedInUnit);
  const unitLabel = config.unit === 'mph' ? 'mph' : 'km/h';

  const { style } = config;

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
    opacity: inDeadZone ? 0.5 : 1,
  };

  const valueStyle = {
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  };

  const unitStyle = {
    fontSize: Math.round(style.fontSize * 0.3),
    fontWeight: 400,
    opacity: 0.85,
    marginTop: 2,
  };

  return (
    <div style={wrapperStyle}>
      <span style={valueStyle}>{value}</span>
      <span style={unitStyle}>{unitLabel}</span>
    </div>
  );
}
