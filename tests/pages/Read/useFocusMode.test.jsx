import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useFocusMode } from '../../../src/pages/Read/useFocusMode.js';

function Harness({ active, setActive, service }) {
  useFocusMode(active, setActive, service);
  return <div data-testid="harness" />;
}

describe('useFocusMode', () => {
  it('pressing Escape while active calls setActive(false)', () => {
    const setActive = vi.fn();
    const service = { stop: vi.fn() };
    render(<Harness active setActive={setActive} service={service} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setActive).toHaveBeenCalledWith(false);
  });

  it('Escape does nothing when inactive', () => {
    const setActive = vi.fn();
    const service = { stop: vi.fn() };
    render(<Harness active={false} setActive={setActive} service={service} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(setActive).not.toHaveBeenCalled();
  });

  it('fades ambience out on the active true to false transition', () => {
    const setActive = vi.fn();
    const service = { stop: vi.fn() };
    const { rerender } = render(<Harness active setActive={setActive} service={service} />);
    rerender(<Harness active={false} setActive={setActive} service={service} />);
    expect(service.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop ambience on initial inactive mount', () => {
    const service = { stop: vi.fn() };
    render(<Harness active={false} setActive={vi.fn()} service={service} />);
    expect(service.stop).not.toHaveBeenCalled();
  });
});
