/**
 * SCHOLOMANCE FAIRLY ODD WAND — BUILT-IN ROLE DRAWERS
 * 
 * Standard high-acuity drawing callbacks registered to the role dispatcher.
 * Leverages Canvas2D gradients, shadows, and paths to create the ultimate premium grimoire look.
 */

import { roleDispatcher, RoleCoordinate } from './roleDispatcher';

/**
 * Registers all core scholastic visual drawers into the role dispatcher.
 */
export function registerBuiltInDrawers(): void {
  roleDispatcher.clearRegistry();

  // 1. SHRINE WINDOW DRAWER ( Cathedral Stained Glass - Background )
  roleDispatcher.registerRoleDrawer({
    role: 'shrine.window',
    depth: 5,
    draw: (ctx, coords, canvasSize) => {
      if (coords.length === 0) return;

      // Group into paths or sort coordinates by X to draw structural arches
      const sorted = [...coords].sort((a, b) => a.x - b.x);
      
      // Draw stained-glass panes
      ctx.save();
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(235, 94, 40, 0.35)'; // Warm Alchemic orange glow

      // Draw light shafts
      const grad = ctx.createLinearGradient(canvasSize.width / 2, 0, canvasSize.width / 2, canvasSize.height);
      grad.addColorStop(0, 'rgba(235, 94, 40, 0.15)');
      grad.addColorStop(0.5, 'rgba(235, 94, 40, 0.05)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(canvasSize.width * 0.2, 0);
      ctx.lineTo(canvasSize.width * 0.8, 0);
      ctx.lineTo(canvasSize.width * 0.9, canvasSize.height);
      ctx.lineTo(canvasSize.width * 0.1, canvasSize.height);
      ctx.closePath();
      ctx.fill();

      // Draw window pane boundaries
      ctx.strokeStyle = 'rgba(235, 94, 40, 0.7)';
      ctx.fillStyle = 'rgba(235, 94, 40, 0.12)';
      ctx.beginPath();
      sorted.forEach((c, idx) => {
        if (idx === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  });

  // 2. CELESTIAL MOON DRAWER ( Arcane Lunar Halos )
  roleDispatcher.registerRoleDrawer({
    role: 'shrine.moon',
    depth: 1,
    draw: (ctx, coords, canvasSize) => {
      if (coords.length === 0) return;

      // Draw moon crescent or disk using coordinates as a cluster guide
      const centerX = coords.reduce((sum, c) => sum + c.x, 0) / coords.length;
      const centerY = coords.reduce((sum, c) => sum + c.y, 0) / coords.length;
      const radius = Math.max(30, coords.length * 0.6);

      ctx.save();
      
      // Outer lunar glow rings
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + i * 14, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 175, 55, ${0.03 / i})`; // Soft gold radial aura
        ctx.fill();
      }

      // Moon body
      const moonGrad = ctx.createRadialGradient(centerX - radius / 3, centerY - radius / 3, 2, centerX, centerY, radius);
      moonGrad.addColorStop(0, '#ffffff');
      moonGrad.addColorStop(0.3, '#f9f5d7');
      moonGrad.addColorStop(1, '#d4af37'); // Gold edge

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = moonGrad;
      ctx.shadowBlur = 30;
      ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
      ctx.fill();

      // Lunar shadow overlap (creating crescent)
      ctx.beginPath();
      ctx.arc(centerX + radius * 0.35, centerY - radius * 0.15, radius * 0.95, 0, Math.PI * 2);
      ctx.fillStyle = '#05050c'; // Deep background absorption
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fill();

      ctx.restore();
    }
  });

  // 3. SHRINE CABINET DRAWER ( Grid Structures & Shelves )
  roleDispatcher.registerRoleDrawer({
    role: 'shrine.cabinet',
    depth: 20,
    draw: (ctx, coords, canvasSize) => {
      if (coords.length === 0) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(115, 128, 142, 0.45)'; // Slate steel cabinet outline
      ctx.lineWidth = 1.5;

      // Group coordinates into rows based on similar Y positions
      const tolerance = 15;
      const rows: Map<number, RoleCoordinate[]> = new Map();

      coords.forEach(c => {
        let matchedY = Array.from(rows.keys()).find(y => Math.abs(y - c.y) < tolerance);
        if (matchedY === undefined) {
          matchedY = c.y;
          rows.set(matchedY, []);
        }
        rows.get(matchedY)!.push(c);
      });

      // Draw shelf structures
      rows.forEach((rowCoords, yVal) => {
        rowCoords.sort((a, b) => a.x - b.x);
        if (rowCoords.length > 1) {
          ctx.beginPath();
          ctx.moveTo(rowCoords[0].x, yVal);
          ctx.lineTo(rowCoords[rowCoords.length - 1].x, yVal);
          ctx.stroke();

          // Draw little vertical separators or shelf brackets
          rowCoords.forEach(c => {
            if (c.emphasis && c.emphasis > 0.75) {
              ctx.fillStyle = 'rgba(212, 175, 55, 0.8)';
              ctx.fillRect(c.x - 2, c.y - 6, 4, 12);
            }
          });
        }
      });

      ctx.restore();
    }
  });

  // 4. SHRINE ALTAR DRAWER ( Monolithic Foundations )
  roleDispatcher.registerRoleDrawer({
    role: 'shrine.altar',
    depth: 10,
    draw: (ctx, coords, canvasSize) => {
      if (coords.length === 0) return;

      // Find bounding box representing the altar coordinates
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      coords.forEach(c => {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      });

      // Apply default dimension cushions if narrow
      if (maxX - minX < 20) { minX -= 60; maxX += 60; }
      if (maxY - minY < 10) { minY -= 10; maxY += 30; }

      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';

      // Draw altar slab gradient (ancient stone block)
      const stoneGrad = ctx.createLinearGradient(minX, minY, minX, maxY);
      stoneGrad.addColorStop(0, '#2d3748'); // Rich gray
      stoneGrad.addColorStop(1, '#1a202c'); // Deep slate

      ctx.fillStyle = stoneGrad;
      ctx.strokeStyle = '#d4af37'; // Pure gold inlay borders
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.rect(minX, minY, maxX - minX, maxY - minY);
      ctx.fill();
      ctx.stroke();

      // Draw inner ornamental lines for that "crafted" luxury look
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX + 6, minY + 6, maxX - minX - 12, maxY - minY - 12);

      // Draw glowing runes on the altar face using original points
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      coords.forEach((c, idx) => {
        if (idx % 3 === 0) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.restore();
    }
  });

  // 5. SIGIL CAPSULE DRAWER ( Concentric Sigil Orbs )
  roleDispatcher.registerRoleDrawer({
    role: 'sigil.capsule',
    depth: 50,
    draw: (ctx, coords, canvasSize) => {
      if (coords.length === 0) return;

      ctx.save();
      ctx.lineWidth = 1.5;
      
      // Determine center and scale from bounding coordinates
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      coords.forEach(c => {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      });

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radius = Math.max(30, (maxX - minX) / 2);

      // Multi-layered glowing protective sigil
      const colors = ['rgba(0, 245, 255, ', 'rgba(212, 175, 55, ']; // Cyan and Gold
      
      // Outer ring
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `${colors[0]}0.6)`;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0, 245, 255, 0.5)';
      ctx.stroke();

      // Middle ring (dashed/rune ticks)
      ctx.beginPath();
      ctx.setLineDash([4, 8, 12, 8]);
      ctx.arc(centerX, centerY, radius * 0.75, 0, Math.PI * 2);
      ctx.strokeStyle = `${colors[1]}0.85)`;
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(212, 175, 55, 0.7)';
      ctx.stroke();
      ctx.setLineDash([]); // Reset

      // Inner glowing core
      const coreGrad = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, radius * 0.4);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, 'rgba(0, 245, 255, 0.3)');
      coreGrad.addColorStop(1, 'rgba(0, 245, 255, 0)');
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Draw actual coordinate particles on top to show mathematical structure
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';
      coords.forEach(c => {
        ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
      });

      ctx.restore();
    }
  });

  // 6. TEXT VECTOR DRAWER ( Arcane Alphanumeric Neon Ink )
  roleDispatcher.registerRoleDrawer({
    role: 'text.vector',
    depth: 30,
    draw: (ctx, coords, canvasSize) => {
      if (coords.length === 0) return;

      ctx.save();

      // 1. Draw connecting vector strokes between sequential coordinates of the same letter/stroke segment
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.4)';
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(0, 245, 255, 0.6)';

      ctx.beginPath();
      for (let i = 0; i < coords.length; i++) {
        const curr = coords[i];
        const next = coords[i + 1];

        // Ensure we are connecting sequential points within the same character and stroke segment
        if (
          next &&
          curr.char === next.char &&
          curr.charIndex === next.charIndex &&
          typeof curr.pointIndex === 'number' &&
          typeof next.pointIndex === 'number' &&
          next.pointIndex === curr.pointIndex + 1
        ) {
          const dx = next.x - curr.x;
          const dy = next.y - curr.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Only connect if the distance is within segment bounds (e.g. < 8px)
          if (dist < 8) {
            ctx.moveTo(curr.x, curr.y);
            ctx.lineTo(next.x, next.y);
          }
        }
      }
      ctx.stroke();

      // 2. Draw glowing cyan particle circles with bright white inner cores
      const pulse = Math.sin(Date.now() / 150) * 0.15 + 0.85;

      coords.forEach(c => {
        const baseRadius = 2.0 * (c.emphasis || 1.0) * pulse;
        const outerRadius = Math.max(1.0, baseRadius);

        // Glowing outer cyan particle
        ctx.beginPath();
        ctx.arc(c.x, c.y, outerRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 245, 255, 0.85)';
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(0, 245, 255, 0.9)';
        ctx.fill();

        // Bright white inner core
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(0.5, outerRadius * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.fill();
      });

      ctx.restore();
    }
  });

  // 7. BALLPOINT PEN DRAWER — Anime Heavy Outline / Hand-Drawn Ink
  roleDispatcher.registerRoleDrawer({
    role: 'ink.ballpoint',
    depth: 45,
    draw: (ctx, coords, _canvasSize) => {
      if (coords.length === 0) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Position-keyed jitter — stable across frames, no animation drift
      const ink = (x: number, y: number, seed: number): number =>
        (Math.sin(x * 92.3 + y * 185.7 + seed) * 0.5 - 0.25);

      // Build stroke chains: break on gaps > 18px (new glyph or disconnected stroke)
      const chains: RoleCoordinate[][] = [];
      let current: RoleCoordinate[] = [];
      for (let i = 0; i < coords.length; i++) {
        if (current.length === 0) { current.push(coords[i]); continue; }
        const prev = current[current.length - 1];
        const dx = coords[i].x - prev.x;
        const dy = coords[i].y - prev.y;
        if (Math.sqrt(dx * dx + dy * dy) > 18) {
          if (current.length >= 2) chains.push(current);
          current = [coords[i]];
        } else {
          current.push(coords[i]);
        }
      }
      if (current.length >= 2) chains.push(current);

      chains.forEach((pts, ci) => {
        const n = pts.length;
        if (n < 2) return;

        // Laplacian smooth: pull each point toward its neighbors
        const smooth = pts.map((pt, i) => {
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(n - 1, i + 1)];
          return {
            x: (prev.x + pt.x * 2 + next.x) / 4,
            y: (prev.y + pt.y * 2 + next.y) / 4,
            e: pt.emphasis ?? 0.8,
          };
        });

        const midE = smooth[Math.floor(n / 2)].e;

        // PASS 1 — Anime heavy outline: thick cream-white, slight hand-drawn jitter
        ctx.beginPath();
        smooth.forEach((p, i) => {
          const px = p.x + ink(p.x, p.y, ci * 3.1);
          const py = p.y + ink(p.y, p.x, ci * 7.4);
          if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
        });
        ctx.lineWidth = 4.2 + midE * 1.6;
        ctx.strokeStyle = 'rgba(245, 243, 255, 0.92)';
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(200, 205, 255, 0.30)';
        ctx.stroke();

        // PASS 2 — Ballpoint sheen: thin blue-cool line riding the stroke centerline
        ctx.beginPath();
        smooth.forEach((p, i) => {
          const px = p.x + ink(p.x, p.y, ci * 1.9 + 50) * 0.35;
          const py = p.y + ink(p.y, p.x, ci * 4.2 + 50) * 0.35;
          if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
        });
        ctx.lineWidth = 1.4 + midE * 0.5;
        ctx.strokeStyle = 'rgba(190, 200, 255, 0.50)';
        ctx.shadowBlur = 0;
        ctx.stroke();
      });

      ctx.restore();
    }
  });
}
