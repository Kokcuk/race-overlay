import { DISPLAY_OBJECTS } from '../displayObjects/registry.js';

/**
 * IDE-style "Display Objects" panel.
 *
 * Shows every registered Display Object as a clickable row. Two top
 * buttons:
 *   - Add (filled primary): enabled when a row is selected and that
 *     object is *not* yet in the scene.
 *   - Remove (filled danger): enabled when a row is selected and the
 *     object *is* in the scene.
 *
 * Selection is two-way: clicking a row selects the corresponding widget
 * on the video; clicking a widget on the video selects its row here.
 */
export default function DisplayObjectsPanel({
  scene,
  selectedId,
  onSelect,
  onAdd,
  onRemove,
}) {
  const inScene = (id) => scene.some((s) => s.id === id);
  const canAdd = Boolean(selectedId) && !inScene(selectedId);
  const canRemove = Boolean(selectedId) && inScene(selectedId);

  return (
    <div className="card panel">
      <div className="card-header py-2 px-3 small fw-semibold">
        Display Objects
      </div>
      <div className="card-body p-2">
        <div className="d-flex gap-2 mb-2">
          <button
            type="button"
            className="btn btn-sm btn-primary flex-fill fw-semibold"
            disabled={!canAdd}
            onClick={() => onAdd(selectedId)}
          >
            Add
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger flex-fill fw-semibold"
            disabled={!canRemove}
            onClick={() => onRemove(selectedId)}
          >
            Remove
          </button>
        </div>

        <ul className="list-group small panel-list">
          {DISPLAY_OBJECTS.map((obj) => {
            const here = inScene(obj.id);
            const active = obj.id === selectedId;
            return (
              <li
                key={obj.id}
                className={`list-group-item list-group-item-action px-2 py-1 ${
                  active ? 'active' : ''
                } ${here ? '' : 'text-muted'}`}
                onClick={() => onSelect(obj.id)}
                style={{ cursor: 'pointer' }}
              >
                <span className="text-truncate">{obj.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
