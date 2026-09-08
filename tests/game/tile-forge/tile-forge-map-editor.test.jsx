// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import TileForgeMapEditor from '../../../src/pages/internal/pixel-lotus/TileForgeMapEditor.jsx';
import { deserializeTileMap } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.map.js';

let savedBlob;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(type => type === '2d' ? {
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(), putImageData: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), strokeRect: vi.fn(),
  } : null);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1100, bottom: 680, width: 1100, height: 680 });
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('ImageData', class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } });
  URL.createObjectURL = vi.fn(blob => { savedBlob = blob; return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = () => render(<TileForgeMapEditor biome="void_forest" shaderMode="off" glowIntensity={1} atmosphereWarmth={1} />);
const canvas = () => screen.getByRole('application');
function stampAt(x, y) {
  // Default camera: 0.5x, origin (550,90), native grid step (40,20).
  const point = { clientX: 550 + (x - y) * 20, clientY: 90 + (x + y) * 10, button: 0, pointerId: 1 };
  fireEvent.pointerDown(canvas(), point); fireEvent.pointerUp(canvas(), point);
}
const blobText = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });

describe('Tile Forge map Studio interactions', () => {
  it('forges, places individual tiles, drags a stroke, and undoes the entire stroke', async () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Forge tile', exact: true }));
    expect(screen.getByText('1 assets')).toBeInTheDocument();
    stampAt(2, 2); stampAt(3, 2);
    expect(screen.getByText(/2 placements/)).toBeInTheDocument();
    fireEvent.pointerDown(canvas(), { clientX: 550, clientY: 170, button: 0 });
    fireEvent.pointerMove(canvas(), { clientX: 610, clientY: 200, buttons: 1 });
    fireEvent.pointerUp(canvas(), { clientX: 610, clientY: 200 });
    expect(screen.getByText(/6 placements/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(screen.getByText(/2 placements/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Redo', exact: true }));
    expect(screen.getByText(/6 placements/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save map/ }));
    const document = deserializeTileMap(await blobText(savedBlob));
    expect(document.instances).toHaveLength(6);
    expect(document.assets[0].scd128Record.scd128Wire).toHaveLength(128);
    expect(document.assets[0].scdlSource).toContain('SCDL 2');
  });
  it('honors layer locking, changes elevation, and supports keyboard placement', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Forge tile', exact: true }));
    fireEvent.click(screen.getByLabelText('Lock Terrain')); stampAt(2, 2);
    expect(screen.getByText(/0 placements/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/unlocked/);
    fireEvent.click(screen.getByLabelText('Lock Terrain'));
    fireEvent.change(screen.getByLabelText('Brush elevation'), { target: { value: '2' } });
    fireEvent.keyDown(canvas(), { key: 'ArrowRight' }); fireEvent.keyDown(canvas(), { key: 'Enter' });
    expect(screen.getByText(/1 placements/)).toBeInTheDocument();
    fireEvent.keyDown(canvas(), { key: 'z', ctrlKey: true });
    expect(screen.getByText(/0 placements/)).toBeInTheDocument();
  });
  it('compiles the starter SCDL, keeps variants separate, and rejects a broken file without losing work', async () => {
    mount(); fireEvent.click(screen.getByText('SCDL V2 · custom tile'));
    fireEvent.click(screen.getByRole('button', { name: 'Compile & add' }));
    expect(screen.getByText('1 assets')).toBeInTheDocument(); stampAt(2, 2);
    fireEvent.change(screen.getByLabelText('SCDL source'), { target: { value: 'broken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compile & add' }));
    expect(screen.getByText(/1 placements/)).toBeInTheDocument();
    const file = new File(['{}'], 'broken.json', { type: 'application/json' });
    file.text = async () => '{}';
    fireEvent.change(screen.getByLabelText('Open Tile Forge map file'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Unsupported map format/));
    expect(screen.getByText(/1 placements/)).toBeInTheDocument();
  });
  it('selects a placed instance, moves its origin, duplicates, and deletes independently', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Forge tile', exact: true })); stampAt(2, 2);
    fireEvent.click(screen.getByText('Placed tiles (1)'));
    fireEvent.click(screen.getByRole('button', { name: /Ground with soil.*2,2,0/ }));
    fireEvent.change(screen.getByLabelText('Selected tile x'), { target: { value: '5' } });
    expect(screen.getByLabelText('Selected tile x')).toHaveValue(5);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate', exact: true })); stampAt(6, 2);
    expect(screen.getByText(/2 placements/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete tile', exact: true }));
    expect(screen.getByText(/1 placements/)).toBeInTheDocument();
  });
});
