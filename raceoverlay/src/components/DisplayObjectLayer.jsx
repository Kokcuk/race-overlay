import { useRef } from 'react';
import { getDisplayObjectById } from '../displayObjects/registry.js';
import WidgetFrame from './WidgetFrame.jsx';

/**
 * Renders all active Display Objects on top of the video stage.
 * Each widget is wrapped in a WidgetFrame that owns positioning, scale,
 * hover-activated affordances, and selection.
 *
 * @param {object} props
 * @param {Array<{id:string, config:object}>} props.scene
 * @param {Array} props.samples
 * @param {Array} props.laps
 * @param {number} props.videoTime
 * @param {number} props.syncOffset
 * @param {string|null} props.selectedId
 * @param {(id:string|null) => void} props.onSelect
 * @param {(idx:number, partial:object) => void} props.onConfigChange
 */
export default function DisplayObjectLayer({
  scene,
  samples,
  laps,
  videoTime,
  syncOffset,
  selectedId,
  onSelect,
  onConfigChange,
}) {
  const layerRef = useRef(null);

  if (!samples) return null;

  return (
    <div ref={layerRef} className="display-object-layer">
      {scene.map((instance, idx) => {
        const def = getDisplayObjectById(instance.id);
        if (!def) return null;
        const Component = def.Component;
        return (
          <WidgetFrame
            key={`${instance.id}-${idx}`}
            config={instance.config}
            selected={instance.id === selectedId}
            onSelect={() => onSelect(instance.id)}
            stageRef={layerRef}
            onConfigChange={(partial) => onConfigChange(idx, partial)}
          >
            <Component
              samples={samples}
              laps={laps}
              videoTime={videoTime}
              syncOffset={syncOffset}
              config={instance.config}
            />
          </WidgetFrame>
        );
      })}
    </div>
  );
}
