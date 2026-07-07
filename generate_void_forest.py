import json
import os

scdl_path = "assets/tilesets/void_forest/void_forest_tileset.scdl"
manifest_path = "assets/tilesets/void_forest/void_forest_tileset.manifest.json"
palette_path = "assets/tilesets/void_forest/void_forest_palette.json"

os.makedirs(os.path.dirname(scdl_path), exist_ok=True)

# 1. Generate Palette JSON
palette_data = {
    "name": "Void Forest Palette",
    "aliases": {
        "void_black": "#03040A",
        "void_navy": "#070B1A",
        "deep_indigo": "#10163A",
        "pine_blue": "#17245C",
        "void_violet": "#32227A",
        "rim_violet": "#5146C8",
        "cold_cyan": "#20D8FF",
        "faint_cyan": "#0C7896",
        "astral_blue": "#2B6CFF",
        "shadow_purple": "#190B2E",
        "snow_ash": "#BBC7E8",
        "snow_shadow": "#566083",
        "root_dark": "#090711",
        "root_rim": "#282060",
        "rune_glow": "#48F2FF"
    },
    "materials": {
        "voidsoil": {"type": "basic", "base": "void_navy", "shadow": "void_black"},
        "voidbark": {"type": "basic", "base": "deep_indigo", "shadow": "void_black", "highlight": "pine_blue"},
        "voidpine": {"type": "basic", "base": "void_navy", "shadow": "void_black", "highlight": "rim_violet"},
        "astralmoss": {"type": "glow", "base": "astral_blue", "glow": "cold_cyan"},
        "corrupted_snow": {"type": "basic", "base": "snow_ash", "shadow": "snow_shadow"},
        "rune_glow": {"type": "glow", "base": "rune_glow", "glow": "cold_cyan", "radius": 2},
        "abyss": {"type": "basic", "base": "void_black", "shadow": "void_black"},
        "voidcrystal": {"type": "glow", "base": "rim_violet", "glow": "astral_blue"}
    }
}
with open(palette_path, "w") as f:
    json.dump(palette_data, f, indent=2)

# 2. Generate SCDL Source
scdl_source = """asset void_forest_tileset canvas 512x512

palette {
  void_black      = #03040A
  void_navy       = #070B1A
  deep_indigo     = #10163A
  pine_blue       = #17245C
  void_violet     = #32227A
  rim_violet      = #5146C8
  cold_cyan       = #20D8FF
  faint_cyan      = #0C7896
  astral_blue     = #2B6CFF
  shadow_purple   = #190B2E
  snow_ash        = #BBC7E8
  snow_shadow     = #566083
  root_dark       = #090711
  root_rim        = #282060
  rune_glow       = #48F2FF
}
"""

def get_offset(col, row):
    return col * 32, row * 32

manifest = {
    "tileset": "void_forest",
    "version": "1.0",
    "gridSize": 32,
    "atlasWidth": 512,
    "atlasHeight": 512,
    "tiles": [],
    "animations": []
}

def add_tile(col, row, tile_id, material, scdl_body, tags=None):
    ox, oy = get_offset(col, row)
    global scdl_source
    scdl_source += f"\npart {tile_id} material {material} {{\n"
    # translate commands inside part
    for line in scdl_body.split('\n'):
        if not line.strip(): continue
        tokens = line.strip().split()
        cmd = tokens[0]
        if cmd == "rect":
            x, y, w, h, color = int(tokens[1]), int(tokens[2]), int(tokens[3]), int(tokens[4]), tokens[5]
            scdl_source += f"  rect {x+ox} {y+oy} {w} {h} {color}\n"
        elif cmd == "cell":
            x, y, color = int(tokens[1]), int(tokens[2]), tokens[3]
            scdl_source += f"  cell {x+ox} {y+oy} {color}\n"
        elif cmd == "line":
            x1, y1, x2, y2, color = int(tokens[1]), int(tokens[2]), int(tokens[3]), int(tokens[4]), tokens[5]
            scdl_source += f"  line {x1+ox} {y1+oy} {x2+ox} {y2+oy} {color}\n"
        elif cmd == "polygon":
            coords = []
            for i in range(1, len(tokens)-1):
                if i % 2 != 0:
                    coords.append(str(int(tokens[i]) + ox))
                else:
                    coords.append(str(int(tokens[i]) + oy))
            color = tokens[-1]
            scdl_source += f"  polygon {' '.join(coords)} {color}\n"
        elif cmd == "circle":
            x, y, rad_cmd, r, color = int(tokens[1]), int(tokens[2]), tokens[3], int(tokens[4]), tokens[5]
            scdl_source += f"  circle {x+ox} {y+oy} radius {r} {color}\n"
        else:
            scdl_source += f"  {line}\n"
    scdl_source += f"}}\n"
    
    manifest["tiles"].append({
        "id": tile_id,
        "col": col,
        "row": row,
        "x": ox,
        "y": oy,
        "tags": tags or []
    })

# Row 0: Base Ground
add_tile(0, 0, "void_ground_plain", "voidsoil", "rect 0 0 32 32 void_navy\ncell 4 4 void_black\ncell 15 20 void_black\ncell 28 8 void_black", ["ground"])
add_tile(1, 0, "void_ground_noise_a", "voidsoil", "rect 0 0 32 32 void_navy\ncell 2 3 void_black\ncell 10 12 void_black\ncell 20 5 void_black\ncell 18 25 void_black\ncell 30 30 void_black", ["ground"])
add_tile(2, 0, "void_ground_cracked", "voidsoil", "rect 0 0 32 32 void_navy\nline 5 5 15 15 void_black\nline 15 15 25 10 void_black", ["ground"])
add_tile(3, 0, "void_ground_cyan_fleck", "voidsoil", "rect 0 0 32 32 void_navy\ncell 12 14 faint_cyan\ncell 13 14 cold_cyan\ncell 22 28 faint_cyan", ["ground"])
add_tile(4, 0, "void_ground_violet_fleck", "voidsoil", "rect 0 0 32 32 void_navy\ncell 8 8 void_violet\ncell 16 16 void_violet\ncell 24 24 void_violet", ["ground"])

# Rows 1-2: Autotile Terrain Edges
add_tile(0, 1, "void_ground_to_abyss_n", "voidsoil", "rect 0 0 32 16 void_black\nrect 0 16 32 16 void_navy\nline 0 16 32 16 deep_indigo", ["edge", "abyss_n"])
add_tile(1, 1, "void_ground_to_abyss_s", "voidsoil", "rect 0 0 32 16 void_navy\nrect 0 16 32 16 void_black\nline 0 15 32 15 deep_indigo", ["edge", "abyss_s"])

# Row 3: Dark Root Path
add_tile(0, 3, "root_path_center", "voidbark", "rect 0 0 32 32 void_navy\nrect 8 0 16 32 root_dark\nline 8 0 8 32 root_rim\nline 23 0 23 32 root_rim\ncell 12 12 void_violet", ["path"])
add_tile(1, 3, "root_path_horizontal", "voidbark", "rect 0 0 32 32 void_navy\nrect 0 8 32 16 root_dark\nline 0 8 32 8 root_rim\nline 0 23 32 23 root_rim", ["path"])

# Row 4: Raised Terrain / Cliffs
add_tile(0, 4, "void_cliff_face", "voidbark", "rect 0 0 32 32 root_dark\nline 4 0 4 32 void_black\nline 16 0 16 32 void_black\nline 28 0 28 32 void_black", ["cliff"])
add_tile(1, 4, "void_cliff_top", "voidsoil", "rect 0 0 32 32 void_navy\nline 0 31 32 31 deep_indigo", ["cliff_top"])

# Rows 5-7: Void Tree Assets (Sparse jagged branches, tall silhouettes)
# Sapling
add_tile(0, 5, "void_pine_sapling_1x1", "voidpine", "rect 14 16 4 16 root_dark\nline 15 16 15 32 root_rim\npolygon 16 2 24 18 8 18 void_navy\nline 10 17 22 17 rim_violet\ncell 16 4 rim_violet", ["tree"])
# Tree Trunk Base
add_tile(2, 5, "void_pine_medium_trunk", "voidpine", "rect 12 0 8 32 root_dark\nline 13 0 13 32 void_black\nline 18 0 18 32 root_rim\ncell 15 15 void_violet", ["tree", "trunk"])
# Tree Mid Section with jagged branches
add_tile(2, 6, "void_pine_medium_mid", "voidpine", "rect 12 0 8 32 root_dark\nline 13 0 13 32 void_black\nline 18 0 18 32 root_rim\npolygon 16 0 30 16 16 20 void_navy\npolygon 16 8 4 24 16 28 void_navy\nline 18 15 28 15 rim_violet\nline 6 23 16 23 rim_violet", ["tree", "branches"])
# Tree Top
add_tile(2, 7, "void_pine_medium_top", "voidpine", "rect 14 16 4 16 root_dark\npolygon 16 2 26 24 6 24 void_navy\nline 8 23 24 23 rim_violet\ncell 16 4 faint_cyan", ["tree", "top"])

# Row 8: Debris
add_tile(0, 8, "exposed_roots", "voidbark", "rect 0 0 32 32 void_navy\nline 4 28 28 4 root_dark\nline 5 28 29 4 root_rim\nline 12 20 20 28 root_dark\nline 13 20 21 28 root_rim", ["debris", "roots"])

# Row 9: Arcane Forest Props
add_tile(0, 9, "rune_stone", "rune_glow", "rect 0 0 32 32 void_navy\nrect 10 10 12 16 root_dark\nline 10 10 22 10 root_rim\ncell 16 16 cold_cyan\ncell 16 18 cold_cyan\nline 14 20 18 20 rune_glow", ["prop", "rune"])
add_tile(1, 9, "cyan_flame_wisp", "rune_glow", "rect 0 0 32 32 void_navy\ncircle 16 16 radius 4 cold_cyan\ncircle 16 16 radius 2 faint_cyan", ["prop", "wisp"])

# Row 10: Animated Tiles
add_tile(0, 10, "cyan_rune_pulse_f0", "rune_glow", "rect 0 0 32 32 void_navy\nrect 10 10 12 12 void_black\ncell 16 16 cold_cyan", ["anim", "rune_pulse_0"])
add_tile(1, 10, "cyan_rune_pulse_f1", "rune_glow", "rect 0 0 32 32 void_navy\nrect 42 10 12 12 void_black\ncircle 48 16 radius 2 cold_cyan\ncell 48 16 rune_glow", ["anim", "rune_pulse_1"])
add_tile(2, 10, "cyan_rune_pulse_f2", "rune_glow", "rect 0 0 32 32 void_navy\nrect 74 10 12 12 void_black\ncircle 80 16 radius 4 cold_cyan\ncell 80 16 rune_glow", ["anim", "rune_pulse_2"])
add_tile(3, 10, "cyan_rune_pulse_f3", "rune_glow", "rect 0 0 32 32 void_navy\nrect 106 10 12 12 void_black\ncircle 112 16 radius 2 cold_cyan\ncell 112 16 rune_glow", ["anim", "rune_pulse_3"])

manifest["animations"].append({
    "id": "cyan_rune_pulse_4f",
    "frames": ["cyan_rune_pulse_f0", "cyan_rune_pulse_f1", "cyan_rune_pulse_f2", "cyan_rune_pulse_f3"],
    "durationMs": 800
})

# Rows 11-12: Tactical Readability Tiles
add_tile(0, 11, "walkable_marker_hidden", "voidsoil", "rect 0 0 32 32 void_navy\npolygon 16 4 28 16 16 28 4 16 deep_indigo", ["tactical", "walkable"])
add_tile(1, 11, "blocked_terrain_indicator", "abyss", "rect 0 0 32 32 void_navy\npolygon 16 4 28 16 16 28 4 16 shadow_purple\nline 8 8 24 24 void_violet\nline 24 8 8 24 void_violet", ["tactical", "blocked"])

scdl_source += "\nexport json png svg\n"

with open(scdl_path, "w") as f:
    f.write(scdl_source)

with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)

print("Generated SCDL, Palette, and Manifest successfully.")
