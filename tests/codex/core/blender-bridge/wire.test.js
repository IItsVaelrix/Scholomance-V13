/**
 * Wire projection tests. The hazard set is Blender's, not Lua's:
 * no nulls (None on an RNA property raises TypeError), int32 only,
 * categoricals interned (shaders cannot read STRING attributes),
 * and colour policy declared rather than inferred.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toPythonWire, serializeWirePacket, assertNoNulls, WireError } from '../../../../codex/core/blender-bridge/wire.js';

const packet = JSON.parse(readFileSync('output/holy_fire_claymore.pbrain', 'utf8'));

describe('toPythonWire', () => {
  it('projects every coordinate into parallel int32 attribute arrays', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.coordinateCount).toBe(788);
    expect(w.positions.x).toHaveLength(788);
    expect(w.attributes.pb_emphasis).toHaveLength(788);
    expect(Number.isInteger(w.attributes.pb_emphasis[0])).toBe(true);
  });

  it('quantizes emphasis at the UNIT scale', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.attributes.pb_emphasis[0]).toBe(142857);
    expect(w.scales.pb_emphasis).toBe(1e6);
  });

  it('interns partId to int and publishes the table', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(typeof w.intern.partId.blade).toBe('number');
    expect(Number.isInteger(w.attributes.pb_part_id[0])).toBe(true);
  });

  it('maps a null categorical to ABSENT_ID rather than emitting null', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.attributes.pb_motif_role).toContain(-1);
  });

  it('emits exactly eight energy channels, zero-filled where absent', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(Object.keys(w.energy).sort()).toEqual(['0','1','2','3','4','5','6','7']);
    expect(w.energy['2'][0]).toBe(184699);
    expect(w.energy['7'].every((v) => v === 0)).toBe(true);
  });

  it('contains no nulls anywhere', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(() => assertNoNulls(w)).not.toThrow();
  });

  it('carries the source checksum verbatim for string-equality verification', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.sourceChecksum).toBe('6DB23A1A');
  });

  it('refuses an unknown colour policy instead of defaulting', () => {
    expect(() => toPythonWire(packet, { colorPolicy: 'PRETTY' })).toThrow(WireError);
    expect(() => toPythonWire(packet, {})).toThrow(WireError);
  });

  it('is deterministic — same packet yields byte-identical JSON', () => {
    const a = serializeWirePacket(packet, { colorPolicy: 'EXACT' });
    const b = serializeWirePacket(packet, { colorPolicy: 'EXACT' });
    expect(a).toBe(b);
  });
});

describe('assertNoNulls', () => {
  it('names the path of the offending null', () => {
    expect(() => assertNoNulls({ a: { b: [1, null] } })).toThrow(/\$\.a\.b\[1\]/);
  });
});
