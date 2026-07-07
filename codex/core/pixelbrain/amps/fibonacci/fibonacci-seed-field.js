export function generateFibonacciSeedField(intent, input) {
    const count = intent.fibonacci?.count || 0;
    const mode = intent.fibonacci?.mode || "none";
    
    // Fallback if no geometry is provided by upstream microprocessor
    const boundsWidth = input.geometry?.bounds?.width || intent.tileSize?.width || 80;
    const boundsHeight = input.geometry?.bounds?.height || intent.tileSize?.height || 45;
    
    const seeds = [];
    const fields = {
        primary: []
    };
    
    // Golden ratio for spiral distribution
    const phi = (1 + Math.sqrt(5)) / 2;
    const centerX = boundsWidth / 2;
    const centerY = boundsHeight / 2;
    
    for (let i = 0; i < count; i++) {
        // Spiral spread
        const r = Math.sqrt(i) * 2; 
        const theta = i * phi * Math.PI * 2;
        
        const x = Math.round(centerX + r * Math.cos(theta));
        const y = Math.round(centerY + r * Math.sin(theta));
        
        // Ensure within bounds
        if (x >= 0 && x < boundsWidth && y >= 0 && y < boundsHeight) {
            seeds.push({ x, y, index: i, mode });
            fields.primary.push({ x, y, intensity: 1.0 - (i / count) });
        }
    }
    
    return { seeds, fields };
}
