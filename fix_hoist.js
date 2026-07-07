const fs = require('fs');
const code = fs.readFileSync('src/pages/Landing/storm/galaxySim.js', 'utf8');

// Regex to extract drawGalaxyLayers
const match = code.match(/(\/\*\*\n \* Renders the galaxy using layered volumetric sprites & composition modes\n \*\/\nfunction drawGalaxyLayers[\s\S]*?^})/m);
if (match) {
  let funcCode = match[1];
  let newCode = code.replace(match[1], ''); // remove from bottom
  
  // insert before initGalaxy
  newCode = newCode.replace('export function initGalaxy', funcCode + '\n\nexport function initGalaxy');
  fs.writeFileSync('src/pages/Landing/storm/galaxySim.js', newCode);
  console.log("Moved drawGalaxyLayers above initGalaxy");
} else {
  console.log("Could not find drawGalaxyLayers");
}
