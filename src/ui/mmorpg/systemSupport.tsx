import { useState, type ReactNode } from 'react';
import { useSystem } from '../../hooks/mmorpg/useGameUi';
import { useInteractions } from './interactions';
import { Button, EmptyState } from './primitives';
import type { SystemResource } from '../../lib/mmorpg/contracts';
export function ResourceState({ resource, children }: { resource: SystemResource; children: ReactNode }) {
  if (resource.state === 'loading') return <EmptyState title="Opening registry…" state="loading">Retrieving the current records.</EmptyState>;
  if (resource.state === 'error') return <EmptyState title="Registry unavailable" state="error">{resource.message || 'Please try again when the connection returns.'}</EmptyState>;
  if (resource.state === 'unavailable') return <EmptyState title="No records available">{resource.message || 'This system is not available in the current world.'}</EmptyState>;
  return <>{children}</>;
}
export function CommandButton({ system, command, args = {}, children, disabled = false, confirm = false }: { system: string; command: string; args?: Record<string, unknown>; children: ReactNode; disabled?: boolean; confirm?: boolean }) {
  const resource = useSystem(system); const api = useInteractions(); const [pending, setPending] = useState(false); const [armed, setArmed] = useState(false);
  const execute = async () => {
    const handler = resource.commands?.[command]; if (!handler || pending) return;
    if (confirm && !armed) { setArmed(true); return; }
    setPending(true);
    try { const receipt = await handler({ ...args, revision: resource.revision }); api.notify(receipt.message || (receipt.ok ? 'Request completed.' : 'Request could not be completed.'), receipt.ok ? 'informational' : 'warning'); }
    catch { api.notify('The request failed. Check your connection and try again.', 'warning'); }
    finally { setPending(false); setArmed(false); }
  };
  return <span className="sui-toolbar"><Button disabled={disabled || pending || resource.state !== 'ready' || !resource.commands?.[command]} onClick={execute} tone={armed ? 'danger' : 'normal'}>{pending ? 'Working…' : armed ? <>Confirm {children}</> : children}</Button>{armed && <Button onClick={() => setArmed(false)}>Cancel</Button>}</span>;
}
