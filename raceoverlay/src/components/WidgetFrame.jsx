import { useRef, useState, useCallback } from 'react';

const HANDLE_SIZE = 12;
const MIN_SCALE = 0.3;
const MAX_SCALE = 5;

/**
 * Wraps a Display Object with positioning, uniform scaling, and hover-
 * activated drag + resize affordances.
 *
 * - `config.position: { x, y }` — top-left in % of the parent stage.
 * - `config.scale: number`      — uniform scale factor (default 1).
 *
 * The dashed outline and the bottom-right resize handle appear while:
 *   - the cursor is over the widget, OR
 *   - a drag/resize is in progress, OR
 *   - the widget is the currently selected one (driven by the side panel
 *     or by a previous click on the widget itself).
 *
 * The frame is always `pointer-events: auto` so it can receive hover and
 * click events. The surrounding layer keeps `pointer-events: none` so
 * empty space between widgets still passes clicks through to the video.
 */
export default function WidgetFrame({
  config,
  selected,
  onSelect,
  onConfigChange,
  stageRef,
  children,
}) {
  const frameRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const scale = config.scale ?? 1;
  const showChrome = hovered || interacting || selected;

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      onSelect?.();
      const stage = stageRef.current?.getBoundingClientRect();
      if (!stage) return;
      setInteracting(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = { ...config.position };

      const onMove = (ev) => {
        const dxPct = ((ev.clientX - startX) / stage.width) * 100;
        const dyPct = ((ev.clientY - startY) / stage.height) * 100;
        onConfigChange({
          position: {
            x: clamp(startPos.x + dxPct, 0, 95),
            y: clamp(startPos.y + dyPct, 0, 95),
          },
        });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setInteracting(false);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [stageRef, config.position, onConfigChange, onSelect]
  );

  const startResize = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect) return;
      setInteracting(true);
      const originX = rect.left;
      const originY = rect.top;
      const startScale = config.scale ?? 1;
      const startDist = Math.max(
        12,
        Math.hypot(e.clientX - originX, e.clientY - originY)
      );

      const onMove = (ev) => {
        const dist = Math.hypot(ev.clientX - originX, ev.clientY - originY);
        const newScale = clamp(startScale * (dist / startDist), MIN_SCALE, MAX_SCALE);
        onConfigChange({ scale: newScale });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setInteracting(false);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [config.scale, onConfigChange]
  );

  const wrapperStyle = {
    position: 'absolute',
    left: `${config.position.x}%`,
    top: `${config.position.y}%`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    pointerEvents: 'auto',
    cursor: showChrome ? 'move' : 'default',
    outline: showChrome ? `${1 / scale}px dashed #ffc107` : 'none',
    outlineOffset: showChrome ? `${2 / scale}px` : '0',
  };

  // Inverse-scale chrome so it stays visually constant at any scale.
  const handleSize = HANDLE_SIZE / scale;
  const handleBorder = 2 / scale;

  return (
    <div
      ref={frameRef}
      style={wrapperStyle}
      onMouseDown={startDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {showChrome && (
        <div
          onMouseDown={startResize}
          style={{
            position: 'absolute',
            right: -handleSize / 2,
            bottom: -handleSize / 2,
            width: handleSize,
            height: handleSize,
            background: '#ffc107',
            border: `${handleBorder}px solid #000`,
            borderRadius: 2 / scale,
            cursor: 'nwse-resize',
            boxSizing: 'content-box',
          }}
        />
      )}
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
