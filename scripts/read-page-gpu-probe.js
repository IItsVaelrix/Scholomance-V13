/**
 * READ PAGE GPU-COST PROBE — paste into the console on /read
 *
 * The first probe established that JS heap + canvas backing account for only
 * ~136 MB of a ~5000 MB tab, with one canvas and one WebGL context. So the rest
 * is compositor-side: GPU textures for layers, filters and backdrop blurs,
 * which are invisible to JS memory APIs.
 *
 * A CSS rule is not a cost. An APPLIED rule on a large element is. This walks
 * the live DOM, resolves computed styles, and ranks what is actually demanding
 * GPU texture memory right now.
 *
 * Texture demand is approximately  width * height * 4 * dpr^2  per surface, and
 * backdrop-filter needs the backdrop snapshot PLUS blur ping-pong buffers, so it
 * is counted at roughly 3x a plain layer.
 */
(() => {
  const dpr = window.devicePixelRatio || 1;
  const MB = (b) => +(b / 1024 / 1024).toFixed(1);
  const px = dpr * dpr * 4;

  const buckets = {
    'backdrop-filter': { els: [], mult: 3 },
    filter: { els: [], mult: 2 },
    'will-change': { els: [], mult: 1 },
    transform3d: { els: [], mult: 1 },
    opacity: { els: [], mult: 1 },
  };

  let scanned = 0;
  for (const el of document.querySelectorAll('*')) {
    scanned += 1;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const area = r.width * r.height;

    if (cs.backdropFilter && cs.backdropFilter !== 'none') {
      buckets['backdrop-filter'].els.push({ el, area, v: cs.backdropFilter });
    }
    if (cs.filter && cs.filter !== 'none') {
      buckets.filter.els.push({ el, area, v: cs.filter });
    }
    if (cs.willChange && cs.willChange !== 'auto') {
      buckets['will-change'].els.push({ el, area, v: cs.willChange });
    }
    const t = cs.transform;
    if (t && t !== 'none' && (t.includes('matrix3d') || cs.perspective !== 'none')) {
      buckets.transform3d.els.push({ el, area, v: t.slice(0, 40) });
    }
    const o = parseFloat(cs.opacity);
    if (o > 0 && o < 1) buckets.opacity.els.push({ el, area, v: cs.opacity });
  }

  const rows = [];
  let grand = 0;
  for (const [name, b] of Object.entries(buckets)) {
    const bytes = b.els.reduce((s, e) => s + e.area * px * b.mult, 0);
    grand += bytes;
    rows.push({
      property: name,
      elements: b.els.length,
      'est. GPU MB': MB(bytes),
      'largest element MB': b.els.length
        ? MB(Math.max(...b.els.map((e) => e.area * px * b.mult)))
        : 0,
    });
  }

  console.log('%c[gpu-probe] APPLIED COMPOSITOR COST', 'font-weight:bold');
  console.log(`scanned ${scanned} elements, dpr ${dpr}`);
  console.table(rows.sort((a, b) => b['est. GPU MB'] - a['est. GPU MB']));
  console.log(`estimated total GPU texture demand: ~${MB(grand)} MB`);

  // The worst offenders, individually — these are what to fix first.
  const all = [];
  for (const [name, b] of Object.entries(buckets)) {
    for (const e of b.els) all.push({
      property: name,
      mb: MB(e.area * px * b.mult),
      w: Math.round(e.el.getBoundingClientRect().width),
      h: Math.round(e.el.getBoundingClientRect().height),
      tag: e.el.tagName.toLowerCase(),
      cls: (e.el.className || '').toString().slice(0, 44) || '(none)',
      value: String(e.v).slice(0, 34),
    });
  }
  console.log('\ntop 15 individual surfaces:');
  console.table(all.sort((a, b) => b.mb - a.mb).slice(0, 15));

  // Element-count sanity: a per-token editor can promote thousands of spans.
  console.log('\nDOM size:', scanned, 'elements');
  const spans = document.querySelectorAll('span').length;
  console.log('span count:', spans, spans > 5000 ? '  ← very high; per-token rendering' : '');

  return { rows, all };
})();
