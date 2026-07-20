import type { JsonValue, PbUiEventV1 } from '../schema/packets';

export type EmitPbUiEventInput = {
  type: string;
  sourceId: string;
  sequence: number;
  target?: string;
  payload?: JsonValue;
  correlationId?: string;
};

export function emitPbUiEvent(input: EmitPbUiEventInput): PbUiEventV1 {
  const event: PbUiEventV1 = {
    contract: 'PB-UI-EVENT-v1',
    version: '1.0.0',
    type: input.type,
    sourceId: input.sourceId,
    sequence: input.sequence,
  };
  if (input.target !== undefined) event.target = input.target;
  if (input.payload !== undefined) event.payload = input.payload;
  if (input.correlationId !== undefined) event.correlationId = input.correlationId;
  return event;
}
