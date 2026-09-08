/**
 * build-plane — A2: the canvas Z axis.
 *
 * Authoring happens on an *active plane* `{ axis, index }`. The axis is the
 * plane normal (the depth direction); the index is the active slice along it.
 * The default axis is `z`, so the canvas you see is the front XY face at a
 * chosen depth — matching the iso "front face" intuition.
 *
 * In-plane cursor coordinates `(u, v)` map to the two non-normal axes:
 *   normal z → (u→x, v→y)   front view (u right, v up)
 *   normal y → (u→x, v→z)   top-down view
 *   normal x → (u→z, v→y)   side view (v up)
 *
 * All functions are pure. See PDR SCHOL-ENC-PDR-VOXEDIT-CONVENTIONS-v1.0 §A2.
 */

// For each normal axis: the [u-axis, v-axis] it spans.
const PLANE_UV = Object.freeze({
  x: ['z', 'y'],
  y: ['x', 'z'],
  z: ['x', 'y'],
});

// Volume dimension field that measures depth along each axis.
const AXIS_DIM = Object.freeze({ x: 'width', y: 'height', z: 'depth' });

/** Create an active build plane. Defaults to the z (depth) axis at index 0. */
export function createPlane(axis = 'z', index = 0) {
  return { axis, index };
}

/** Map an in-plane cursor `(u, v)` on `plane` to a volume coordinate. */
export function planeToVoxel(plane, u, v) {
  const [uAxis, vAxis] = PLANE_UV[plane.axis];
  const out = { x: 0, y: 0, z: 0 };
  out[uAxis] = u;
  out[vAxis] = v;
  out[plane.axis] = plane.index;
  return out;
}

/** Read the in-plane `(u, v)` coordinates of a volume point on `plane`. */
export function voxelToPlane(plane, point) {
  const [uAxis, vAxis] = PLANE_UV[plane.axis];
  return { u: point[uAxis], v: point[vAxis] };
}

/** Clamp a plane's index to the volume's extent along its axis. */
export function clampPlane(plane, vol) {
  const max = vol[AXIS_DIM[plane.axis]] - 1;
  const index = Math.max(0, Math.min(max, plane.index));
  return { axis: plane.axis, index };
}
