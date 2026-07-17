import { forgeCharacter, compileEffectsBytecode } from '../../../lib/pixelbrain.adapter.js';

// Convert [r, g, b] float vec3 to Phaser integer colour (0xRRGGBB).
function vec3ToInt([r, g, b]) {
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

// Convert PNG Uint8Array → data URL for Phaser texture loading.
function pngBytesToDataUrl(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return 'data:image/png;base64,' + btoa(bin);
}

function svgToDataUrl(svg) {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// Minimal CHARACTER-SPEC-v1 for NPC enemies — deterministic from school name.
export function npcSpec(school) {
  const SCHOOL_SKIN = {
    VOID: 'skin_voidborne', PSYCHIC: 'skin_light',
    SONIC: 'skin_medium', ALCHEMY: 'skin_dark', WILL: 'skin_light',
  };
  const SCHOOL_HAIR = {
    VOID: 'hair_void', PSYCHIC: 'hair_black',
    SONIC: 'hair_brown', ALCHEMY: 'hair_red', WILL: 'hair_blonde',
  };
  const SCHOOL_EYE = {
    VOID: 'eye_void_glow', PSYCHIC: 'eye_blue',
    SONIC: 'eye_green', ALCHEMY: 'eye_brown', WILL: 'eye_brown',
  };
  const sk = SCHOOL_SKIN[school] ?? 'skin_medium';
  const hr = SCHOOL_HAIR[school] ?? 'hair_black';
  const ey = SCHOOL_EYE[school] ?? 'eye_brown';
  return {
    contract: 'CHARACTER-SPEC-v1',
    id: `npc.${school.toLowerCase()}.v1`,
    class: 'character',
    archetype: 'human',
    canvas: { width: 32, height: 48, gridSize: 1 },
    seed: school.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0),
    bytecode: 'VW-SCHOLAR-COMMON-RESONANT',
    presentation: { gender: 'feminine', heightClass: 'average', buildClass: 'average' },
    directions: ['south'],
    materials: { skin: sk, hair: hr, eyes: ey },
    body: { profile: 'character.body.human.androgynous' },
    face: [
      { id: 'leftEye',  profile: 'character.face.eye.round', attach: { parent: 'body', at: 'face.eyeLeft' } },
      { id: 'rightEye', profile: 'character.face.eye.round', attach: { parent: 'body', at: 'face.eyeRight' } },
      { id: 'nose',     profile: 'character.face.nose.small', attach: { parent: 'body', at: 'face.nose' } },
      { id: 'mouth',    profile: 'character.face.mouth.small', attach: { parent: 'body', at: 'face.mouth' } },
    ],
    hair: { profile: 'character.hair.short', params: { color: hr }, attach: { parent: 'body', at: 'headTop' } },
    clothing: [
      { id: 'bottom', profile: 'character.clothing.bottom.beginnerPants' },
      { id: 'top',    profile: 'character.clothing.top.beginnerRobe' },
      { id: 'shoes',  profile: 'character.clothing.shoes.beginnerBoots' },
    ],
    combatProfile: { school },
  };
}

/**
 * Load the south-facing forged sprite into Phaser as a texture.
 * Returns the texture key once the addBase64 promise resolves.
 *
 * @param {string} key         — Unique texture key for this character
 * @param {object} spec        — CHARACTER-SPEC-v1
 * @param {object} scene       — Phaser scene
 * @returns {Promise<string>}  — Resolves to `key` once loaded
 */
export async function bake(key, spec, scene) {
  if (scene.textures.exists(key)) return key;

  const generated = forgeCharacter({ ...spec, directions: ['south'] }, { scale: 4 });
  const pngBytes = generated?.sprites?.south;
  const dataUrl = pngBytes ? pngBytesToDataUrl(pngBytes) : null;
  if (!dataUrl) throw new Error(`[CharacterShaderRenderer] no renderable texture for ${key}`);

  await new Promise((resolve, reject) => {
    scene.textures.addBase64(key, dataUrl);
    // addBase64 fires 'addtexture' on the TextureManager when done.
    scene.textures.once('addtexture-' + key, resolve);
    scene.textures.once('onerror',           reject);
  });

  return key;
}

/**
 * Apply Phaser 4 GPU postFX effects to a sprite.
 * Call this right after creating the sprite in _buildUnit.
 *
 * @param {Phaser.GameObjects.Image} sprite
 * @param {object} uniforms   — output of compileEffectsBytecode(spec)
 * @param {object|null} enhancements — ShaderEnhancements from localStorage (or null)
 * @param {Phaser.Scene} scene
 */
export function applyEffects(sprite, uniforms, enhancements, scene) {
  const glowIntensity = enhancements?.glowIntensity ?? uniforms.u_glowIntensity;
  const atmoOpacity   = enhancements?.atmosphereOpacity ?? uniforms.u_atmosphereOpacity;

  // School-coloured outer glow (GPU filter).
  const glowColor = vec3ToInt(uniforms.u_schoolGlow);
  const outerStrength = Math.round(glowIntensity * 6);
  sprite.postFX.addGlow(glowColor, outerStrength, 0, false, 0.1, 8);

  // Foot aura — a radial gradient graphics object placed behind the sprite.
  if (atmoOpacity > 0.05 && scene) {
    const aura = scene.add.graphics();
    const auraColor = vec3ToInt(uniforms.u_schoolGlow);
    aura.fillStyle(auraColor, atmoOpacity * 0.6);
    aura.fillEllipse(sprite.x, sprite.y + sprite.displayHeight * 0.45,
                     sprite.displayWidth * 1.4, sprite.displayHeight * 0.25);
    // Depth: just below the sprite.
    aura.setDepth(sprite.depth - 0.1);
  }
}

/**
 * Bake textures for all combat actors.
 * Player actor (isPlayer===true) uses scholomance_active_actor.spec from localStorage if present.
 *
 * @param {Array<{id, side, school, isPlayer}>} actors
 * @param {Phaser.Scene} scene
 * @returns {Promise<Map<string, {textureKey, uniforms, enhancements}>>}
 */
export async function bakeAll(actors, scene) {
  const result = new Map();

  for (const actor of actors) {
    const textureKey = `char_${actor.id}`;

    let spec;
    let enhancements = null;

    if (actor.isPlayer) {
      try {
        // Key is 'scholomance_active_actor' (set by handleEnterVoid in ActorForgeLab).
        // Task 6 adds `spec` and `shaderEnhancements` fields to this stored object.
        const stored = JSON.parse(localStorage.getItem('scholomance_active_actor') ?? 'null');
        spec = stored?.spec ?? npcSpec(actor.school ?? 'SONIC');
        enhancements = stored?.shaderEnhancements ?? null;
      } catch {
        spec = npcSpec(actor.school ?? 'SONIC');
      }
    } else {
      spec = npcSpec(actor.school ?? 'SONIC');
    }

    try {
      await bake(textureKey, spec, scene);
      const uniforms = compileEffectsBytecode(spec);
      result.set(actor.id, { textureKey, uniforms, enhancements });
    } catch (err) {
      console.error(`[CharacterShaderRenderer] bake failed for actor ${actor.id}:`, err);
      // Fall through — ResonanceScene has a diamond fallback for missing textures.
    }
  }

  return result;
}
