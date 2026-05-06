import { useRef, useCallback } from 'react';

/**
 * IDE-style "Files" panel.
 *
 * Two compact buttons add a video / a telemetry file. Below them, a
 * list of currently loaded files with per-row remove buttons and any
 * inline error messages.
 */
export default function FilesPanel({
  videoFileName,
  videoLoading,
  videoError,
  vboFileName,
  vboLoading,
  vboError,
  onAddVideo,
  onAddVbo,
  onRemoveVideo,
  onRemoveVbo,
}) {
  const videoInputRef = useRef(null);
  const vboInputRef = useRef(null);

  const handleVideoChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) onAddVideo(file);
      e.target.value = '';
    },
    [onAddVideo]
  );

  const handleVboChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) onAddVbo(file);
      e.target.value = '';
    },
    [onAddVbo]
  );

  const hasFiles = Boolean(videoFileName || vboFileName);

  return (
    <div className="card panel mb-3">
      <div className="card-header py-2 px-3 small fw-semibold">Files</div>
      <div className="card-body p-2">
        <div className="d-flex gap-2 mb-2">
          <button
            type="button"
            className="btn btn-sm btn-primary flex-fill fw-semibold"
            onClick={() => videoInputRef.current?.click()}
            disabled={videoLoading || Boolean(videoFileName)}
            title="Add video (.mp4)"
          >
            + Video <span className="opacity-75">(.mp4)</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary flex-fill fw-semibold"
            onClick={() => vboInputRef.current?.click()}
            disabled={vboLoading || Boolean(vboFileName)}
            title="Add telemetry (.vbo)"
          >
            + Telemetry <span className="opacity-75">(.vbo)</span>
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/*"
            onChange={handleVideoChange}
            className="d-none"
          />
          <input
            ref={vboInputRef}
            type="file"
            accept=".vbo,text/*"
            onChange={handleVboChange}
            className="d-none"
          />
        </div>

        {hasFiles ? (
          <ul className="list-group list-group-flush small panel-list">
            {videoFileName && (
              <FileRow
                badge="MP4"
                name={videoFileName}
                onRemove={onRemoveVideo}
                ariaLabel="Remove video"
              />
            )}
            {vboFileName && (
              <FileRow
                badge="VBO"
                name={vboFileName}
                onRemove={onRemoveVbo}
                ariaLabel="Remove telemetry"
              />
            )}
          </ul>
        ) : (
          <div className="text-muted fst-italic small px-1">No files yet.</div>
        )}

        {(videoLoading || vboLoading) && (
          <div className="small text-muted mt-2">Loading…</div>
        )}
        {videoError && (
          <div className="alert alert-danger py-1 px-2 mt-2 small mb-0" role="alert">
            {videoError}
          </div>
        )}
        {vboError && (
          <div className="alert alert-danger py-1 px-2 mt-2 small mb-0" role="alert">
            {vboError}
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({ badge, name, onRemove, ariaLabel }) {
  return (
    <li className="list-group-item d-flex justify-content-between align-items-center px-2 py-1">
      <span className="text-truncate me-2" title={name} style={{ minWidth: 0 }}>
        <span className="badge bg-secondary me-1 font-monospace">{badge}</span>
        {name}
      </span>
      <button
        type="button"
        className="btn-close"
        style={{ fontSize: '0.6rem' }}
        onClick={onRemove}
        aria-label={ariaLabel}
      />
    </li>
  );
}
