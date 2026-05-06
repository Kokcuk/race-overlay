import { useState, useRef, useCallback } from 'react';

/**
 * Side-panel card for the server-side export.
 *
 * Three phases shown via the same progress bar:
 *   1. Uploading (bar tracks XHR upload bytes)
 *   2. Processing (bar tracks server-reported render/encode progress)
 *   3. Downloading (bar tracks Content-Length-based blob streaming)
 */
export default function ExportPanel({ canExport, onExport }) {
  const [exporting, setExporting] = useState(false);
  const [phase, setPhase] = useState('uploading');
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const handleExport = useCallback(async () => {
    setError(null);
    setProgress(0);
    setPhase('uploading');
    setStage(null);
    setExporting(true);
    cancelRef.current = false;
    try {
      await onExport({
        onProgress: (s) => {
          if (s.phase) setPhase(s.phase);
          if (typeof s.progress === 'number') setProgress(s.progress);
          setStage(s.stage ?? null);
        },
        shouldCancel: () => cancelRef.current,
      });
    } catch (e) {
      setError(e?.message || 'Export failed.');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [onExport]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const phaseLabel = describePhase(phase, stage);
  const barColor =
    phase === 'uploading'
      ? 'bg-info'
      : phase === 'downloading'
        ? 'bg-primary'
        : 'bg-success';

  return (
    <div className="card panel mt-3">
      <div className="card-header py-2 px-3 small fw-semibold">Export</div>
      <div className="card-body p-2">
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
                className={`progress-bar ${barColor}`}
                style={{ width: `${progress * 100}%`, transition: 'width 200ms linear' }}
              />
            </div>
            <div className="d-flex justify-content-between align-items-center small">
              <span className="text-muted">
                {phaseLabel} ·{' '}
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
            <div className="small text-muted mt-2">
              {phase === 'uploading'
                ? "Sending video to the server."
                : phase === 'processing'
                  ? "Server is compositing widgets and encoding."
                  : 'Fetching the result.'}{' '}
              Don't close the tab.
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-sm btn-success w-100 fw-semibold"
              disabled={!canExport}
              onClick={handleExport}
            >
              Export to MP4
            </button>
            <div className="text-muted small mt-2">
              Uploads the video to the server, composites widgets with
              ffmpeg, and downloads the resulting MP4.
            </div>
          </>
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

function describePhase(phase, stage) {
  if (phase === 'uploading') return 'Uploading';
  if (phase === 'downloading') return 'Downloading';
  if (phase === 'processing') {
    if (stage === 'encoding') return 'Encoding';
    if (stage === 'rendering') return 'Rendering widgets';
    return 'Processing';
  }
  return 'Working';
}
