export function validPacket(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: "pixelbrain.render.v1",
    id: "lantern",
    schemaVersion: 1,
    canvas: {
      width: 8,
      height: 8,
      cellSize: 2,
      transparent: true,
      background: "#00000000",
    },
    coordinates: [
      {
        snappedX: 0,
        snappedY: 0,
        z: 0,
        color: "#ff000080",
        alpha: 0.5,
      },
      { snappedX: 2, snappedY: 0, z: 0, color: "#00ff00" },
    ],
    ...overrides,
  };
}

export function withCoordinate(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return validPacket({
    coordinates: [{
      snappedX: 0,
      snappedY: 0,
      z: 0,
      color: "#ffffff",
      ...overrides,
    }],
  });
}
