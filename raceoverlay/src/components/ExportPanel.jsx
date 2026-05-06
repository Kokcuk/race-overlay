import { useState, useRef, useCallback } from 'react';

/**
 * Side-panel card for the server-side export.
 *
 * Shows a single button when idle. While running, displays a progress
 * bar reflecting backend-reported stage + percent and a Cancel button
 * that aborts the job server-side.
 */
export default function ExportPanel({ canExport, onExport }) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('rendering');
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const handleExport = useCallback(async () => {
    setError(null);
    setProgress(0);
    setStage('rendering');
    setExporting(true);
    cancelRef.current = false;
    try {
      await onExport({
        onProgress: (s) => {
          if (typeof s.progress === 'number') setProgress(s.progress);
          if (s.stage) setStage(s.stage);
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

  const stageLabel =
    stage === 'encoding'
      ? 'Encoding'
      : stage === 'rendering'
        ? 'Rendering widgets'
        : stage === 'queued'
          ? 'Queued'
          : 'Working';

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
                className="progress-bar bg-success"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="d-flex justify-content-between align-items-center small">
              <span className="text-muted">
                {stageLabel} ·{' '}
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
              Uploading video and rendering on the server. Don't close the tab.
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
