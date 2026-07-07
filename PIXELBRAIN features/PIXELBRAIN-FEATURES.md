### 🎨 Rendering & Polish (Fidelity Enhancers)                                                                                                         
                                                                                                                                                         
  These tools handle the final visual adjustments, sharpness, and anti-aliasing of the pixel output.                                                     
                                                                                                                                                         
  •  pixel-aa-amp.js : An Anti-Aliasing pass that softens 1-cell silhouette stair-steps by recoloring the inner corner cells.                            
  •  square-sharpness-contrast-amp.js : Enhances the readability and crispness of square/blocky renders by analyzing edge anchors derived from the       
  material palette.                                                                                                                                      
  •  selout-amp.js : Selective Outline (selout) pass that modulates outline colors dynamically based on light orientation.                               
  •  palette-quantization-amp.js : Enforces the final deterministic palette budget by mapping drawn colors back to strict material registry anchors.     
  •  pixel-scale-amp.js : Handles perceptual scaling logic using YUV color distance weights (matching xBR reference algorithms).                         
                                                                                                                                                         
  ### 💡 Lighting, Shadow, & Volume                                                                                                                      
                                                                                                                                                         
  These tools reshape raw color cells into cohesive 3D objects with unified lighting logic.                                                              
                                                                                                                                                         
  •  volume-amp.js : Reshapes color/value relationships at the individual cell level to fake 3D depth and volume.                                        
  •  volume-lift-amp.js : Lifts shapes based on their "spine," dynamically generating depth layers (e.g.  2*maxDepth + 1 ).                              
  •  shadow-amp.js : Casts and calculates shading, guided by a core rule to never blindly darken core/glow cells, protecting internal light sources.     
  •  shadow-perception-amp.js : Enhances visual contrast of shadows based on human perception metrics.                                                   
  •  tonation-amp.js : Balances color tonation slightly depending on the underlying material identity.                                                   
  •  facet-amp.js : A specialized shading pass for gem-class parts that partitions the geometry into sharp, planar regions and shades them flat.         
                                                                                                                                                         
  ### 📐 Geometry & Structure                                                                                                                            
                                                                                                                                                         
  Tools that manipulate or validate the underlying coordinate structures before shading occurs.                                                          
                                                                                                                                                         
  •  geometry-amp.js : Converts composed geometry into deterministic shader masks and construction diagnostics (doesn't draw pixels, just preps the map).
  •  sdf-shape-amp.js : Consumes Signed Distance Fields (SDFs) and construction skeletons, then emits integer cells by sampling at cell centers.         
  •  coord-symmetry-amp.js  &  symmetry-amp.js : Validates the input structure and forcefully applies mirrored symmetry rules across the lattice.        
  •  hollowness-amp.js : Computes hollow boundaries and inner cutouts for volumetric shapes.                                                             
  •  chunks-seam-amp.js : Processes seams and joints where modular chunks (like limbs or armor segments) connect.                                        
  •  vector-amp.js : Generates and manages directional vectors used by downstream lighting/shading shaders.                                              
                                                                                                                                                         
  ### 🖌 Fills & Details                                                                                                                                 
                                                                                                                                                         
  Tools handling internal patterning and space-filling properties.                                                                                       
                                                                                                                                                         
  •  region-fill-amp.js : Handles anchor ramp construction and flood-filling bounded regions.                                                            
  •  noise-fill-amp.js : Modulates material intensity or adds variation using deterministic noise on existing lattice cells without breaking required    
  bounds.                                                                                                                                                
  •  biome-coherence-amp.js : Integrates contextual environmental adjustments to match specific biomes.                                                  
  •  heraldry-amp.js : Projects complex insignia, crests, and heraldic mappings onto 3D-angled surfaces.                                                 
                                                                                                                                                         
  ### ⚔ Item-Specific & Thematic Modifiers                                                                                                              
                                                                                                                                                         
  Highly specialized enhancements tied to specific asset classes (like weapons, armor, or magic).                                                        
                                                                                                                                                         
  •  flame-tip-amp.js : Shapes the structural taper geometry specifically for fire and flame elements.                                                   
  •  flame-tip-ca.js : Uses Cellular Automata to beautifully polish and animate the flame tip silhouette.                                                
  •  holyfire-motif-amp.js : Implements glowing holy-fire patterns based on phase offsets.                                                               
  •  crystal-core-amp.js : Generates a structured crystal sternum/core pass for chestplates, creating contained inner glows.                             
  •  jewelry-amp.js : Pre-processor that automatically generates chains, gem settings, and manipulates volumes tailored for amulets and rings.           
  •  chestplate-*  suite ( chestplate-amp ,  chestplate-bevel-amp ,  chestplate-surface-texture-amp ): Handles harmonic symmetry, trim beveling, and     
  deterministic coordinate-hashed texture clustering specifically for chestplate armor.                                                                  
  •  shield-*  suite ( shield-rim-amp ,  shield-volume-amp ): Owns outer borders, curved face shading, center planes, and rim cast shadows for shields.  
  •  scholomance-character-motif-amp.js : Injects specific Scholomance lore accents like runes, sigils, crystal accents, and arcane glows onto clothing  
  and hair.            
