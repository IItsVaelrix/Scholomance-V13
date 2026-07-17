shader_type canvas_item;

// VOID Dungeon Fighting Arena - full screen immersive
// Palette: purple, crimson, obsidian, indigo, silver
// Dungeon feel: abyssal stone halls, floating platforms, void rifts, glowing runes/crystals
// Free-roam combat space with depth, cover (pillars), hazards (pits)

uniform float resonance = 0.6;
uniform float time_scale = 1.0;

// Core palette
const vec3 OBSIDIAN = vec3(0.04, 0.035, 0.05);      // deep void black-purple
const vec3 INDIGO = vec3(0.12, 0.10, 0.28);         // dark indigo stone
const vec3 PURPLE = vec3(0.32, 0.18, 0.48);         // void purple
const vec3 CRIMSON = vec3(0.42, 0.08, 0.18);        // blood crimson accents
const vec3 SILVER = vec3(0.72, 0.74, 0.80);         // cold silver highlights/runes

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

float ridge(vec2 p) {
  return 1.0 - abs(2.0 * fbm(p) - 1.0);
}

void fragment() {
  vec2 uv = UV;
  float t = TIME * time_scale;
  vec2 centered = uv - 0.5;

  // === Background / Ceiling - abyssal void with indigo/purple depth ===
  vec3 col = mix(OBSIDIAN, INDIGO, uv.y * 0.6);
  float void_depth = ridge(centered * 3.0 + vec2(t * 0.02, 0.0));
  col = mix(col, PURPLE * 0.6, void_depth * 0.4);

  // Distant floating structures / dungeon ceiling arches (perspective)
  float arch = smoothstep(0.0, 0.15, abs(centered.x)) * (1.0 - uv.y);
  col = mix(col, OBSIDIAN * 0.3, arch * 0.5);

  // === Horizon / Mid-ground dungeon floor transition ===
  float horizon = 0.52;
  if (uv.y < horizon) {
    float wy = uv.y / horizon;
    // Upper void / distant dungeon walls
    col = mix(col, OBSIDIAN * 0.85, wy * 0.7);

    // Subtle rune lines or strata on "walls"
    float strata = fbm(vec2(uv.x * 9.0, uv.y * 3.5 + t * 0.015));
    col += PURPLE * strata * 0.15 * wy;

    // Central abyssal rift / focal point (crimson glow from below)
    vec2 sc = vec2(0.5, horizon * 0.7);
    float sd = distance((uv - sc) * vec2(1.2, 1.8), vec2(0.0));
    float rift = smoothstep(0.28, 0.0, sd);
    col = mix(col, CRIMSON * 0.7, rift * (0.5 + 0.5 * resonance));
    col += CRIMSON * smoothstep(0.12, 0.0, sd) * 0.4 * resonance;
  } else {
    // === Foreground Dungeon Floor - obsidian/indigo stone with silver/purple details ===
    float fy = (uv.y - horizon) / (1.0 - horizon);
    float persp = 1.0 / (fy * fy * 4.0 + 0.08);
    vec2 fp = vec2((uv.x - 0.5) * persp * 1.6, persp * 0.55 + t * 0.03);

    // Stone floor with cracks and tiles (dungeon masonry)
    float stone = 0.55 * fbm(fp * 1.2) + 0.45 * fbm(fp * 3.8);
    vec3 floor_col = mix(OBSIDIAN, INDIGO * 1.3, stone);

    // Tile lines / grout (silver hints)
    vec2 tile = fract(fp * 4.0);
    float grout = smoothstep(0.48, 0.52, max(abs(tile.x - 0.5), abs(tile.y - 0.5)));
    floor_col = mix(floor_col, SILVER * 0.25, grout * 0.35);

    // Crimson veins / blood runes in the stone
    float veins = ridge(fp * 2.2) * ridge(fp * 0.9 + vec2(t * 0.1, 0.0));
    floor_col = mix(floor_col, CRIMSON * 0.85, veins * 0.55 * smoothstep(0.3, 1.0, fy));

    // Purple glowing cracks / void seepage
    float cracks = smoothstep(0.75, 0.98, ridge(fp * 5.5));
    floor_col += PURPLE * cracks * 0.4 * resonance;

    // Floating platforms / broken dungeon floor edges (depth)
    float platform = smoothstep(0.15, 0.0, abs(fract(fp.x * 1.8) - 0.5) - 0.32);
    floor_col = mix(floor_col, INDIGO * 1.1, platform * 0.25 * (1.0 - fy * 0.6));

    col = floor_col;

    // Subtle silver highlights on raised edges
    float edges = smoothstep(0.65, 0.9, stone) * (1.0 - fy * 0.5);
    col += SILVER * edges * 0.15;
  }

  // === Vertical Dungeon Pillars / Columns (dungeon architecture for cover) ===
  float pillars = 0.0;
  for (int i = -2; i <= 2; i++) {
    float px = (uv.x - 0.5) + float(i) * 0.22;
    float pillar = 1.0 - smoothstep(0.035, 0.09, abs(px));
    pillar *= (1.0 - smoothstep(0.0, 0.9, uv.y));
    pillars = max(pillars, pillar);
  }
  col = mix(col, OBSIDIAN * 0.4, pillars * 0.6);

  // Silver/purple inlays on pillars
  float inlay = smoothstep(0.02, 0.0, abs(fract(uv.x * 18.0) - 0.5) - 0.008);
  col += (SILVER * 0.6 + PURPLE * 0.3) * inlay * pillars * 0.5;

  // === Abyssal Voids / Pits (crimson glow from below - hazards/cover) ===
  float pits = 0.0;
  for (int i = -1; i <= 1; i++) {
    vec2 pit_uv = vec2(uv.x + float(i) * 0.28, uv.y);
    float pit = smoothstep(0.08, 0.0, abs(pit_uv.x - 0.5 - float(i) * 0.05));
    pit *= smoothstep(0.6, 1.0, uv.y);
    pits = max(pits, pit);
  }
  col = mix(col, CRIMSON * 0.4, pits * 0.8);
  col += CRIMSON * 0.6 * pits * resonance * (0.5 + 0.5 * sin(t * 1.8));

  // === Glowing Runes / Silver Crystals (combat focal points) ===
  vec2 rune_uv = (uv - 0.5) * vec2(1.4, 1.0) + vec2(0.0, -0.15);
  float rune = 1.0 - length(rune_uv) * 3.2;
  rune = smoothstep(0.0, 0.35, rune) * (0.7 + 0.3 * sin(t * 2.2 + length(rune_uv) * 12.0));
  col += (SILVER + PURPLE * 0.6) * rune * 0.35 * (1.0 - uv.y * 0.4);

  // Vignette + depth falloff for full-screen dungeon immersion
  vec2 q = centered;
  q.x *= 1.4;
  float vig = smoothstep(1.25, 0.35, length(q));
  col *= vig * 0.9 + 0.1;

  // Overall resonance pulse (void breathing)
  col *= 0.92 + 0.16 * resonance * (0.5 + 0.5 * sin(t * 0.7));

  // Subtle chromatic aberration on edges for void feel
  float ca = length(centered) * 0.008;
  col.r += ca * 0.15;
  col.b -= ca * 0.1;

  COLOR = vec4(col, 1.0);
}
