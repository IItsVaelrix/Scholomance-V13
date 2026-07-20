import type { PbLayoutV1, FlowLayoutIntent, CommonLayoutIntent } from '../schema/packets';

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
