import { useMemo, useState } from 'react';
import { useGameChannel } from '../../hooks/mmorpg/useGameUi';
import { inventoryCommand, type InventorySnapshot } from '../../lib/mmorpg/gameUi.adapter';
import type { Item, DragPayload, Receipt } from '../../lib/mmorpg/contracts';
import { useInteractions, useDrag } from './interactions';
import { Badge, Button, EmptyState, ItemCard, Panel, SearchField, SectionHeader, Slot, Tabs } from './primitives';
const EMPTY_INVENTORY: InventorySnapshot = { slots: [], equipped: {}, revision: 0 };
export interface Appearance { name: string; image: string; assetId: string; width: number; height: number }
const LABELS: Record<string, string> = { head: 'Head', amulet: 'Amulet', shoulder: 'Shoulder', chest: 'Chest', weapon: 'Main hand', offhand: 'Off hand', ring1: 'Ring I', ring2: 'Ring II', legs: 'Legs', boots: 'Feet' };
export function CharacterPreview() {
  const appearance = useGameChannel<Appearance | null>('appearance', null);
  return <div className="sui-character-preview">{appearance?.image ? <img src={appearance.image} alt={`${appearance.name}, current game character`} data-asset-id={appearance.assetId} /> : <EmptyState title="Character loading">The world is preparing your appearance.</EmptyState>}</div>;
}
export function InventoryWindow() {
  const inventory = useGameChannel('inventory', EMPTY_INVENTORY); const appearance = useGameChannel<Appearance | null>('appearance', null);
  const api = useInteractions(); const drag = useDrag();
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('All'); const [sort, setSort] = useState('Position');
  const [selected, setSelected] = useState<{ index?: number; slot?: string }>({});
  const [compare, setCompare] = useState(false);
  const selectedItem = selected.index !== undefined ? inventory.slots[selected.index] : selected.slot ? inventory.equipped[selected.slot] : null;
  const rows = useMemo(() => inventory.slots.map((item, index) => ({ item, index })).filter(({ item }) => (!search || item?.name.toLowerCase().includes(search.toLowerCase())) && (category === 'All' || item?.type === category)).sort((a, b) => sort === 'Name' ? (a.item?.name || '~').localeCompare(b.item?.name || '~') : sort === 'Rarity' ? (a.item?.rarity || '~').localeCompare(b.item?.rarity || '~') : a.index - b.index), [inventory.slots, search, category, sort]);
  const execute = (command: string) => {
    const result = inventoryCommand(command, { ...selected, expectedId: selectedItem?.id });
    api.notify(result.ok ? command === 'equip' ? 'Equipment updated.' : 'Item returned to your inventory.' : result.message || 'Unable to update equipment.', result.ok ? 'informational' : 'warning');
  };
  const pickup = (item: Item, index?: number, slot?: string) => api.pickup({ kind: 'item', id: item.id, index, source: slot || 'inventory', revision: inventory.revision });
  const commit = (payload: DragPayload, index?: number, slot?: string): Receipt => {
    if (slot && payload.source === 'inventory') return inventoryCommand('equip', { index: payload.index, slot, expectedId: payload.id });
    if (index !== undefined && payload.source === 'inventory') return inventoryCommand('move', { index: payload.index, targetIndex: index, expectedId: payload.id });
    if (index !== undefined && payload.source in inventory.equipped) return inventoryCommand('unequip', { slot: payload.source, expectedId: payload.id });
    return { ok: false, message: 'Choose an inventory or compatible equipment slot.' };
  };
  const drop = (index?: number, slot?: string) => api.drop({ kind: slot ? 'equipment' : 'inventory', accepts: ['item'], revision: inventory.revision }, payload => commit(payload, index, slot));
  const slotProps = (item: Item | null, index?: number, slot?: string) => ({
    draggable: !!item, onDragStart: (e: React.DragEvent<HTMLButtonElement>) => { if (item) { pickup(item, index, slot); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); } },
    onDragEnd: () => api.cancel(), onDragOver: (e: React.DragEvent<HTMLButtonElement>) => { if (drag?.kind === 'item') e.preventDefault(); },
    onDrop: (e: React.DragEvent<HTMLButtonElement>) => { e.preventDefault(); drop(index, slot); },
    onClick: () => { if (drag) drop(index, slot); else setSelected({ index, slot }); },
    onDoubleClick: () => { if (item) { const receipt = inventoryCommand(slot ? 'unequip' : 'equip', { index, slot, expectedId: item.id }); if (!receipt.ok) api.notify(receipt.message || 'Cannot equip item', 'warning'); } },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.key === ' ' && item && !drag) { e.preventDefault(); pickup(item, index, slot); } },
    'data-drop': drag ? drag.kind === 'item' ? 'valid' : 'invalid' : undefined,
  });
  const equipment = Object.entries(inventory.equipped);
  const column = (entries: [string, Item | null][]) => <div className="sui-equipment-column">{entries.map(([slot, item]) => <div key={slot}><Slot item={item} label={LABELS[slot] || slot} selected={selected.slot === slot} {...slotProps(item, undefined, slot)} /><small>{LABELS[slot] || slot}</small></div>)}</div>;
  const compared = selectedItem ? Object.values(inventory.equipped).find(item => item && item.type === selectedItem.type && item !== selectedItem) : null;
  return <div className="sui-split"><div><h3 className="sui-character-name">{appearance?.name || 'Character'}</h3><small>Equipment &amp; appearance</small><div className="sui-equipment">{column(equipment.slice(0, Math.ceil(equipment.length / 2)))}<CharacterPreview />{column(equipment.slice(Math.ceil(equipment.length / 2)))}</div><SectionHeader title="Equipment" meta={`${equipment.filter(([, item]) => item).length} bound`} /><small>Appearance uses the current world model. Equipment visuals appear when supported by the character rig.</small></div><div><div className="sui-toolbar"><SearchField value={search} onChange={setSearch} label="Search inventory" /><select aria-label="Sort inventory" value={sort} onChange={e => setSort(e.target.value)}>{['Position', 'Name', 'Rarity'].map(value => <option key={value}>{value}</option>)}</select></div><Tabs options={['All', ...new Set(inventory.slots.filter(Boolean).map(item => item!.type))]} value={category} onChange={setCategory} /><SectionHeader title="Field inventory" meta={`${inventory.slots.filter(Boolean).length} / ${inventory.slots.length}`} /><div className="sui-inventory-grid">{rows.map(({ item, index }) => <Slot key={index} item={item} label={`Inventory slot ${index + 1}`} selected={selected.index === index} {...slotProps(item, index)} />)}</div>{!rows.length && <EmptyState title="No matching items">Try another search or category.</EmptyState>}<div className="sui-toolbar"><Badge>Space: pick up</Badge><Badge>Enter: place</Badge><Badge>Esc: cancel</Badge></div>{selectedItem ? <Panel inset><ItemCard item={selectedItem} compare={compare ? compared : null} /><div className="sui-toolbar"><Button tone="primary" onClick={() => execute(selected.slot ? 'unequip' : 'equip')}>{selected.slot ? 'Unequip' : 'Equip'}</Button><Button aria-pressed={compare} disabled={!compared} onClick={() => setCompare(!compare)}>Compare</Button><Button onClick={() => pickup(selectedItem, selected.index, selected.slot)}>Move item</Button></div></Panel> : <EmptyState title="Select an item">Inspect its properties, compare equipment, or move it into a compatible slot.</EmptyState>}</div></div>;
}
