type IndexedPaletteDockProps = {
  palette: string[];
  fgColor: string;
  bgColor: string;
  onFg: (color: string) => void;
  onBg: (color: string) => void;
  reduced?: boolean;
  heading?: string;
};

export function IndexedPaletteDock({
  palette,
  fgColor,
  bgColor,
  onFg,
  onBg,
  reduced,
  heading = "Indexed palette",
}: IndexedPaletteDockProps) {
  return (
    <section className="pbs-dock" aria-label={heading}>
      <header>
        <h3>{heading}</h3>
        <code>
          {palette.length} / 32
        </code>
      </header>
      <div className="pbs-fgbg">
        <label>
          <span>Foreground</span>
          <input type="color" aria-label="Foreground color" value={fgColor} onChange={(event) => onFg(event.target.value)} />
          <input value={fgColor} aria-label="Foreground hex" onChange={(event) => onFg(event.target.value)} />
        </label>
        <label>
          <span>Background</span>
          <input type="color" aria-label="Background color" value={bgColor} onChange={(event) => onBg(event.target.value)} />
          <input value={bgColor} aria-label="Background hex" onChange={(event) => onBg(event.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className="pbs-button"
        aria-label="Swap foreground and background"
        title="Swap foreground and background (X)"
        onClick={() => {
          const nextFg = bgColor;
          const nextBg = fgColor;
          onFg(nextFg);
          onBg(nextBg);
        }}
      >
        Swap
      </button>
      <p className="pbs-note">Right-click or secondary pencil paints the background color.</p>
      <div className="pbs-swatch-grid">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            className={
              color.toLowerCase() === fgColor.toLowerCase()
                ? "is-fg"
                : color.toLowerCase() === bgColor.toLowerCase()
                  ? "is-bg"
                  : ""
            }
            style={{ background: color }}
            aria-label={`Select ${color}`}
            title={color}
            onClick={(event) => (event.shiftKey ? onBg(color) : onFg(color))}
          />
        ))}
      </div>
      {reduced ? <p className="pbs-note">Import reduced to 32 colors.</p> : null}
    </section>
  );
}
