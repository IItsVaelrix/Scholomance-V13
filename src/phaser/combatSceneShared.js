/** Shared camera, input, and texture bootstrap for iso combat world scenes. */

const WALK_FRAME_COUNT = 8;

/**
 * @param {import('phaser').Scene} scene
 * @param {import('phaser').LoaderPlugin} load
 */
export function preloadPlayerRigAssets(load) {
  for (let i = 0; i <= WALK_FRAME_COUNT; i += 1) {
    load.image(`ideal-human-f${i}`, `/generated-assets/IdealHuman/IdealHuman-f${i}-png.png`);
    load.image(`body-noarms-f${i}`, `/generated-assets/IdealHuman/IdealHuman-body-noArms-f${i}-png.png`);
  }
  const segments = ['armR-upper', 'armR-fore', 'armR-hand', 'armL-upper', 'armL-fore', 'armL-hand'];
  for (const key of segments) {
    load.image(key, `/generated-assets/IdealHuman/${key}-png.png`);
  }
  load.image('armL-hand-palm', '/generated-assets/IdealHuman/armL-hand-palm-png.png');
}

/**
 * @param {import('phaser').Scene} scene
 */
export function ensureIceSmokeTexture(scene) {
  if (scene.textures.exists('ice-smoke')) return;

  const w = 128;
  const h = 128;
  const canvas = scene.textures.createCanvas('ice-smoke', w, h);
  const ctx = canvas.getContext();
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const ny = y / h;
      const n = Math.sin(nx * 12.7 + ny * 8.3) * 0.5 + 0.5;
      const dx = x - w / 2;
      const dy = y - h / 2;
      const r = Math.sqrt(dx * dx + dy * dy) / (w / 2);
      const edge = Math.max(0, 1 - r);
      const a = Math.min(1, n * edge * edge) * 0.95;
      const idx = (y * w + x) * 4;
      data[idx] = 240;
      data[idx + 1] = 248;
      data[idx + 2] = 255;
      data[idx + 3] = Math.floor(a * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  canvas.refresh();
}

/**
 * Centers the main camera on the iso board origin (0, 0).
 *
 * @param {import('phaser').Scene} scene
 * @param {{ scrollYOffset?: number, zoom?: number, enableDrift?: boolean }} [options]
 */
export function bootstrapIsoCamera(scene, options = {}) {
  const { width, height } = scene.scale;
  const scrollYOffset = options.scrollYOffset ?? 40;
  const zoom = options.zoom ?? 1.1;

  scene.cameras.main.setScroll(-width / 2, -height / 2 - scrollYOffset);
  scene.baseCameraZoom = zoom;
  scene.maxCameraZoom = options.maxZoom ?? 2.25;
  scene.cameraZoomStep = options.zoomStep ?? 0.1;
  scene.cameras.main.setZoom(zoom);

  const onResize = (gameSize) => {
    scene.cameras.main.setScroll(-gameSize.width / 2, -gameSize.height / 2 - scrollYOffset);
    scene.events.emit('iso-camera-resize', { width: gameSize.width, height: gameSize.height });
  };

  scene.scale.off('resize', scene._isoResizeHandler);
  scene._isoResizeHandler = onResize;
  scene.scale.on('resize', onResize);

  if (options.enableDrift) {
    scene.tweens.add({
      targets: scene.cameras.main,
      scrollX: scene.cameras.main.scrollX + 3,
      scrollY: scene.cameras.main.scrollY - 2,
      duration: 7000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Universal zoom via mouse wheel
  const minZoom = options.minZoom ?? 0.5;
  scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
    // Determine zoom direction: deltaY > 0 -> zoom out, deltaY < 0 -> zoom in
    const zoomDelta = deltaY > 0 ? -scene.cameraZoomStep : scene.cameraZoomStep;
    let newZoom = scene.cameras.main.zoom + zoomDelta;
    newZoom = Math.max(minZoom, Math.min(scene.maxCameraZoom, newZoom));
    scene.cameras.main.setZoom(newZoom);
  });
}

/**
 * @param {import('phaser').Scene} scene
 */
export function bootstrapScenePointerInput(scene) {
  scene.input.mouse.disableContextMenu();
}

/**
 * @param {import('phaser').Scene} scene
 * @param {import('phaser').Types.Input.Pointer} pointer
 */
export function pointerToWorld(scene, pointer) {
  const camera = scene.cameras.main;
  const x = pointer.worldX ?? (camera.scrollX + pointer.x / camera.zoom);
  const y = pointer.worldY ?? (camera.scrollY + pointer.y / camera.zoom);
  return { x, y };
}

/**
 * @param {import('phaser').Scene} scene
 * @param {import('phaser').Scene} sourceScene
 */
export function releaseTutorialTransitLock(sourceScene) {
  if (!sourceScene) return;
  sourceScene.cutsceneInputLock = false;
  sourceScene.polarisTransitActive = false;
}

/**
 * Only the active world scene should answer scene-context requests.
 *
 * @param {import('phaser').Scene} scene
 */
export function isWorldSceneActive(scene) {
  return Boolean(scene?.sys?.isActive?.());
}

/**
 * @param {import('phaser').Scene} scene
 * @param {() => void} emit
 */
export function bindActiveSceneContextRequest(scene, emit) {
  return () => {
    if (!isWorldSceneActive(scene)) return;
    emit();
  };
}