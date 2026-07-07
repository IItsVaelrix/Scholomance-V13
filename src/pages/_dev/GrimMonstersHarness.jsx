import React from 'react';
import SlimePortrait from '../../components/monsters/SlimePortrait.jsx';
import './GrimMonstersHarness.css';

export default function GrimMonstersHarness() {
  console.log('[GrimMonstersHarness] mounted');
  return (
    <div
      className="grim-monsters-harness"
      style={{ background: '#222', minHeight: '100vh' }}
    >
      <header className="grim-monsters-harness__header">
        <h1>GrimDesign — Monster Asset Preview</h1>
        <p>
          Live render of <code>src/components/monsters/SlimePortrait</code>.
          If you can read this and see the three bordered cells below, the
          harness is up.
        </p>
      </header>

      <section
        className="grim-monsters-harness__grid"
        style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '24px' }}
      >
        {VARIANTS.map((v) => (
          <div
            key={v.name}
            className="grim-monsters-harness__cell"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '12px',
              border: '2px solid lime',
              background: '#111',
            }}
          >
            <SlimePortrait
              name={v.name}
              school={v.school}
              effectClass={v.effectClass}
              rarity={v.rarity}
              h={v.h}
              s={v.s}
              l={v.l}
              variant={v.variant}
            />
            <span
              className="grim-monsters-harness__note"
              style={{ color: '#fff', fontSize: '12px' }}
            >
              {v.note}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

const VARIANTS = [
  {
    name: 'Slime',
    school: 'WILL',
    effectClass: 'TRANSCENDENT',
    rarity: 'INEXPLICABLE',
    h: 356, s: 83, l: 52,
    variant: 'slime',
    note: 'default grimdesign output',
  },
  {
    name: 'Crimson Ooze',
    school: 'WILL',
    effectClass: 'TRANSCENDENT',
    rarity: 'INEXPLICABLE',
    h: 0, s: 78, l: 48,
    variant: 'crimsonOoze',
    note: 'pure-red tweak (SCDL variant)',
  },
  {
    name: 'Ember Jelly',
    school: 'WILL',
    effectClass: 'HARMONIC',
    rarity: 'RARE',
    h: 14, s: 90, l: 56,
    variant: 'slime',
    note: 'warmer / brighter (uses default sprite)',
  },
];
