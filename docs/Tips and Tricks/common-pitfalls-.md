1.) 2.5D isometric view gathering problem involving pointer not being able to click certain blocks that are hidden by camera ambiguity. Fix: every tile gets applied a certain value which gets validated by the click if you have a gathering tool.

Example: 

GATHER_INTENT {
    targetCell: { x, y, z },
    toolId: "pickaxe"
  }

  Then the authority validates:

  1. Tile exists.
  2. Tile is gatherable.
  3. Player has the required gathering tool.
  4. Player is close enough / has reach.
  5. Tile is not blocked by gameplay rules.
  6. State changes server-side only.

  This matches the existing movement pattern in Scholomance OS/server/authority.js:1 and Scholomance OS/server/movement.js:1: client sends intent, server validates against canonical map data. It also matches the lattice/projection split
  in codex/core/pixelbrain/iso-projector.js:1.

  The caveat: if multiple cells sit under the same screen pixel, the client should collect a candidate stack and choose by a deterministic rule, probably:

  visible/top face first
  then gatherable-with-current-tool
  then nearest/reachable
  then highest interaction priority

  So: yes, assign tile interaction metadata and validate on click/tool. Just do not let the camera decide truth, and do not make hidden blocks freely clickable unless the tool/rule system intentionally allows it.

  2.) Perlin Noise = smooth transitional positioning of procedural world generation for caves, rivers, mountains, etc.
  
  3.) Intent Manager concept to control NPC (enemies, friends etc) behavior.
  
  4.) A Star pathing for pathing for enemy AI etc.
  
  
