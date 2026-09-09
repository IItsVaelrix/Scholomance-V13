import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useGameChannel } from '../../hooks/mmorpg/useGameUi';
import type { WindowRecord } from '../../lib/mmorpg/contracts';
import { UI_LIMITS } from '../../lib/mmorpg/state';
import { Icon, IconButton, Button } from './primitives';
import { useInteractions, type TooltipState } from './interactions';
export function Window({ record, title, focused, children }: { record: WindowRecord; title: string; focused: boolean; children: ReactNode }) {
  const api = useInteractions(); const ref = useRef<HTMLElement>(null);
  const gesture = useRef<{ mode: 'move' | 'resize'; x: number; y: number; record: WindowRecord }>();
  useEffect(() => {
    if (record.status === 'opening') {
      ref.current?.focus();
      const timer = setTimeout(() => api.window({ type: 'settle', id: record.id }), 220);
      return () => clearTimeout(timer);
    }
  }, [record.status, record.id, api]);
  const start = (event: React.PointerEvent<HTMLButtonElement>, mode: 'move' | 'resize') => {
    event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { mode, x: event.clientX, y: event.clientY, record };
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current; if (!g) return;
    const dx = event.clientX - g.x; const dy = event.clientY - g.y;
    api.window({ type: g.mode, id: record.id, geometry: g.mode === 'move' ? { x: g.record.x + dx, y: g.record.y + dy } : { width: g.record.width + dx, height: g.record.height + dy } });
  };
  const end = () => { gesture.current = undefined; api.window({ type: 'settle', id: record.id }); };
  const keyboardGeometry = (event: React.KeyboardEvent<HTMLButtonElement>, mode: 'move' | 'resize') => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    const delta = directions[event.key]; if (!delta) return; event.preventDefault();
    api.window({ type: mode, id: record.id, geometry: mode === 'move' ? { x: record.x + delta[0], y: record.y + delta[1] } : { width: record.width + delta[0], height: record.height + delta[1] } });
  };
  return <>{record.modal && <div className="sui-modal-backdrop" />}<section ref={ref} role="dialog" aria-modal={record.modal || undefined} aria-label={title} tabIndex={-1} className="sui-window" data-focused={focused} data-state={record.status} style={{ left: record.x, top: record.y, width: record.width, height: record.height }} onPointerDownCapture={() => { if (!focused) api.window({ type: 'focus', id: record.id }); }} onFocusCapture={() => { if (!focused) api.window({ type: 'focus', id: record.id }); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || [])].filter(el => el.offsetParent !== null);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><header className="sui-window-header"><Icon name={record.id} /><h2>{title}</h2><IconButton className="sui-window-grip" icon="move" label={`Move ${title}; use arrow keys`} onPointerDown={e => start(e, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={e => keyboardGeometry(e, 'move')} />{!record.modal && <Button aria-label={`Minimize ${title}`} onClick={() => api.window({ type: 'minimize', id: record.id })}>−</Button>}<IconButton icon="close" label={`Close ${title}`} onClick={() => api.window({ type: 'close', id: record.id })} /></header><div className="sui-window-body">{children}</div><footer className="sui-window-footer"><span>Scholomance • {title}</span><span>Esc to close</span><Button className="sui-window-resize" aria-label={`Resize ${title}; use arrow keys`} onPointerDown={e => start(e, 'resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={e => keyboardGeometry(e, 'resize')}>⌟</Button></footer></section></>;
}
export function TooltipHost() {
  const tooltip = useGameChannel<TooltipState | null>('tooltip', null); const ref = useRef<HTMLDivElement>(null); const api = useInteractions();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!tooltip?.anchor.isConnected) { if (tooltip) api.tooltip(null); return; }
    const anchor = tooltip.anchor.getBoundingClientRect(); const tip = ref.current?.getBoundingClientRect(); if (!tip) return;
    const gap = UI_LIMITS.tooltipGap;
    setPosition({ left: Math.max(gap, Math.min(anchor.right + gap, window.innerWidth - tip.width - gap)), top: Math.max(gap, Math.min(anchor.top, window.innerHeight - tip.height - gap)) });
    const hide = () => api.tooltip(null);
    window.addEventListener('resize', hide); window.addEventListener('scroll', hide, true);
    return () => { window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); };
  }, [tooltip, api]);
  return tooltip ? <div ref={ref} id={tooltip.id} role="tooltip" className="sui-tooltip" style={position}>{tooltip.content}</div> : null;
}
