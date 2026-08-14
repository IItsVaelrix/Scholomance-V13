/**
 * CANVAS / WEBGL LEAK PROBE — paste into the console BEFORE navigating
 *
 * The earlier probe counted document.querySelectorAll('canvas'), which only
 * finds ATTACHED canvases. A Phaser canvas detached from the DOM but still
 * referenced — by a listener, a registry, a closure — keeps its WebGL context
 * and every texture atlas alive, and is completely invisible to that query.
 * That is the documented failure mode on this codebase twice over
 * (Combat Phaser DOM Leak, Phaser StrictMode Orphan Canvas).
 *
 * This hooks canvas creation and context acquisition, holds only WeakRefs, and
 * uses FinalizationRegistry to report which canvases were actually collected.
 * A canvas that stays uncollected after navigating away is the leak.
 *
 * USAGE
 *   1. Paste on the Read page (or anywhere) BEFORE navigating
 *   2. __canvasProbe.mark('read')
 *   3. Navigate to Combat, let it load, navigate back
 *   4. __canvasProbe.report()      // forces GC pressure, then reports
 */
(() => {
  const created = [];            // { id, ref, at, w, h, ctxType, stack, mark }
  const collected = new Set();
  let currentMark = 'init';
  let idc = 0;

  const registry = new FinalizationRegistry((id) => collected.add(id));

  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function createElement(tag, ...rest) {
    const el = origCreate.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') {
      const id = ++idc;
      const rec = {
        id,
        ref: new WeakRef(el),
        at: performance.now(),
        mark: currentMark,
        ctxType: null,
        // Where it was made. Trimmed: full traces are unreadable in bulk.
        stack: (new Error().stack || '').split('\n').slice(2, 5).join(' | ').slice(0, 220),
      };
      created.push(rec);
      registry.register(el, id);
      el.__probeId = id;
    }
    return el;
  };

  const origGetCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
    const ctx = origGetCtx.call(this, type, ...rest);
    const rec = created.find((r) => r.id === this.__probeId);
    if (rec && ctx && !rec.ctxType) rec.ctxType = type;
    return ctx;
  };

  const MB = (b) => +(b / 1024 / 1024).toFixed(1);

  window.__canvasProbe = {
    mark(label) { currentMark = String(label); console.log(`[canvas-probe] mark → ${currentMark}`); },

    async report() {
      // Give the collector every chance before accusing anything of leaking.
      for (let i = 0; i < 6; i += 1) {
        const junk = [];
        for (let j = 0; j < 60; j += 1) junk.push(new ArrayBuffer(1024 * 1024));
        junk.length = 0;
        await new Promise((r) => setTimeout(r, 260));
      }

      const rows = created.map((r) => {
        const el = r.ref.deref();
        const alive = !!el;
        const attached = alive && el.isConnected;
        const bytes = alive ? el.width * el.height * 4 : 0;
        return {
          id: r.id,
          mark: r.mark,
          state: !alive ? 'collected' : attached ? 'ALIVE + attached' : 'ALIVE + DETACHED',
          ctx: r.ctxType || '-',
          size: alive ? `${el.width}x${el.height}` : '-',
          mb: alive ? MB(bytes) : 0,
          origin: r.stack,
        };
      });

      const leaked = rows.filter((r) => r.state === 'ALIVE + DETACHED');
      const totalLeakedMb = leaked.reduce((s, r) => s + r.mb, 0);

      console.log('%c[canvas-probe] REPORT', 'font-weight:bold');
      console.log(`canvases created: ${created.length}   collected: ${collected.size}`);
      console.table(rows);

      if (leaked.length) {
        console.log(
          `%cLEAK: ${leaked.length} canvas(es) still alive but DETACHED, `
          + `${totalLeakedMb.toFixed(1)} MB of backing store`,
          'color:#c0392b;font-weight:bold',
        );
        console.log('A detached WebGL canvas also retains its texture atlases, which are '
          + 'GPU-side and NOT counted in the MB above — the real cost is larger.');
        console.table(leaked.map((r) => ({ id: r.id, mark: r.mark, ctx: r.ctx, mb: r.mb, origin: r.origin })));
      } else {
        console.log('%cNo detached-but-alive canvases. Canvas lifecycle is clean.', 'color:#27ae60');
      }
      return { rows, leaked };
    },

    restore() {
      Document.prototype.createElement = origCreate;
      HTMLCanvasElement.prototype.getContext = origGetCtx;
      console.log('[canvas-probe] hooks removed');
    },
  };

  console.log('[canvas-probe] armed. mark() before navigating, report() after coming back.');
})();
