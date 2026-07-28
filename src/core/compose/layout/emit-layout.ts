import type {
  PbLayoutV1,
  FlowLayoutIntent,
  CommonLayoutIntent,
  GridLayoutIntent,
} from '../schema/packets';

export type EmitPbLayoutInput = {
  mode: PbLayoutV1['mode'];
  common?: CommonLayoutIntent;
  flow?: FlowLayoutIntent;
  grid?: PbLayoutV1['grid'];
  absolute?: PbLayoutV1['absolute'];
  overlay?: PbLayoutV1['overlay'];
  constraint?: PbLayoutV1['constraint'];
};

export function emitPbLayout(input: EmitPbLayoutInput): PbLayoutV1 {
  const packet: PbLayoutV1 = {
    contract: 'PB-LAYOUT-v1',
    version: '1.0.0',
    mode: input.mode,
  };
  if (input.common) packet.common = input.common;
  if (input.flow) packet.flow = input.flow;
  if (input.grid) packet.grid = input.grid;
  if (input.absolute) packet.absolute = input.absolute;
  if (input.overlay) packet.overlay = input.overlay;
  if (input.constraint) packet.constraint = input.constraint;
  return packet;
}

/** Lower flow layout intent to plain CSS property bag (web authority). */
export function lowerFlowToCss(intent: FlowLayoutIntent): Record<string, string> {
  return {
    display: 'flex',
    flexDirection: intent.direction,
    gap: `${intent.gapPx ?? 0}px`,
    flexWrap: intent.wrap ? 'wrap' : 'nowrap',
    alignItems: mapAlign(intent.align),
    justifyContent: mapJustify(intent.justify),
  };
}

function mapAlign(a?: FlowLayoutIntent['align']): string {
  switch (a) {
    case 'start': return 'flex-start';
    case 'end': return 'flex-end';
    case 'center': return 'center';
    case 'stretch': return 'stretch';
    case 'baseline': return 'baseline';
    default: return 'stretch';
  }
}

function mapJustify(j?: FlowLayoutIntent['justify']): string {
  switch (j) {
    case 'start': return 'flex-start';
    case 'end': return 'flex-end';
    case 'center': return 'center';
    case 'space-between': return 'space-between';
    case 'space-around': return 'space-around';
    case 'space-evenly': return 'space-evenly';
    default: return 'flex-start';
  }
}

/** Serialize a CSS box value (1, 2, or 4 values) in CSS order. */
function boxToCss(
  value: number | [number, number] | [number, number, number, number],
): string {
  if (typeof value === 'number') return `${value}px`;
  return value.map((v) => `${v}px`).join(' ');
}

/**
 * Lower common layout intent to a plain CSS property bag.
 * Emits only declared constraints; never invents defaults.
 */
export function lowerCommonToCss(intent: CommonLayoutIntent): Record<string, string> {
  const css: Record<string, string> = {};
  if (intent.paddingPx !== undefined) css.padding = boxToCss(intent.paddingPx);
  if (intent.marginPx !== undefined) css.margin = boxToCss(intent.marginPx);
  if (intent.minWidthPx !== undefined) css.minWidth = `${intent.minWidthPx}px`;
  if (intent.maxWidthPx !== undefined) css.maxWidth = `${intent.maxWidthPx}px`;
  if (intent.minHeightPx !== undefined) css.minHeight = `${intent.minHeightPx}px`;
  if (intent.maxHeightPx !== undefined) css.maxHeight = `${intent.maxHeightPx}px`;
  if (intent.writingDirection !== undefined) css.direction = intent.writingDirection;
  return css;
}

function gridAlign(a?: GridLayoutIntent['align']): string {
  switch (a) {
    case 'start': return 'start';
    case 'end': return 'end';
    case 'center': return 'center';
    case 'baseline': return 'baseline';
    case 'stretch': return 'stretch';
    default: return 'stretch';
  }
}

function gridJustify(j?: GridLayoutIntent['justify']): string {
  switch (j) {
    case 'start': return 'start';
    case 'end': return 'end';
    case 'center': return 'center';
    case 'space-between': return 'space-between';
    case 'space-around': return 'space-around';
    case 'space-evenly': return 'space-evenly';
    default: return 'start';
  }
}

/**
 * Lower grid layout intent to a plain CSS property bag.
 * A two-value gap maps to [row, column]; a scalar applies to both axes.
 */
export function lowerGridToCss(intent: GridLayoutIntent): Record<string, string> {
  const css: Record<string, string> = {
    display: 'grid',
    gridTemplateColumns: intent.columns,
  };
  if (intent.rows !== undefined) css.gridTemplateRows = intent.rows;
  if (intent.gapPx !== undefined) {
    if (Array.isArray(intent.gapPx)) {
      css.rowGap = `${intent.gapPx[0]}px`;
      css.columnGap = `${intent.gapPx[1]}px`;
    } else {
      css.rowGap = `${intent.gapPx}px`;
      css.columnGap = `${intent.gapPx}px`;
    }
  }
  css.alignItems = gridAlign(intent.align);
  css.justifyContent = gridJustify(intent.justify);
  return css;
}
