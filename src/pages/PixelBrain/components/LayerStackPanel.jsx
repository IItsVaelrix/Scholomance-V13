/**
 * LAYER STACK PANEL
 * System 2: Full layer stack UI (visible, locked, opacity, reorder, canonical layers, flatten preview).
 * Consumes adapter only.
 */
import React, { useState } from 'react';
import {
  setLayerVisible,
  setLayerLocked,
  setLayerOpacity,
  reorderLayers,
  getFlattenedPreviewCells,
  createLayer,
} from '../../../lib/pixelbrain.adapter.js';

export function LayerStackPanel({
  grid,
  onGridUpdate,           // callback(grid) after mutation
  onActiveLayerChange,    // callback(layerIndex)
  activeLayerIndex = 0,
  onCommitPreview,        // optional: commit flattened preview as new layer
} = {}) {
  const [isFlattening, setIsFlattening] = useState(false);

  if (!grid || !grid.layers) {
    return <div className="layer-panel">No layers</div>;
  }

  const layers = grid.layers;
  const current = activeLayerIndex;

  const updateLayer = (index, mutator) => {
    mutator(layers[index]);
    if (onGridUpdate) onGridUpdate(grid);
  };

  const handleVisibility = (index) => {
    const layer = layers[index];
    setLayerVisible(grid, index, !layer.visible);
    if (onGridUpdate) onGridUpdate(grid);
  };

  const handleLock = (index) => {
    const layer = layers[index];
    setLayerLocked(grid, index, !layer.locked);
    if (onGridUpdate) onGridUpdate(grid);
  };

  const handleOpacity = (index, value) => {
    setLayerOpacity(grid, index, parseFloat(value));
    if (onGridUpdate) onGridUpdate(grid);
  };

  const moveLayer = (from, to) => {
    reorderLayers(grid, from, to);
    if (onGridUpdate) onGridUpdate(grid);
    if (onActiveLayerChange) {
      const newActive = from === current ? to : (to === current ? from : current);
      onActiveLayerChange(Math.max(0, Math.min(grid.layers.length - 1, newActive)));
    }
  };

  const addLayer = () => {
    const newL = createLayer(`Layer ${layers.length}`);
    grid.layers.push(newL);
    if (onGridUpdate) onGridUpdate(grid);
  };

  const flattenPreview = () => {
    setIsFlattening(true);
    try {
      const flatCells = getFlattenedPreviewCells(grid);
      if (onCommitPreview) {
        onCommitPreview(flatCells);
      } else {
        // Fallback: add as new "Flattened" layer
        const flatLayer = createLayer('Flattened Preview');
        flatCells.forEach((cell, key) => {
          const [x, y] = key.split(',').map(Number);
          flatLayer.cells.set(key, cell);
        });
        grid.layers.push(flatLayer);
        if (onGridUpdate) onGridUpdate(grid);
      }
    } finally {
      setIsFlattening(false);
    }
  };

  return (
    <div className="layer-stack-panel" style={{ border: '1px solid #444', padding: 8, background: '#1a1a2e', color: '#ddd', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>LAYERS</strong>
        <button onClick={addLayer} title="Add layer" style={{ fontSize: 11 }}>+ Layer</button>
        <button onClick={flattenPreview} disabled={isFlattening} title="Flatten preview (non-destructive)" style={{ fontSize: 11 }}>
          {isFlattening ? '...' : 'Flatten ▶'}
        </button>
      </div>

      {layers.map((layer, idx) => {
        const isActive = idx === current;
        const isRef = layer.type === 'reference';
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 4px',
              background: isActive ? '#2a3a5e' : 'transparent',
              border: isRef ? '1px dashed #4a9' : '1px solid transparent',
              marginBottom: 2,
              opacity: layer.visible ? 1 : 0.6,
            }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handleVisibility(idx); }}
              title={layer.visible ? 'Hide' : 'Show'}
              style={{ width: 18, fontSize: 10 }}
            >
              {layer.visible ? '👁' : '🚫'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleLock(idx); }}
              title={layer.locked ? 'Unlock' : 'Lock'}
              style={{ width: 18, fontSize: 10 }}
            >
              {layer.locked ? '🔒' : '🔓'}
            </button>

            <input
              type="range"
              min="0" max="1" step="0.05"
              value={layer.opacity}
              onChange={(e) => { e.stopPropagation(); handleOpacity(idx, e.target.value); }}
              style={{ width: 50 }}
              title={`Opacity ${Math.round(layer.opacity * 100)}%`}
              aria-label={`${layer.name} opacity ${Math.round(layer.opacity * 100)} percent`}
            />

            <button
              type="button"
              aria-pressed={isActive}
              onClick={(e) => { e.stopPropagation(); onActiveLayerChange && onActiveLayerChange(idx); }}
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
            >
              {layer.name} {isRef && '(REF)'}
            </button>

            {idx > 0 && (
              <button onClick={(e) => { e.stopPropagation(); moveLayer(idx, idx - 1); }} title="Move up">↑</button>
            )}
            {idx < layers.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); moveLayer(idx, idx + 1); }} title="Move down">↓</button>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 10, marginTop: 4, color: '#888' }}>
        {layers.length} layer(s) • Click to activate • Use AMP panel for post-processing
      </div>
    </div>
  );
}
