export default function FocusModeButton({ active, onToggle, variant = 'bar' }) {
  return (
    <button
      type="button"
      className={`focus-mode-btn focus-mode-btn--${variant}${active ? ' focus-mode-btn--active' : ''}`}
      aria-pressed={active}
      aria-label={active ? 'Exit focus mode' : 'Enter focus mode'}
      title={active ? 'Exit focus mode' : 'Focus mode'}
      onClick={onToggle}
    >
      <span className="focus-mode-btn__glyph" aria-hidden="true">M</span>
    </button>
  );
}
