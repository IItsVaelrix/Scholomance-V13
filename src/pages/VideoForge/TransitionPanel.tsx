import React from 'react';
import type { TimelineClip, VideoProjectPacketV1 } from '../../video/editor/core/video-project-packet';
import { useTimelineMutator } from './hooks/useTimelineMutator';

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export interface TransitionPanelProps {
  activeClip: TimelineClip | null;
  updateProject: (updater: (p: VideoProjectPacketV1) => VideoProjectPacketV1) => void;
}

export function TransitionPanel({ activeClip, updateProject }: TransitionPanelProps) {
  const mutator = useTimelineMutator(updateProject);
  if (!activeClip) return null;
  const clip = activeClip;

  function addLegacyTransitionLocal(transitionId: 'crossfade' | 'wipe-left' | 'dip-to-color' | 'glitch', side: 'in' | 'out') {
    mutator.addLegacyTransition(clip.id, {
      id: makeId('tr'),
      transitionId,
      side,
      durationFrames: 15,
      params: {},
    });
  }

  return (
    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #334155', paddingTop: 8, marginTop: 6 }}>
      <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.8 }}>TRANSITIONS (Phase 4)</div>
      
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button onClick={() => addLegacyTransitionLocal('crossfade', 'in')} style={{fontSize:9}}>+ Crossfade In</button>
        <button onClick={() => addLegacyTransitionLocal('crossfade', 'out')} style={{fontSize:9}}>+ Crossfade Out</button>
        <button onClick={() => addLegacyTransitionLocal('wipe-left', 'out')} style={{fontSize:9}}>+ Wipe Left Out</button>
        <button onClick={() => addLegacyTransitionLocal('dip-to-color', 'in')} style={{fontSize:9}}>+ Dip In</button>
        <button onClick={() => addLegacyTransitionLocal('glitch', 'in')} style={{fontSize:9}}>+ Glitch In</button>
      </div>

      {(activeClip.transitions || []).map((tr: any, index: number) => (
         <div key={tr.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
           <span style={{ fontSize: 10 }}>{tr.transitionId} ({tr.side || 'explicit'})</span>
           <button onClick={() => mutator.removeLegacyTransition(activeClip.id, index)} style={{ fontSize: 9, color: '#f87171' }}>Remove</button>
         </div>
      ))}
    </div>
  );
}
