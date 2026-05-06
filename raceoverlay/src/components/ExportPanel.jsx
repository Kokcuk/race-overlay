import { useState, useRef, useCallback } from 'react';

/**
 * Side-panel card for the export.
 *
 * Two strategies, switchable via a toggle:
 *   - 'browser' (default if supported): WebCodecs in the browser. No
 *     upload. Phase shown is "Rendering...".
 *   - 'server': upload + ffmpeg on the backend. Phases shown are
 *     "Uploading...", "Rendering...", "Downloading...".
 */
export default function ExportPanel({ canExport, browserSupported, onExport }) {
  const [strategy, setStrategy] = useState(browserSupported ? 'browser' : 'server');
  const [exporting, setExporting] = useState(false);
  const [phase, setPhase] = useState('rendering');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const handleExport = useCallback(async () => {
    setError(null);
    setProgress(0);
    setPhase(strategy === 'browser' ? 'rendering' : 'uploading');
    setExporting(true);
    cancelRef.current = false;
    try {
      await onExport({
        strategy,
        onProgress: (s) => {
          if (s.phase) setPhase(s.phase);
          if (typeof s.progress === 'number') setProgress(s.progress);
        },
        shouldCancel: () => cancelRef.current,
      });
    } catch (e) {
      setError(e?.message || 'Export failed.');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [strategy, onExport]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const phaseLabel =
    phase === 'uploading'
      ? 'Uploading…'
      : phase === 'downloading'
        ? 'Downloading…'
        : 'Rendering…';

  return (
    <div className="card panel mt-3">
      <div className="card-header py-2 px-3 small fw-semibold">Export</div>
      <div className="card-body p-2">
        {!exporting && (
          <div className="mb-2">
            <div className="form-check form-check-inline small mb-0">
              <input
                type="radio"
                className="form-check-input"
                id="export-browser"
                checked={strategy === 'browser'}
                disabled={!browserSupported}
                onChange={() => setStrategy('browser')}
              />
              <label className="form-check-label" htmlFor="export-browser">
                In browser
              </label>
            </div>
            <div className="form-check form-check-inline small mb-0">
              <input
                type="radio"
                className="form-check-input"
                id="export-server"
                checked={strategy === 'server'}
                onChange={() => setStrategy('server')}
              />
              <label className="form-check-label" htmlFor="export-server">
                On server
              </label>
            </div>
            {!browserSupported && (
              <div className="text-muted small mt-1">
                Your browser doesn't support WebCodecs.
              </div>
            )}
          </div>
        )}

        {exporting ? (
          <>
            <div
              className="progress mb-2"
              style={{ height: 8 }}
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div
                className="progress-bar bg-success"
                style={{
                  width: `${progress * 100}%`,
                  transition: 'width 200ms linear',
                }}
              />
            </div>
            <div className="d-flex justify-content-between align-items-center small">
              <span className="text-muted">
                {phaseLabel}{' '}
                <span className="font-monospace">
                  {Math.round(progress * 100)}%
                </span>
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-success w-100 fw-semibold"
            disabled={!canExport}
            onClick={handleExport}
          >
            Process and download
          </button>
        )}
        {error && (
          <div
            className="alert alert-danger py-1 px-2 mt-2 small mb-0"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
