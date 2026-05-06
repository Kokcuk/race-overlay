import { useEffect, useRef } from 'react';

/**
 * Custom hook that runs a callback on every requestAnimationFrame tick.
 * Automatically starts/stops based on the `active` flag.
 *
 * @param {(timestamp: number) => void} callback - Called each frame
 * @param {boolean} active - Whether the loop should be running
 */
export function useAnimationFrame(callback, active) {
  const callbackRef = useRef(callback);
  const rafRef = useRef(null);

  // Keep callback ref up to date without re-triggering the effect
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!active) return;

    function tick(timestamp) {
      callbackRef.current(timestamp);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [active]);
}
