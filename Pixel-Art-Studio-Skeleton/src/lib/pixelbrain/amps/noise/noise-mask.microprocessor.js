// Deterministic pseudo-random number generator (fallback placeholder for actual Perlin logic)
function seededRandom(seedStr, x, y) {
    let hash = 0;
    const str = `${seedStr}_${x}_${y}`;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; 
    }
    const x_ = Math.sin(hash++) * 10000;
    return x_ - Math.floor(x_);
}

export function generateNoiseMask(intent, input, config) {
    const fields = { baseNoise: [] };
    const masks = { appliedMask: [] };
    const affectedCells = [];
    
    // Mask within topPlane if available, otherwise just use dummy bounds
    const topPlane = input.isoTile?.topPlane || [];
    const seed = intent.seed || "default_seed";
    const scale = config.scale || 0.1;
    
    for (const cell of topPlane) {
        const noiseValue = seededRandom(seed, Math.floor(cell.x * scale), Math.floor(cell.y * scale));
        
        fields.baseNoise.push({ x: cell.x, y: cell.y, value: noiseValue });
        
        // Applying the mask threshold
        if (noiseValue > config.intensity) {
            masks.appliedMask.push({ x: cell.x, y: cell.y });
            affectedCells.push({ x: cell.x, y: cell.y, noiseValue });
        }
    }
    
    return { fields, masks, affectedCells };
}
