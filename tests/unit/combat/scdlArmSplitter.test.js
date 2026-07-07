import { describe, expect, it } from 'vitest';
import { splitArms } from '../../../src/game/combat/scdlArmSplitter.js';

const SAMPLE = `asset IdealHuman canvas 64x128
palette {
  skin = #C08850
}
part torso material skin_light {
  rect 26 20 12 30 skin
}
part armR material skin_light {
  sphere 43 28 radius 4 skin
  polygon 41 33 47 33 46 43 42 43 skin
  rect 42 44 4 2 skinshade
  polygon 42 46 47 46 45 58 43 58 skin
  polygon 43 59 47 59 46 64 44 64 skin
}
part armL material skin_light {
  sphere 21 28 radius 4 skin
  polygon 17 33 23 33 22 43 18 43 skin
  polygon 18 46 23 46 21 58 19 58 skin
  polygon 17 59 21 59 20 64 18 64 skin
}
loop walk duration 800
frame 1 "a" {
  part armR material skin_light { polygon 41 30 47 30 46 43 42 43 skin }
}`;

describe('scdlArmSplitter', () => {
  const out = splitArms(SAMPLE);

  it('body keeps the torso and drops both arm parts (base and frame overrides)', () => {
    expect(out.bodyNoArms).toContain('part torso');
    expect(out.bodyNoArms).not.toContain('part armR');
    expect(out.bodyNoArms).not.toContain('part armL');
    expect(out.bodyNoArms).toContain('loop walk'); // walk preserved
  });

  it('emits six segment assets, each a standalone SCDL with the palette', () => {
    const keys = Object.keys(out.segments);
    expect(keys.sort()).toEqual(['armL-fore','armL-hand','armL-upper','armR-fore','armR-hand','armR-upper']);
    for (const text of Object.values(out.segments)) {
      expect(text).toMatch(/^asset /);
      expect(text).toContain('canvas 64x128');
      expect(text).toContain('palette');
    }
  });

  it('buckets primitives by Y-band', () => {
    expect(out.segments['armR-upper']).toContain('sphere 43 28'); // y28 -> upper
    expect(out.segments['armR-upper']).toContain('rect 42 44');   // y44 -> upper (elbow)
    expect(out.segments['armR-fore']).toContain('polygon 42 46'); // y46 -> fore
    expect(out.segments['armR-hand']).toContain('polygon 43 59'); // y59 -> hand
    expect(out.segments['armR-fore']).not.toContain('sphere 43 28');
  });
});
