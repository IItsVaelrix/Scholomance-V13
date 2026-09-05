import { useEffect, useRef } from 'react';

import { STUDIO_TABS, normalizeStudioTab } from './studio-tabs.js';

export function StudioTabBar({ activeTab, onSelect }) {
  const selected = normalizeStudioTab(activeTab);
  const tabRefs = useRef([]);

  useEffect(() => {
    const index = STUDIO_TABS.findIndex((tab) => tab.id === selected);
    tabRefs.current[index]?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [selected]);

  const selectAt = (index) => {
    const wrappedIndex = (index + STUDIO_TABS.length) % STUDIO_TABS.length;
    const next = STUDIO_TABS[wrappedIndex];
    onSelect(next.id);
    tabRefs.current[wrappedIndex]?.focus();
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectAt(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectAt(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectAt(STUDIO_TABS.length - 1);
    }
  };

  return (
    <nav className="pb-studio-tabs" aria-label="PixelBrain studio workspaces">
      <div className="pb-studio-tab-scroll" role="tablist" aria-orientation="horizontal">
        {STUDIO_TABS.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`pb-studio-tab-${tab.id}`}
              aria-controls={`pb-studio-panel-${tab.id}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`pb-studio-tab${isSelected ? ' is-active' : ''}`}
              title={tab.description}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span className="pb-studio-tab-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="pb-studio-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
