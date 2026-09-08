import { Copy, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from "lucide-react";

type Layer = {
  name: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  protected?: boolean;
  cells?: unknown[];
};

type LayerDockProps = {
  layers: Layer[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onVisibility: (index: number) => void;
  onLock: (index: number) => void;
  onOpacity: (index: number, value: number) => void;
  onRename: (index: number, name: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (from: number, to: number) => void;
  onFlatten: () => void;
};

function stopRowSelect(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function LayerDock({
  layers,
  activeIndex,
  onSelect,
  onVisibility,
  onLock,
  onOpacity,
  onRename,
  onCreate,
  onDuplicate,
  onDelete,
  onReorder,
  onFlatten,
}: LayerDockProps) {
  return (
    <section className="pbs-dock" aria-label="Layers">
      <header>
        <h3>Layers</h3>
        <div>
          <button type="button" className="pbs-icon-button" aria-label="New layer" title="New layer" onClick={onCreate}>
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="pbs-icon-button"
            aria-label="Duplicate layer"
            title="Duplicate layer"
            onClick={onDuplicate}
          >
            <Copy size={14} />
          </button>
        </div>
      </header>
      <ol>
        {[...layers].map((_layer, visualIndex) => {
          const index = layers.length - 1 - visualIndex;
          const item = layers[index];
          const hidden = item.visible === false;
          const locked = item.locked === true;
          const selected = index === activeIndex;
          const classes = [
            selected ? "is-active" : "",
            locked ? "is-locked" : "",
            hidden ? "is-hidden" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={`${item.name}-${index}`}
              className={classes}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(index)}
            >
              <button
                type="button"
                className="pbs-icon-button"
                aria-label={hidden ? `Show ${item.name}` : `Hide ${item.name}`}
                title={hidden ? `Show ${item.name}` : `Hide ${item.name}`}
                aria-pressed={hidden}
                onClick={(event) => {
                  stopRowSelect(event);
                  onVisibility(index);
                }}
              >
                {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                type="button"
                className="pbs-icon-button"
                aria-label={locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
                title={locked ? `Unlock ${item.name}` : `Lock ${item.name}`}
                aria-pressed={locked}
                onClick={(event) => {
                  stopRowSelect(event);
                  onLock(index);
                }}
              >
                {locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <div className="pbs-layer-meta">
                <span className="sr-only">{item.name}</span>
                <input
                  type="text"
                  aria-label={`Rename ${item.name}`}
                  value={item.name}
                  onClick={stopRowSelect}
                  onFocus={() => onSelect(index)}
                  onChange={(event) => onRename(index, event.target.value)}
                />
                <span className="pbs-layer-flags">
                  {selected ? <span>Active</span> : null}
                  {locked ? <span>Locked</span> : null}
                  {hidden ? <span>Hidden</span> : null}
                </span>
              </div>
              <button
                type="button"
                className="pbs-icon-button"
                aria-label={`Move ${item.name} up`}
                title={`Move ${item.name} up`}
                disabled={index >= layers.length - 1}
                onClick={(event) => {
                  stopRowSelect(event);
                  onReorder(index, index + 1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="pbs-icon-button"
                aria-label={`Move ${item.name} down`}
                title={`Move ${item.name} down`}
                disabled={index <= 0}
                onClick={(event) => {
                  stopRowSelect(event);
                  onReorder(index, index - 1);
                }}
              >
                ↓
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                aria-label={`${item.name} opacity`}
                value={item.opacity ?? 1}
                onClick={stopRowSelect}
                onPointerDown={stopRowSelect}
                onChange={(event) => onOpacity(index, Number(event.target.value))}
              />
            </li>
          );
        })}
      </ol>
      <div className="pbs-dock-actions">
        <button type="button" className="pbs-button is-danger" onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" />
          Delete
        </button>
        <button type="button" className="pbs-button" onClick={onFlatten}>
          Flatten
        </button>
      </div>
    </section>
  );
}
