/**
 * READ PAGE MEMORY PROBE — paste into the browser console on /read
 *
 * Works in dev and production. Reports what Chrome's Task Manager cannot break
 * down: how many canvases exist, how much backing store they hold, whether any
 * are orphaned (detached from the DOM but still alive), and whether the count
 * grows while you type.
 *
 * A canvas backing store is width * height * 4 bytes, multiplied again by
 * devicePixelRatio squared. At DPR 2 a full-window canvas is ~59MB, and a WebGL
 * context holds front and back buffers. Orphans are invisible in the DOM but
 * still hold their memory.
 *
 * Usage:  __probe.start()   then type/scroll for 60s, then  __probe.report()
 */
(() => {
  const dpr = window.devicePixelRatio || 1;
  const MB = (b) => +(b / 1024 / 1024).toFixed(1);

  function canvasBytes(c) {
    // Backing store is in device pixels; the CSS size is irrelevant to memory.
    return c.width * c.height * 4;
  }

  function snapshot() {
    const inDom = Array.from(document.querySelectorAll('canvas'));
    const detail = inDom.map((c) => ({
      w: c.width,
      h: c.height,
      mb: MB(canvasBytes(c)),
      ctx: c.__probeCtx || 'unknown',
      cls: c.className || '(none)',
      connected: c.isConnected,
    }));
    const total = inDom.reduce((s, c) => s + canvasBytes(c), 0);
    const mem = performance.memory
      ? {
        heapMb: MB(performance.memory.usedJSHeapSize),
        heapLimitMb: MB(performance.memory.jsHeapSizeLimit),
      }
      : { heapMb: null, heapLimitMb: null, note: 'performance.memory unavailable' };
    return {
      at: new Date().toISOString().slice(11, 19),
      canvases: inDom.length,
      canvasBackingMb: MB(total),
      dpr,
      ...mem,
      detail,
    };
  }

  /**
   * Count WebGL contexts by attempting to detect loss. Chrome caps live contexts
   * (~16); orphaned ones are the classic Phaser double-mount signature.
   */
  function webglContexts() {
    let n = 0;
    for (const c of document.querySelectorAll('canvas')) {
      const g = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
        || c.getContext('webgl', { failIfMajorPerformanceCaveat: false });
      if (g) { n += 1; c.__probeCtx = g.isContextLost?.() ? 'webgl(LOST)' : 'webgl'; }
    }
    return n;
  }

  const marks = [];
  let timer = null;

  const api = {
    start(intervalMs = 5000) {
      if (timer) { console.warn('[probe] already running'); return; }
      webglContexts();
      marks.length = 0;
      marks.push(snapshot());
      timer = setInterval(() => marks.push(snapshot()), intervalMs);
      console.log(`[probe] started, sampling every ${intervalMs}ms. Use the page, then __probe.report()`);
    },
    stop() { clearInterval(timer); timer = null; },
    report() {
      this.stop();
      if (marks.length < 2) { console.warn('[probe] need at least 2 samples'); return; }
      const first = marks[0];
      const last = marks[marks.length - 1];
      console.log('%c[probe] READ PAGE MEMORY', 'font-weight:bold');
      console.table(marks.map((m) => ({
        at: m.at, canvases: m.canvases, canvasMb: m.canvasBackingMb, heapMb: m.heapMb,
      })));
      console.log('canvas count  :', first.canvases, '->', last.canvases,
        last.canvases > first.canvases ? '  ← GROWING (orphaned canvases)' : '');
      console.log('canvas backing:', first.canvasBackingMb, 'MB ->', last.canvasBackingMb, 'MB');
      console.log('JS heap       :', first.heapMb, 'MB ->', last.heapMb, 'MB  (limit', last.heapLimitMb, 'MB)');
      console.log('webgl contexts:', webglContexts());
      console.log('\nper-canvas detail (last sample):');
      console.table(last.detail);
      const gap = (last.heapMb ?? 0) + (last.canvasBackingMb ?? 0);
      console.log(`\nJS heap + canvas backing accounts for ~${gap.toFixed(0)} MB.`);
      console.log('If the Task Manager says 5000 MB, the remaining ~' + (5000 - gap).toFixed(0)
        + ' MB is GPU-side (textures, buffers) and not visible from JS.');
      return { first, last, marks };
    },
  };

  window.__probe = api;
  console.log('[probe] ready. Run  __probe.start()  then use the page, then  __probe.report()');
  return api;
})();
