import Speedometer from './Speedometer.jsx';
import TrackMap from './TrackMap.jsx';
import CurrentLapTime from './CurrentLapTime.jsx';
import BestLapTime from './BestLapTime.jsx';

/**
 * Display Objects — widgets rendered on top of the video.
 *
 * Each entry has the shape:
 *   {
 *     id:            string  — stable unique id
 *     label:         string  — human readable name
 *     defaultConfig: object  — design tokens (position, style, options, ...)
 *     Component:     React component, props:
 *                       { samples, laps, videoTime, syncOffset, config }
 *   }
 *
 * To add a new widget:
 *   1. Create a component file in src/displayObjects/.
 *   2. Add an entry below pointing to it.
 *   3. (Optional) Place it in DEFAULT_SCENE so it shows up by default.
 */

const TEXT_DEFAULTS = {
  color: '#ffffff',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace',
  fontWeight: 700,
  textShadow:
    '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 8px rgba(0,0,0,0.8)',
  backgroundColor: 'rgba(0,0,0,0.45)',
  padding: '6px 10px',
  borderRadius: 6,
};

export const DISPLAY_OBJECTS = [
  {
    id: 'speedometer',
    label: 'Speedometer',
    defaultConfig: {
      position: { x: 5, y: 5 },
      scale: 1,
      style: { ...TEXT_DEFAULTS, fontSize: 64, padding: '8px 12px' },
      unit: 'kph',
    },
    Component: Speedometer,
  },
  {
    id: 'track-map',
    label: 'Track Map',
    defaultConfig: {
      position: { x: 72, y: 5 },
      scale: 1,
      size: { width: 220, height: 160 },
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 6,
        padding: 8,
        trackColor: '#ffffff',
        trackWidth: 2,
        dotColor: '#ffc107',
        dotRadius: 5,
        dotStrokeColor: '#000000',
        dotStrokeWidth: 2,
      },
    },
    Component: TrackMap,
  },
  {
    id: 'current-lap-time',
    label: 'Current Lap Time',
    defaultConfig: {
      position: { x: 5, y: 78 },
      scale: 1,
      label: 'LAP',
      style: { ...TEXT_DEFAULTS, fontSize: 30 },
    },
    Component: CurrentLapTime,
  },
  {
    id: 'best-lap-time',
    label: 'Best Lap Time',
    defaultConfig: {
      position: { x: 25, y: 78 },
      scale: 1,
      label: 'BEST',
      style: { ...TEXT_DEFAULTS, fontSize: 30 },
    },
    Component: BestLapTime,
  },
];

export const DEFAULT_SCENE = DISPLAY_OBJECTS.map((obj) => ({
  id: obj.id,
  config: obj.defaultConfig,
}));

export function getDisplayObjectById(id) {
  return DISPLAY_OBJECTS.find((obj) => obj.id === id) || null;
}
