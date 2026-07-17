/**
 * IsoMap Canvas Component
 * PDR: Pixel Lotus Actor Forge and Isometric Combat Runtime
 *
 * Renders the isometric map with proper depth sorting.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { IsoScene, IsoTile, IsoFacing, PixelLotusAnimationName } from '../contracts/isoScene.schema';
import { isoCellToScreen, getIsoDepthSortKey } from '../math/isoProjection';
import { sortSceneEntities } from '../math/isoDepthSort';
import './isoMapCanvas.css';

interface IsoMapCanvasProps {
  scene: IsoScene;
  onTileClick?: (tile: IsoTile) => void;
  onActorClick?: (actorId: string) => void;
}

// Tile geometry for isometric diamond
const TILE_POINTS = {
  top: (x: number, y: number, size: number) => [
    { x: x, y: y - size },
    { x: x + size, y: y },
    { x: x, y: y + size },
    { x: x - size, y: y },
  ],
};

export function IsoMapCanvas({ scene, onTileClick, onActorClick }: IsoMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { tiles, props, actors } = sortSceneEntities(
    scene.map.tiles,
    scene.props,
    scene.actors,
    scene.spellFields
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw ground tiles
    tiles.forEach(tile => {
      const screen = isoCellToScreen(tile.col, tile.row, 0, scene);
      drawTile(ctx, screen.x, screen.y, scene.tileWidth, scene.tileHeight, tile);
    });

    // Draw props (behind actors)
    props.forEach(prop => {
      const screen = isoCellToScreen(prop.col, prop.row, prop.height, scene);
      drawProp(ctx, screen.x, screen.y - prop.height, prop);
    });

    // Draw actors (will be drawn on top)
    actors.forEach(actor => {
      const screen = isoCellToScreen(
        actor.gridPosition.col,
        actor.gridPosition.row,
        actor.gridPosition.z,
        scene
      );
      drawActor(ctx, screen.x, screen.y, actor);
    });
  }, [scene, tiles, props, actors]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const tile = tiles.find(t => {
      const screen = isoCellToScreen(t.col, t.row, 0, scene);
      const halfW = scene.tileWidth / 2;
      const halfH = scene.tileHeight / 2;
      const dx = Math.abs(screenX - screen.x);
      const dy = Math.abs(screenY - screen.y);
      return dx <= halfW && dy <= halfH && dx + dy <= halfW + halfH;
    });

    if (tile && onTileClick) {
      onTileClick(tile);
    }
  }, [tiles, scene, onTileClick]);

  return (
    <canvas
      ref={canvasRef}
      className="iso-map-canvas"
      width={800}
      height={600}
      onClick={handleClick}
    />
  );
}

// Draw an isometric tile
function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
  tile: IsoTile
) {
  const halfW = tileWidth / 2;
  const halfH = tileHeight / 2;

  ctx.fillStyle = getTerrainColor(tile.terrain);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(x - halfW, y);
  ctx.lineTo(x, y - halfH);
  ctx.lineTo(x + halfW, y);
  ctx.lineTo(x, y + halfH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Draw a prop (placeholder - will use sprite sheets when implemented)
function drawProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  prop: { height: number; blocksMovement: boolean }
) {
  const halfW = 20;
  const propHeight = prop.height * 30;

  ctx.fillStyle = prop.blocksMovement ? '#666' : '#888';
  ctx.fillRect(x - halfW / 2, y - propHeight, halfW, propHeight);
}

// Draw an actor (placeholder - will use sprite sheets when implemented)
function drawActor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  actor: { facing: string; team: string }
) {
  const colors: Record<string, string> = {
    player: '#60a5fa',
    enemy: '#f87171',
    neutral: '#a78bfa',
  };

  ctx.fillStyle = colors[actor.team] ?? '#fff';
  ctx.beginPath();
  ctx.arc(x, y - 10, 12, 0, Math.PI * 2);
  ctx.fill();

  // Facing indicator (simple line toward facing direction)
  const facingAngles: Record<string, number> = {
    N: -90, NE: -45, E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135,
  };
  const angle = facingAngles[actor.facing] ?? 0;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + Math.cos(angle * Math.PI / 180) * 15, y - 10 + Math.sin(angle * Math.PI / 180) * 15);
  ctx.stroke();
}

// Terrain color mapping
function getTerrainColor(terrain: IsoTile['terrain']): string {
  const colors: Record<string, string> = {
    stone: '#555',
    grass: '#2a5a2a',
    water: '#336699',
    void: '#111',
    metal: '#888',
    crystal: '#4fc3f7',
    fabric: '#8d6e63',
    energy: '#ffd54f',
  };
  return colors[terrain] ?? '#444';
}