import React, { useEffect, useRef } from 'react';

export default function TileForgeCanvas({ candidate }) {
  const canvasRef = useRef(null);
  
  // Asset Cache
  const imageCache = useRef({});

  useEffect(() => {
    // Pre-load graphics
    const assets = {
      purple_void_grass: '/assets/void_tiles/void_forest_grass-png.png',
      void_ice_top: '/assets/void_tiles/void_ice_surface-png.png',
      obsidian_dirt_side: '/assets/void_tiles/obsidian_cliff_edge-png.png',
      obsidian_side: '/assets/void_tiles/obsidian_cliff_edge-png.png',
      purple_void_tree: '/assets/void_tiles/void_crystal_tree-png.png',
      hologram_fern: '/assets/void_tiles/hologram_fern-png.png',
      void_spores: '/assets/void_tiles/void_spores-png.png',
      obsidian_cavity: '/assets/void_tiles/void_spores-png.png',
      ember_pine: '/assets/trees/ember_pine.png',
      void_pine: '/assets/trees/void_pine.png',
      base_pine: '/assets/trees/base_pine.png',
      snow_pine: '/assets/trees/snow_pine.png',
      void_liquid: '/assets/void_tiles/void_liquid-png.png',
      void_flowers: '/assets/void_tiles/void_flowers-png.png',
      void_tall_grass: '/assets/void_tiles/void_tall_grass-png.png',
      void_short_grass: '/assets/void_tiles/void_short_grass-png.png',
      void_ice_sunflower: '/assets/void_tiles/void_ice_sunflower-png.png'
    };

    Object.entries(assets).forEach(([key, src]) => {
      if (!imageCache.current[key]) {
        const img = new Image();
        img.src = src;
        imageCache.current[key] = img;
      }
    });
  }, []);

  useEffect(() => {
    if (!candidate || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Background
    ctx.fillStyle = '#050510'; // Deep void color
    ctx.fillRect(0, 0, width, height);

    // Iso constants
    const tileW = 16; // Adjust size so 80x45 fits on screen
    const tileH = 8;
    const offsetX = width / 2;
    const offsetY = 50;

    const { isoTile, biomeMaterial, fibonacciField } = candidate.layers;
    if (!isoTile || !isoTile.topPlane) return;

    // Organic Perlin-like noise for grass texturing
    const getGrassNoise = (x, z) => {
      // Lower frequencies for larger, smoother patches of terrain types
      return (Math.sin(x * 0.1 + z * 0.1) + Math.sin(x * 0.15 - z * 0.05) + Math.sin(x * 0.05 + z * 0.2)) / 3; 
    };

    // Combine all cells to draw (top, side, rim)
    const allCells = [];

    // Colors based on material assignments
    const { assignments, palette } = biomeMaterial || {};
    const primaryColor = palette?.primary || '#8b5cf6';
    const secondaryColor = palette?.secondary || '#0f172a';
    const rimColor = '#d8b4fe'; // Glowing rim 

    isoTile.topPlane.forEach(cell => {
      allCells.push({ ...cell, type: 'top', material: assignments?.topPlane || 'void_ice_top', color: primaryColor });
    });
    
    if (isoTile.rimCells) {
      isoTile.rimCells.forEach(cell => {
        allCells.push({ ...cell, type: 'rim', material: assignments?.rim, color: rimColor });
      });
    }

    if (isoTile.sidePlanes) {
      Object.values(isoTile.sidePlanes).flat().forEach(cell => {
        allCells.push({ ...cell, type: 'side', material: assignments?.sidePlane || 'obsidian_side', color: secondaryColor });
      });
    }

    // Mix in fibonacci seeds as "trees" for the Void Forest
    if (fibonacciField && fibonacciField.seeds) {
      fibonacciField.seeds.forEach((seed, index) => {
        const types = ['hologram_fern', 'purple_void_tree', 'void_pine', 'ember_pine', 'base_pine', 'snow_pine'];
        const propMaterial = types[index % types.length];
        allCells.push({ ...seed, type: 'tree', material: propMaterial, color: '#a855f7' });
      });
    }

    // Painter's algorithm sort (back to front)
    // Depth in isometric projection is x + y
    allCells.sort((a, b) => {
      const depthA = a.x + a.y;
      const depthB = b.x + b.y;
      if (depthA === depthB) {
        // Order of drawing on same tile: side -> top -> rim -> tree
        const order = { side: 0, top: 1, rim: 2, tree: 3 };
        return order[a.type] - order[b.type];
      }
      return depthA - depthB;
    });

    // Animation state
    let i = 0;
    let animationFrameId;

    const drawIsoDiamond = (ctx, px, py, color, strokeColor) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, py); // Top
      ctx.lineTo(px + tileW / 2, py + tileH / 2); // Right
      ctx.lineTo(px, py + tileH); // Bottom
      ctx.lineTo(px - tileW / 2, py + tileH / 2); // Left
      ctx.closePath();
      ctx.fill();
      
      if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };

    const drawNextBatch = () => {
      // Draw 60 tiles per frame for a fast, sweeping crystal-growth effect
      const batchSize = 60; 
      
      for (let b = 0; b < batchSize && i < allCells.length; b++, i++) {
        const cell = allCells[i];
        
        // Iso projection
        const px = offsetX + (cell.x - cell.y) * (tileW / 2);
        let py = offsetY + (cell.x + cell.y) * (tileH / 2);

        // Adjust Y based on Z elevation if present
        const elevationOffset = (cell.z || 0) * tileH;
        py -= elevationOffset;

        let imgKey = cell.material;
        
        // Add organic variety to the grass using Perlin patches
        if (imgKey === 'purple_void_grass') {
          const noise = getGrassNoise(cell.x, cell.z || 0);
          
          // Base patches
          if (noise > 0.3) {
            imgKey = 'void_tall_grass';
          } else if (noise < -0.3) {
            imgKey = 'void_short_grass';
          }

          // Sprinkle flowers and sunflowers organically using a high-frequency hash
          const hash = Math.abs(Math.sin(cell.x * 12.9898 + (cell.z || 0) * 78.233)) * 100;
          
          // Sunflowers prefer taller patches
          if (noise > 0.1 && hash < 4) {
            imgKey = 'void_ice_sunflower';
          }
          // Bioluminescent flowers bloom everywhere but sparsely
          else if (hash > 90 && hash < 95) {
            imgKey = 'void_flowers';
          }
        }

        const img = imageCache.current[imgKey];
        const imgReady = img && img.complete && img.naturalWidth !== 0;

        if (cell.type === 'top') {
          if (imgReady) {
            ctx.drawImage(img, px - tileW, py, tileW * 2, tileH * 2);
          } else {
            drawIsoDiamond(ctx, px, py, cell.color, '#00000044');
          }
        } 
        else if (cell.type === 'rim') {
          if (imgReady) {
            // Draw rim tile 
            ctx.drawImage(img, px - tileW, py, tileW * 2, tileH * 2);
          } else {
            drawIsoDiamond(ctx, px, py, cell.color, '#ffffff88');
          }
        }
        else if (cell.type === 'side') {
          if (imgReady) {
            // Cliff edge textures might be taller, draw anchored to bottom of diamond
            ctx.drawImage(img, px - tileW, py, tileW * 2, tileH * 4);
          } else {
            // Draw a downward extruded block
            ctx.fillStyle = cell.color;
            ctx.beginPath();
            ctx.moveTo(px - tileW / 2, py + tileH / 2);
            ctx.lineTo(px, py + tileH);
            ctx.lineTo(px + tileW / 2, py + tileH / 2);
            ctx.lineTo(px + tileW / 2, py + tileH / 2 + tileH * 2); // Extrude down
            ctx.lineTo(px, py + tileH + tileH * 2);
            ctx.lineTo(px - tileW / 2, py + tileH / 2 + tileH * 2);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#00000066';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            // Draw top of side
            drawIsoDiamond(ctx, px, py, cell.color, null);
          }
        }
        else if (cell.type === 'tree') {
          if (imgReady) {
            // Dynamically scale tree assets based on their native dimensions to keep them planted on the tile
            const scale = (tileW * 3.5) / img.naturalWidth;
            const treeW = img.naturalWidth * scale;
            const treeH = img.naturalHeight * scale;
            ctx.drawImage(img, px - treeW / 2, py + tileH / 2 - treeH, treeW, treeH);
          } else {
            // Draw a tall glowing crystal/tree
            const treeHeight = tileH * 4;
            
            ctx.fillStyle = cell.color;
            ctx.beginPath();
            ctx.moveTo(px, py + tileH / 2 - treeHeight); // Top point
            ctx.lineTo(px + tileW / 4, py + tileH / 2); // Right base
            ctx.lineTo(px, py + tileH); // Bottom base
            ctx.lineTo(px - tileW / 4, py + tileH / 2); // Left base
            ctx.closePath();
            
            // Glow effect
            ctx.shadowColor = cell.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            
            // Reset shadow
            ctx.shadowBlur = 0;
            
            ctx.strokeStyle = '#ffffff88';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      if (i < allCells.length) {
        animationFrameId = requestAnimationFrame(drawNextBatch);
      }
    };

    drawNextBatch();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };

  }, [candidate]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #1e293b' }}>
      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={600} 
        style={{ width: '100%', height: '100%', display: 'block' }} 
      />
      {/* Hologram overlay styling */}
      <div style={{ 
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
        pointerEvents: 'none',
        background: 'linear-gradient(to bottom, transparent 50%, rgba(0, 255, 255, 0.05) 51%, transparent 51%)',
        backgroundSize: '100% 4px'
      }} />
    </div>
  );
}
