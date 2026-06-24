import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FocusModeButton from '../../../src/pages/Read/FocusModeButton.jsx';

describe('FocusModeButton', () => {
  it('renders the engraved M and reflects active state', () => {
    render(<FocusModeButton active={false} onToggle={() => {}} />);
    const btn = screen.getByRole('button', { name: /focus mode/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveTextContent('M');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<FocusModeButton active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /focus mode/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('applies the variant class', () => {
    render(<FocusModeButton active onToggle={() => {}} variant="floating" />);
    expect(screen.getByRole('button')).toHaveClass('focus-mode-btn--floating');
  });
});
