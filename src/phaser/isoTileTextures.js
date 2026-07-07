/** Shared combat iso tile spritesheet keys + loader helpers. */

export const ISO_GRASS_SHEET_KEY = 'iso-grass-sheet';
export const ISO_WATER_SHEET_KEY = 'iso-water-sheet';

export const ISO_TILE_SHEET_PATHS = Object.freeze({
  [ISO_GRASS_SHEET_KEY]: '/assets/combat/iso-tiles/grass-sheet.png',
  [ISO_WATER_SHEET_KEY]: '/assets/combat/iso-tiles/water-sheet.png',
});

export const ISO_TILE_SHEET_FRAMES = Object.freeze({
  frameWidth: 80,
  frameHeight: 45,
});

/**
 * @param {import('phaser').Loader.LoaderPlugin} loader
 */
export function queueIsoTileTextures(loader) {
  if (!loader.scene.textures.exists(ISO_GRASS_SHEET_KEY)) {
    loader.spritesheet(
      ISO_GRASS_SHEET_KEY,
      ISO_TILE_SHEET_PATHS[ISO_GRASS_SHEET_KEY],
      ISO_TILE_SHEET_FRAMES,
    );
  }
  if (!loader.scene.textures.exists(ISO_WATER_SHEET_KEY)) {
    loader.spritesheet(
      ISO_WATER_SHEET_KEY,
      ISO_TILE_SHEET_PATHS[ISO_WATER_SHEET_KEY],
      ISO_TILE_SHEET_FRAMES,
    );
  }
}

/**
 * @param {import('phaser').Scene} scene
 */
export function hasIsoTileTextures(scene) {
  return scene.textures.exists(ISO_GRASS_SHEET_KEY)
    && scene.textures.exists(ISO_WATER_SHEET_KEY);
}

/**
 * @param {import('phaser').Scene} scene
 * @returns {Promise<boolean>}
 */
export function ensureIsoTileTextures(scene) {
  if (hasIsoTileTextures(scene)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const onComplete = () => resolve(hasIsoTileTextures(scene));
    const onError = (file) => {
      console.error('[iso-tiles] failed to load texture', file?.key, file?.url);
    };

    scene.load.once('complete', onComplete);
    scene.load.on('loaderror', onError);
    queueIsoTileTextures(scene.load);

    if (!scene.load.isLoading()) {
      scene.load.start();
    }
  });
}