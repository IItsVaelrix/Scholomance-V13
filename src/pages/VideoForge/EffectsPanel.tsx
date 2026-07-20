import React from 'react';
import type { TimelineClip, VideoProjectPacketV1 } from '../../video/editor/core/video-project-packet';
import { useEffectMutator } from './hooks/useEffectMutator';
import { getAllEffects, getEffect } from '../../video/editor/core/effect-registry';

export interface EffectsPanelProps {
  activeClip: TimelineClip | null;
  updateProject: (updater: (p: VideoProjectPacketV1) => VideoProjectPacketV1) => void;
}

export function EffectsPanel({ activeClip, updateProject }: EffectsPanelProps) {
  const effectMutator = useEffectMutator(updateProject);
  if (!activeClip) return null;

  function addEffectToClipLocal(clipId: string, effectId: string) {
    effectMutator.addEffect(clipId, effectId);
  }

  return (
    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #334155', paddingTop: 8, marginTop: 6 }}>
      <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.8 }}>EFFECTS (Phase 5) + Green Screen (Phase 6)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 4 }}>
        {getAllEffects().map(ef => (
          <button key={ef.id} onClick={() => addEffectToClipLocal(activeClip.id, ef.id)} style={{fontSize:9}}>
            +{ef.name}
          </button>
        ))}
      </div>
      {(activeClip.effects || []).length > 0 && (
        <div style={{fontSize:9, opacity:0.8, marginBottom: 4}}>
          Stack: {(activeClip.effects || []).sort((a: any,b: any)=>a.order-b.order).map((e: any) => {
            const def = getEffect(e.effectId);
            return def ? def.name : '?';
          }).join(' → ')}
        </div>
      )}
      
      {(activeClip.effects || []).map((eff: any) => (
         <div key={eff.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
           <span style={{ fontSize: 10 }}>{getEffect(eff.effectId)?.name || eff.effectId}</span>
           <button onClick={() => effectMutator.removeEffect(eff.id)} style={{ fontSize: 9, color: '#f87171' }}>Remove</button>
         </div>
      ))}

      <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6 }}>
        Chroma Key (Phase 6): Add to video clips for green/blue screen. Use color picker below. Keyframes supported on threshold/softness/spill.
      </div>

      {(activeClip.effects || []).some((e: any) => e.effectId === 'chroma-key') && (
        <div style={{ marginTop: 4 }}>
          <label htmlFor="videoforge-key-color" style={{ fontSize: 10 }}>Key Color: </label>
          <input
            id="videoforge-key-color"
            type="color"
            defaultValue="#00ff00"
            onChange={(e) => {
              const chromaEff = (activeClip.effects || []).find((eff: any) => eff.effectId === 'chroma-key');
              if (chromaEff) {
                effectMutator.updateEffectParam(chromaEff.id, 'keyColor', e.target.value);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
