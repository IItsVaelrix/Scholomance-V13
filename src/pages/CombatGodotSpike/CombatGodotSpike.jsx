import { useCallback, useEffect, useRef, useState } from 'react';
import './CombatGodotSpike.css';

/**
 * CombatGodotSpike.jsx - DISPOSABLE DE-RISK SPIKE (dev-only route).
 *
 * Governed by:
 *   docs/scholomance-encyclopedia/PDR-archive/PDR-2026-06-04-GODOT-WASM-COMBAT-SPIKE.md
 *   docs/scholomance-encyclopedia/PDR-archive/PDR-2026-06-04-GODOT-WASM-COMBAT-SPIKE-SPEC.md
 *
 * Purpose: answer three kill-questions before ANY rewrite of the real Combat page  -
 *   Q1 bundle/load · Q2 postMessage bridge · Q3 verse text input.
 *
 * ISOLATION CONTRACT (Phase 1): imports NOTHING from src/pages/Combat/**,
 * combatBridge.js, or src/lib/godot-export/**. The Godot Web export is loaded
 * as a static asset from /godot-spike/index.html once Phase 2 produces it.
 * Throw this whole folder away if the spike says "abandon".
 */

// Where the Phase 2 Godot HTML5/WASM export is expected to live (static asset).
const GODOT_EXPORT_URL = '/godot-spike/index.html';

export default function CombatGodotSpike() {
  const iframeRef = useRef(null);
  const loadStartRef = useRef(0);

  const [exportPresent, setExportPresent] = useState(null); // null = checking
  const [loadMs, setLoadMs] = useState(null);
  const [bridgeLog, setBridgeLog] = useState([]);
  const [castSeq, setCastSeq] = useState(0);

  const log = useCallback((dir, msg) => {
    setBridgeLog((prev) => [
      { t: Math.round(performance.now()), dir, msg },
      ...prev,
    ].slice(0, 50));
  }, []);

  // Phase 2 probe: is the Godot export actually on disk yet?
  useEffect(() => {
    let cancelled = false;
    fetch(GODOT_EXPORT_URL, { method: 'HEAD' })
      .then((res) => { if (!cancelled) setExportPresent(res.ok); })
      .catch(() => { if (!cancelled) setExportPresent(false); });
    return () => { cancelled = true; };
  }, []);

  // Kill-Q2: listen for messages coming BACK from the Godot iframe.
  useEffect(() => {
    const onMessage = (event) => {
      // Same-origin only - the export is served from our own static dir.
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = typeof event.data === 'object' ? event.data : { raw: event.data };
      log('godot→react', JSON.stringify(data));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [log]);

  const handleIframeLoad = useCallback(() => {
    if (loadStartRef.current) {
      setLoadMs(Math.round(performance.now() - loadStartRef.current));
    }
  }, []);

  // Kill-Q2: fire a stub "cast" round-trip into the engine.
  const sendCast = useCallback(() => {
    const seq = castSeq + 1;
    setCastSeq(seq);
    const payload = { type: 'cast', seq, school: 'VOID', target: { x: 2, y: 2 } };
    iframeRef.current?.contentWindow?.postMessage(payload, '*');
    log('react→godot', JSON.stringify(payload));
  }, [castSeq, log]);

  // Kick the load timer the moment we decide to mount the iframe.
  useEffect(() => {
    if (exportPresent) loadStartRef.current = performance.now();
  }, [exportPresent]);

  return (
    <div className="godot-spike-root">
      <div className="godot-spike-banner" role="note">
        ⚠ DEV SPIKE · Godot WASM Combat de-risk · not shipped · see PDR-2026-06-04-GODOT-WASM-COMBAT-SPIKE
      </div>

      <div className="godot-spike-stage">
        {exportPresent === null && (
          <div className="godot-spike-placeholder">Checking for Godot export...</div>
        )}

        {exportPresent === false && (
          <div className="godot-spike-placeholder">
            <strong>No Godot Web export present yet.</strong>
            <p>
              Phase 2 pending: export <code>godot_project</code> to HTML5/WASM into{' '}
              <code>public/godot-spike/</code> so <code>{GODOT_EXPORT_URL}</code> resolves.
            </p>
            <p className="godot-spike-dim">
              The bridge + instrumentation panel below are live and ready for it.
            </p>
          </div>
        )}

        {exportPresent === true && (
          <iframe
            ref={iframeRef}
            className="godot-spike-iframe"
            src={GODOT_EXPORT_URL}
            title="Godot WASM Combat spike"
            onLoad={handleIframeLoad}
          />
        )}
      </div>

      <aside className="godot-spike-instruments" aria-label="Spike instrumentation">
        <div className="godot-spike-metric">
          <span className="godot-spike-metric-label">Kill-Q1 · cold load</span>
          <span className="godot-spike-metric-value">
            {loadMs == null ? ' - ' : `${loadMs} ms`}
          </span>
        </div>

        <div className="godot-spike-bridge">
          <div className="godot-spike-bridge-head">
            <span>Kill-Q2 · postMessage bridge</span>
            <button
              type="button"
              className="godot-spike-cast-btn"
              onClick={sendCast}
              disabled={exportPresent !== true}
            >
              Send stub cast →
            </button>
          </div>
          <ul className="godot-spike-log">
            {bridgeLog.length === 0 && (
              <li className="godot-spike-dim">no bridge traffic yet</li>
            )}
            {bridgeLog.map((entry, i) => (
              <li key={`${entry.t}-${i}`} className={`godot-spike-log-${entry.dir.includes('react→') ? 'out' : 'in'}`}>
                <span className="godot-spike-log-t">{entry.t}</span>
                <span className="godot-spike-log-dir">{entry.dir}</span>
                <span className="godot-spike-log-msg">{entry.msg}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
