export function generateHeightMap(intent, input, baseElevation) {
    const heightMap = [];
    const thickness = [];
    const cliffs = [];
    const cavities = [];
    const overhangs = [];
    
    const topPlane = input.isoTile?.topPlane || [];
    const sidePlanesByEdge = input.isoTile?.sidePlanes || {};
    const sidePlanes = Object.values(sidePlanesByEdge).flat();
    
    // Base tile volume calculation
    for (const cell of topPlane) {
        heightMap.push({ x: cell.x, y: cell.y, elevation: baseElevation });
        
        // Extrude downwards for thickness
        const cellThickness = intent.caveMode ? Math.max(1, baseElevation) : 2;
        for (let t = 1; t <= cellThickness; t++) {
            thickness.push({ x: cell.x, y: cell.y, elevation: baseElevation - t });
        }
        
        // Simple heuristic for cavities
        if (intent.chunkType === "floating_island" && cell.x % 5 === 0 && cell.y % 5 === 0) {
            cavities.push({ x: cell.x, y: cell.y, elevation: baseElevation - cellThickness });
        }
    }
    
    // Determine cliffs and overhangs from edges
    for (const edgeCell of sidePlanes) {
        cliffs.push({
            x: edgeCell.x,
            y: edgeCell.y,
            height: baseElevation,
            facing: edgeCell.facing || "south"
        });
        
        // Simple overhang heuristic
        if (intent.caveMode && (edgeCell.x % 3 === 0)) {
            overhangs.push({
                x: edgeCell.x,
                y: edgeCell.y,
                elevation: baseElevation
            });
        }
    }
    
    return { heightMap, thickness, cliffs, cavities, overhangs };
}
