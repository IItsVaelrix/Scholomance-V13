import random

def point_in_polygon(x, y, polygon):
    n = len(polygon)
    inside = False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# Polygons
inner_face = [[32,11],[38,16],[45,20],[50,29],[52,39],[51,55],[46,69],[39,80],[32,86],[25,80],[18,69],[13,55],[12,39],[14,29],[19,20],[26,16]]
ruby_diamond = [[32,34],[41,43],[32,55],[23,43]]

colors = ["deep_shadow", "charcoal_steel", "dark_iron"]
random.seed(1337)

texture_cells = []
sigil_center = (32, 44)
for x in range(10, 55):
    for y in range(10, 90):
        # We also want to avoid the sigil ring which is radius 15
        dx = x - sigil_center[0]
        dy = y - sigil_center[1]
        dist_sq = dx*dx + dy*dy
        
        if point_in_polygon(x, y, inner_face) and not point_in_polygon(x, y, ruby_diamond):
            if dist_sq > 16*16:
                if random.random() < 0.18:
                    c = random.choice(colors)
                    texture_cells.append(f"  cell {x} {y} {c}")

scdl_content = """asset infernal_crusader_kiteshield_refined_v2 canvas 64x96

palette {
  deep_shadow = #0D0F12
  obsidian_iron = #1B1D22
  charcoal_steel = #30343B
  dark_iron = #4A4F57
  ash_gray = #7A8088
  rim_highlight = #A8AFB7
  obsidian_red = #2B0F13
  lava_red = #C61D1D
  ember_orange = #FF6A1A
  molten_yellow = #FFC33A
  ruby_core = #B0002A
  ruby_bright = #FF3D5A
  glow_highlight = #FFE9E9
  white_hot = #FFFFFF
}

part outer_rim_heavy material voidsteel {
  polygon 32 1 38 6 47 10 55 20 59 34 58 57 53 72 45 84 32 94 19 84 11 72 6 57 5 34 9 20 17 10 26 6 deep_shadow
  polygon 32 7 38 12 46 16 53 26 55 37 54 56 49 70 41 81 32 88 23 81 15 70 10 56 9 37 11 26 18 16 26 12 charcoal_steel
}

part face_plate_armored material blacksteel {
  polygon 32 11 38 16 45 20 50 29 52 39 51 55 46 69 39 80 32 86 25 80 18 69 13 55 12 39 14 29 19 20 26 16 obsidian_iron
  
""" + "\n".join(texture_cells) + """

  line 32 12 32 33 dark_iron
  line 32 55 32 85 dark_iron
  
  line 27 18 17 27 dark_iron
  line 17 27 14 42 dark_iron
  line 37 18 47 27 dark_iron
  line 47 27 50 42 dark_iron
  
  line 26 70 17 59 dark_iron
  line 17 59 14 43 dark_iron
  line 38 70 47 59 dark_iron
  line 47 59 50 43 dark_iron
}

part lava_fissures_branching material shadow_fire {
  line 32 36 32 31 lava_red
  line 32 31 30 27 lava_red
  line 30 27 31 21 lava_red
  line 31 21 29 17 lava_red
  line 29 17 30 12 lava_red
  
  line 29 38 25 33 lava_red
  line 25 33 23 28 lava_red
  line 23 28 18 24 lava_red
  line 18 24 15 20 lava_red
  line 15 20 12 21 lava_red
  
  line 35 38 39 33 lava_red
  line 39 33 42 28 lava_red
  line 42 28 47 24 lava_red
  line 47 24 51 21 lava_red
  
  line 24 44 19 44 lava_red
  line 19 44 15 42 lava_red
  line 15 42 11 43 lava_red
  line 11 43 8 41 lava_red
  
  line 40 44 45 44 lava_red
  line 45 44 49 42 lava_red
  line 49 42 54 43 lava_red
  line 54 43 56 41 lava_red
  
  line 32 53 32 59 lava_red
  line 32 59 31 66 lava_red
  line 31 66 33 72 lava_red
  line 33 72 32 80 lava_red
  line 32 80 32 88 lava_red
  
  line 28 51 24 57 lava_red
  line 24 57 21 64 lava_red
  line 21 64 18 69 lava_red
  line 18 69 16 74 lava_red
  
  line 36 51 40 57 lava_red
  line 40 57 43 64 lava_red
  line 43 64 46 70 lava_red
  line 46 70 48 75 lava_red
  
  line 22 28 19 29 obsidian_red
  line 19 29 17 32 obsidian_red
  
  line 42 28 45 29 obsidian_red
  line 45 29 47 32 obsidian_red
  
  line 19 64 16 64 obsidian_red
  line 16 64 14 67 obsidian_red
  
  line 45 64 48 64 obsidian_red
  line 48 64 50 67 obsidian_red
  
  line 32 63 29 67 obsidian_red
  line 29 67 28 71 obsidian_red
  
  line 32 63 35 67 obsidian_red
  line 35 67 36 71 obsidian_red
  
  glow radius 3
}

part central_sigil_ring_heavy material holy_steel {
  ring 32 44 radius 15 width 6 deep_shadow
  ring 32 44 radius 15 width 3 dark_iron
  ring 32 44 radius 12 width 1 rim_highlight
  
  line 32 20 32 68 rim_highlight
  line 12 44 52 44 rim_highlight
  
  polygon 32 24 35 30 29 30 ash_gray
  polygon 32 64 35 58 29 58 ash_gray
  polygon 12 44 18 41 18 47 ash_gray
  polygon 52 44 46 41 46 47 ash_gray
}

part ruby_core_faceted material ruby {
  polygon 32 34 41 43 32 55 23 43 ruby_core
  
  polygon 32 34 37 41 32 43 27 40 ruby_bright
  polygon 23 43 32 43 29 50 25 48 lava_red
  polygon 41 43 32 43 35 50 38 48 ruby_core
  polygon 29 50 35 50 32 55 obsidian_red
  
  cell 29 38 glow_highlight
  cell 30 37 white_hot
  cell 31 38 glow_highlight
  cell 34 40 glow_highlight
  cell 28 42 white_hot
  
  glow radius 4
}

part lower_tip_reinforcement material voidsteel {
  polygon 32 72 42 82 36 89 32 92 28 89 22 82 charcoal_steel
  
  line 32 74 32 91 rim_highlight
  line 25 82 31 88 dark_iron
  line 39 82 33 88 ash_gray
  
  line 32 80 32 85 lava_red
  line 30 83 34 83 lava_red
  cell 32 83 ember_orange
}

export json png aseprite phaser svg
"""

with open("docs/references/infernal_crusader_kiteshield_refined_v2.scdl", "w") as f:
    f.write(scdl_content)

print("Generated v2 scdl.")
