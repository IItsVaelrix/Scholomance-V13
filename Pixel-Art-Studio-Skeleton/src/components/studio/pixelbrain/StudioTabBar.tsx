import { useEffect, useRef } from "react";
import {
  Activity,
  Compass,
  FlaskConical,
  GraduationCap,
  Layers,
  Leaf,
  Library,
  PenTool,
  Sparkles,
  Zap,
} from "lucide-react";
import { STUDIO_TABS, normalizeStudioTab } from "./studio-tabs.js";

const TAB_ICONS = {
  canvas: PenTool,
  blueprint: Compass,
  foundry: Leaf,
  amps: Zap,
  mutations: FlaskConical,
  finish: Sparkles,
  mentor: GraduationCap,
  library: Library,
  diagnostics: Activity,
};

type StudioTabBarProps = {
  activeTab: string;
  onSelect: (tab: string) => void;
};

export function StudioTabBar({ activeTab, onSelect }: StudioTabBarProps) {
  const selected = normalizeStudioTab(activeTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const index = STUDIO_TABS.findIndex((tab) => tab.id === selected);
    tabRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  const selectAt = (index: number) => {
    const wrapped = (index + STUDIO_TABS.length) % STUDIO_TABS.length;
    const next = STUDIO_TABS[wrapped]!;
    onSelect(next.id);
    tabRefs.current[wrapped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAt(STUDIO_TABS.length - 1);
    }
  };

  return (
    <nav className="pbs-tabs" aria-label="PixelBrain Studio workspaces">
      <div className="pbs-tab-scroll" role="tablist" aria-orientation="horizontal">
        {STUDIO_TABS.map((tab, index) => {
          const Icon = TAB_ICONS[tab.id as keyof typeof TAB_ICONS] ?? Layers;
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`pbs-tab-${tab.id}`}
              aria-controls={`pbs-panel-${tab.id}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={isSelected ? "is-active" : ""}
              title={tab.description}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
              <span className="pbs-tab-index">{String(index + 1).padStart(2, "0")}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
