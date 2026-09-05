import { useMemo, useState } from "react";
import { Check, Monitor, Palette, Zap } from "lucide-react";

const EXTENSIONS = [
  {
    id: "style-8bit",
    name: "8-Bit Style",
    description: "Snap to classic 8-bit geometry",
    icon: Palette,
    type: "STYLE",
  },
  {
    id: "style-crt",
    name: "CRT Scanlines",
    description: "Preview a retro monitor finish",
    icon: Monitor,
    type: "STYLE",
  },
  {
    id: "physics-stretch-squash",
    name: "Stretch & Squash",
    description: "Expose cartoon deformation controls",
    icon: Zap,
    type: "PHYSICS",
  },
  {
    id: "physics-gravity",
    name: "Gravity",
    description: "Expose gravitational pull controls",
    icon: Zap,
    type: "PHYSICS",
  },
] as const;

type ExtensionSelectorProps = {
  selectedExtensions: string[];
  onChange: (ids: string[]) => void;
};

export function ExtensionSelector({ selectedExtensions, onChange }: ExtensionSelectorProps) {
  const [expandedType, setExpandedType] = useState<string | null>("STYLE");
  const groups = useMemo(
    () =>
      EXTENSIONS.reduce<Record<string, (typeof EXTENSIONS)[number][]>>((result, extension) => {
        (result[extension.type] ??= []).push(extension);
        return result;
      }, {}),
    [],
  );

  return (
    <div className="pbs-extension-selector">
      {Object.entries(groups).map(([type, extensions]) => (
        <section key={type}>
          <button
            type="button"
            className="pbs-extension-heading"
            aria-expanded={expandedType === type}
            onClick={() => setExpandedType((current) => (current === type ? null : type))}
          >
            <span>{type}</span>
            <span aria-hidden="true">{expandedType === type ? "−" : "+"}</span>
          </button>
          {expandedType === type && (
            <div className="pbs-extension-list">
              {extensions.map((extension) => {
                const selected = selectedExtensions.includes(extension.id);
                const Icon = extension.icon;
                return (
                  <button
                    type="button"
                    key={extension.id}
                    role="checkbox"
                    aria-checked={selected}
                    className={selected ? "is-selected" : ""}
                    onClick={() =>
                      onChange(
                        selected
                          ? selectedExtensions.filter((id) => id !== extension.id)
                          : [...selectedExtensions, extension.id],
                      )
                    }
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>
                      <strong>{extension.name}</strong>
                      <small>{extension.description}</small>
                    </span>
                    {selected && (
                      <Check className="pbs-extension-check" size={16} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
