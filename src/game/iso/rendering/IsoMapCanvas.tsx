import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { IsoScene } from '../contracts/isoScene.schema';

interface IsoMapCanvasProps {
  scene: IsoScene;
  width?: number;
  height?: number;
  onTileClick?: (tile: any) => void;
  onTileHover?: (tile: any) => void;
  onActorClick?: (actorId: string) => void;
  // Optional targeting data for live highlights on the iso grid
  targeting?: any;
  validTiles?: Array<{x: number, y: number}>;
}

export function IsoMapCanvas({ scene, width: propWidth = 800, height: propHeight = 600, onTileClick, onTileHover, onActorClick, targeting, validTiles = [] }: IsoMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tileImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const [dims, setDims] = useState(() => ({ width: propWidth, height: propHeight }));
  const [imgVersion, setImgVersion] = useState(0);
  const [hoveredCell, setHoveredCell] = useState<{ col: number; row: number } | null>(null);

  // Measure the actual box we were given (battle-map fills viewport; sandbox may be smaller).
  // The grid template math uses these exact pixel numbers for origin + range so tiles are
  // horizontally centered and fill every inch without gaps or left clustering.
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setDims({
          width: Math.max(100, Math.floor(r.width)),
          height: Math.max(100, Math.floor(r.height)),
        });
      } else if (typeof window !== 'undefined') {
        setDims({
          width: Math.max(640, window.innerWidth),
          height: Math.max(480, window.innerHeight),
        });
      }
    };

    // initial measure (after mount layout)
    requestAnimationFrame(measure);

    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);

    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const width = dims.width;
  const height = dims.height;

  // Load modular VOID tutorial island tiles and prop overlays.
  useEffect(() => {
    const tiles = [
      'void_ice_floor',
      'void_ice_floor_cracked',
      'void_snow_floor',
      'void_rune_path',
      'void_rune_focus',
      'void_cliff_edge',
      'void_crystal_cluster',
      'void_crystal_fern',
      'void_glow_mushroom'
    ];
    let loadedCount = 0;

    tiles.forEach(name => {
      const img = new Image();
      img.src = `/assets/void_tiles/${name}-png.png`;
      const onLoad = () => {
        tileImagesRef.current[name] = img;
        loadedCount++;
        setImgVersion(v => v + 1);
      };
      img.onload = onLoad;
      if (img.complete) {
        onLoad();
      }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match backing store to current viewport dims (full immersive, no dead space)
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    // === PIXEL-PERFECT MATHEMATICAL GRID TEMPLATE (wand-style formula) ===
    // Every tile position is derived directly from:
    //   anchorX = originX + (col - row) * (tileW / 2)
    //   anchorY = originY + (col + row) * (tileH / 2)
    // Using larger tiles (128x64) authored in SCDL for substantial presence.
    // origin chosen so the pattern is perfectly centered horizontally on screen.
    // Tiles are equidistant, use floor for integer pixel alignment.
    //
    // The tile *choice* is arranged into a legible scene with added decorations:
    // central rune_focus + parallel rune_path grid + cliff/snow borders + crystal/fern/mushroom foliage + cracked.
    // All via deterministic grid math (col, row).

    const tileW = 128;
    const tileH = 64;
    const stepX = tileW / 2; // 64px
    const stepY = tileH / 2; // 32px

    // Center origin horizontally at all times. Vertical bias gives "camera" over playfield.
    // (0,0) cell sits at this origin — all other cells are pure integer multiples away.
    const originX = Math.floor(width / 2);
    const originY = Math.floor(height * 0.25);

    const isoPoint = (col: number, row: number) => ({
      x: Math.floor(originX + (col - row) * stepX),
      y: Math.floor(originY + (col + row) * stepY),
    });

    const drawVoidBackdrop = () => {
      ctx.fillStyle = '#030611';
      ctx.fillRect(0, 0, width, height);

      const aurora = ctx.createLinearGradient(0, 0, width, Math.max(1, height * 0.42));
      aurora.addColorStop(0, 'rgba(73, 231, 231, 0)');
      aurora.addColorStop(0.35, 'rgba(73, 231, 231, 0.34)');
      aurora.addColorStop(0.56, 'rgba(154, 92, 245, 0.26)');
      aurora.addColorStop(1, 'rgba(73, 231, 231, 0)');
      ctx.fillStyle = aurora;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.12);
      ctx.bezierCurveTo(width * 0.24, height * 0.02, width * 0.48, height * 0.22, width, height * 0.08);
      ctx.lineTo(width, height * 0.30);
      ctx.bezierCurveTo(width * 0.62, height * 0.24, width * 0.34, height * 0.34, 0, height * 0.22);
      ctx.closePath();
      ctx.fill();

      for (let i = 0; i < 96; i += 1) {
        const sx = (i * 97) % Math.max(1, width);
        const sy = (i * 53) % Math.max(1, height);
        const alpha = 0.35 + ((i * 17) % 40) / 100;
        ctx.fillStyle = `rgba(220, 236, 255, ${alpha})`;
        ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, 1);
      }
    };

    const tileTextureFor = (tile: any) => {
      const seed = String(tile.textureSeed || '');
      if (tileImagesRef.current[seed]) return seed;
      if (tile.terrain === 'energy') return tile.col === 5 || tile.col === 6 ? 'void_rune_path' : 'void_rune_focus';
      if (tile.terrain === 'fabric') return 'void_snow_floor';
      if (tile.terrain === 'crystal') return 'void_ice_floor_cracked';
      return 'void_ice_floor';
    };

    const drawFloorTile = (tile: any) => {
      if (!tile.walkable || tile.terrain === 'void') return;
      const name = tileTextureFor(tile);
      const img = tileImagesRef.current[name];
      if (!img || !img.complete) return;
      const p = isoPoint(tile.col, tile.row);
      const yOffset = img.height > tileH ? tileH / 2 : tileH / 2;
      ctx.drawImage(img, Math.floor(p.x - img.width / 2), Math.floor(p.y - yOffset));
    };

    const propTextureFor = (spriteId: string) => {
      const id = String(spriteId || '');
      if (tileImagesRef.current[id]) return id;
      if (id.includes('mushroom')) return 'void_glow_mushroom';
      if (id.includes('fern') || id.includes('grass')) return 'void_crystal_fern';
      return 'void_crystal_cluster';
    };

    const drawProp = (prop: any) => {
      const name = propTextureFor(prop.spriteId);
      const img = tileImagesRef.current[name];
      if (!img || !img.complete) return;
      const p = isoPoint(prop.col, prop.row);
      ctx.drawImage(img, Math.floor(p.x - img.width / 2), Math.floor(p.y + tileH / 2 - img.height));
    };

    drawVoidBackdrop();

    const tiles = [...(scene?.map?.tiles || [])].sort((a: any, b: any) => {
      const da = a.col + a.row;
      const db = b.col + b.row;
      return da === db ? a.col - b.col : da - db;
    });
    tiles.forEach(drawFloorTile);

    const props = [...(scene?.props || [])].sort((a: any, b: any) => {
      const da = a.col + a.row + (a.layerOffset || 0);
      const db = b.col + b.row + (b.layerOffset || 0);
      return da === db ? a.col - b.col : da - db;
    });
    props.forEach(drawProp);

    // Draw targeting valid tiles (green highlights on the iso grid)
    if (validTiles && validTiles.length > 0) {
      for (const t of validTiles) {
        const c = t.x ?? t.col;
        const r = t.y ?? t.row;
        const { x: vx, y: vy } = isoPoint(c, r);

        ctx.save();
        ctx.fillStyle = 'rgba(74, 222, 128, 0.35)';
        ctx.beginPath();
        ctx.moveTo(vx, vy - tileH / 2);
        ctx.lineTo(vx + tileW / 2, vy);
        ctx.lineTo(vx, vy + tileH / 2);
        ctx.lineTo(vx - tileW / 2, vy);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw units / actors from the scene on top of the beautiful terrain
    if (scene && scene.actors && scene.actors.length > 0) {
      for (const actor of scene.actors) {
        const c = actor.gridPosition.col;
        const r = actor.gridPosition.row;
        const { x: ux, y: uy } = isoPoint(c, r);

        const isPlayer = actor.team === 'player';
        const color = isPlayer ? '#7ab0ff' : '#ff7a7a';

        // Unit body (larger for visibility on big tiles)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ux, uy - 18, 14, 0, Math.PI * 2);
        ctx.fill();

        // Outline + glow
        ctx.strokeStyle = isPlayer ? '#a5d8ff' : '#ffaaaa';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner highlight
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(ux - 4, uy - 22, 5, 0, Math.PI * 2);
        ctx.fill();

        // Facing pip
        ctx.fillStyle = '#fff';
        const dirX = (actor.facing === 'E' || actor.facing === 'SE' || actor.facing === 'NE') ? 8 : (actor.facing === 'W' || actor.facing === 'SW' || actor.facing === 'NW') ? -8 : 0;
        const dirY = (actor.facing === 'S' || actor.facing === 'SE' || actor.facing === 'SW') ? 8 : (actor.facing === 'N' || actor.facing === 'NE' || actor.facing === 'NW') ? -8 : 0;
        ctx.fillRect(ux + dirX - 3, uy - 18 + dirY - 3, 6, 6);

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((actor.id || 'unit').split('-')[0].toUpperCase(), ux, uy + 10);
      }
    }

  }, [scene, width, height, imgVersion, hoveredCell]);

  // Shared math helpers (must stay in sync with draw loop)
  const getIsoCell = useCallback((screenX: number, screenY: number) => {
    const tileW = 128;
    const tileH = 64;
    const stepX = tileW / 2;
    const stepY = tileH / 2;

    const originX = Math.floor(width / 2);
    const originY = Math.floor(height * 0.25);

    const lx = screenX - originX;
    const ly = screenY - originY;

    const col = Math.round((ly / stepY + lx / stepX) / 2);
    const row = Math.round((ly / stepY - lx / stepX) / 2);
    return { col, row };
  }, [width, height]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const { col, row } = getIsoCell(screenX, screenY);
    if (onTileClick) onTileClick({ col, row, x: col, y: row } as any);
  }, [getIsoCell, onTileClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const cell = getIsoCell(screenX, screenY);
    setHoveredCell(prev => {
      if (prev && prev.col === cell.col && prev.row === cell.row) return prev;
      return cell;
    });
    if (onTileHover) onTileHover({ col: cell.col, row: cell.row, x: cell.col, y: cell.row });
  }, [getIsoCell, onTileHover]);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  // Wrapper + ref gives us precise allocated rect for math (originX = w/2 etc).
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#05070f'
      }}
    >
      <canvas
        ref={canvasRef}
        className="iso-map-canvas"
        width={width}
        height={height}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          cursor: 'pointer'
        }}
      />
    </div>
  );
}
