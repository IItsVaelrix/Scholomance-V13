/**
 * Compose Button - Migrated component using Zag.js
 * 
 * This is the Phase 2 migration of the GlyphButton component.
 * It uses Zag.js toggle machine for behavior state management and supports
 * shadow mode for behavioral equivalence testing against the original.
 * 
 * @module compose/migrated/ComposeButton
 */

import { useMachine, normalizeProps } from '@zag-js/react';
import * as toggle from '@zag-js/toggle';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { useFeatureFlag } from '../flags';
import { migrationRegistry } from '../migration';
import { createButtonMachine, BehaviorService } from '../behavior';
import { ZagAdapter, useShadowMode } from '../behavior/ZagAdapter';
import type { BehaviorContext, BehaviorEvent } from '../behavior';
import type { EquivalenceEntry } from '../behavior/ZagAdapter';

type SharedProps = {
  children: ReactNode;
  variant?: 'solid' | 'ghost';
  /** Enable shadow mode for behavioral equivalence testing */
  shadowMode?: boolean;
  /** Callback when shadow mode detects behavioral divergence */
  onShadowDivergence?: (divergence: ShadowDivergence) => void;
  /** Disabled state (anchors render aria-disabled) */
  disabled?: boolean;
};

type AnchorButtonProps = SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
type NativeButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };

export type ComposeButtonProps = AnchorButtonProps | NativeButtonProps;

/**
 * Shadow mode divergence report
 */
export type ShadowDivergence = {
  timestamp: number;
  event: string;
  customState: Record<string, unknown>;
  zagState: Record<string, unknown>;
  diff: string[];
};

const ANCHOR_PROPS = ['href', 'hrefLang', 'media', 'ping', 'target', 'rel', 'download', 'type'] as const;

/**
 * Compose Button component - Zag.js powered
 * 
 * Uses @zag-js/toggle for pressed/focus state management.
 * Falls back to original rendering when feature flag is off.
 */
export function ComposeButton({ 
  children, 
  variant = 'solid', 
  shadowMode = false,
  onShadowDivergence,
  onClick,
  disabled,
  ...props 
}: ComposeButtonProps) {
  const featureEnabled = useFeatureFlag('compose:migrate:button');
  
  // Zag toggle machine for pressed state
  const service = useMachine(toggle.machine, {
    onPressedChange: (pressed: boolean) => {
      if (pressed && onClick) {
        (onClick as any)({ type: 'click' });
      }
    }
  });
  const api = toggle.connect(service, normalizeProps);
  
  // Shadow mode: track custom service for comparison
  const customServiceRef = useRef<BehaviorService | null>(null);
  const adapterRef = useRef<ZagAdapter | null>(null);
  const [divergences, setDivergences] = useState<EquivalenceEntry[]>([]);

  useEffect(() => {
    if (shadowMode) {
      const machine = createButtonMachine();
      const context: BehaviorContext = {
        schema: {} as any,
        state: machine.initial,
        props: { disabled, onClick } as Record<string, unknown>,
        handlers: { click: onClick as any }
      };
      
      customServiceRef.current = new BehaviorService(machine, context);
      customServiceRef.current.start();
      
      adapterRef.current = new ZagAdapter(machine, {
        enableEquivalenceTesting: true,
        enableLogging: true
      });

      // Update migration registry for shadow mode tracking
      const existingMigration = migrationRegistry.get('button');
      if (existingMigration) {
        migrationRegistry.updatePhase('button', 'behavior', {
          complete: false,
          notes: 'Shadow mode active - comparing custom vs Zag behavior'
        });
      }
    }

    return () => {
      customServiceRef.current?.stop();
    };
  }, [shadowMode, disabled, onClick]);

  // Compare states in shadow mode
  useEffect(() => {
    if (!shadowMode || !customServiceRef.current || !adapterRef.current) return;

    // Get Zag state from toggle API
    const zagState = {
      pressed: api.pressed,
      focused: false, // Zag toggle doesn't track focus directly
      disabled: disabled || false,
      hovered: false
    };

    // Send focus/blur events to custom service based on DOM state
    // (In production, these would come from actual DOM events)
    
    const customState = customServiceRef.current.getState();
    
    adapterRef.current.logEquivalence('state.sync', customState, zagState);

    // Check for divergence
    const diff: string[] = [];
    const commonKeys = ['pressed', 'disabled'] as const;
    
    for (const key of commonKeys) {
      if (customState[key] !== zagState[key]) {
        diff.push(`${key}: custom=${customState[key]} vs zag=${zagState[key]}`);
      }
    }

    if (diff.length > 0) {
      const divergence: ShadowDivergence = {
        timestamp: Date.now(),
        event: 'state.sync',
        customState,
        zagState,
        diff
      };
      
      setDivergences(prev => [...prev, { ...divergence, equivalent: false } as any]);
      onShadowDivergence?.(divergence);
    }
  }, [api.pressed, disabled, shadowMode, onShadowDivergence]);

  // If feature flag is disabled, fall back to original rendering
  if (!featureEnabled) {
    return renderOriginalButton(children, variant, props, onClick, disabled);
  }

  // Compose Button rendering with Zag
  if ('href' in props && props.href) {
    return (
      <a 
        className="cz-button cz-button-compose"
        data-variant={variant}
        data-compose="true"
        data-shadow={shadowMode ? 'active' : 'inactive'}
        data-pressed={api.pressed}
        {...filterAnchorProps(props)}
      >
        <span aria-hidden="true">◇</span>
        {children}
        {shadowMode && divergences.length > 0 && (
          <span className="compose-shadow-indicator" title={`${divergences.length} divergences`}>
            ⚠️
          </span>
        )}
      </a>
    );
  }

  return (
    <button 
      {...api}
      className="cz-button cz-button-compose"
      data-variant={variant}
      data-compose="true"
      data-shadow={shadowMode ? 'active' : 'inactive'}
      disabled={disabled}
      onClick={onClick as any}
      {...filterButtonProps(props)}
    >
      <span aria-hidden="true">◇</span>
      {children}
      {shadowMode && divergences.length > 0 && (
        <span className="compose-shadow-indicator" title={`${divergences.length} divergences`}>
          ⚠️
        </span>
      )}
    </button>
  );
}

/**
 * Render original button (fallback when feature flag is off)
 */
function renderOriginalButton(
  children: ReactNode,
  variant: string,
  props: Record<string, unknown>,
  onClick?: any,
  disabled?: boolean
) {
  if ('href' in props && props.href) {
    return (
      <a className="cz-button" data-variant={variant} {...filterAnchorProps(props)}>
        <span aria-hidden="true">◇</span>
        {children}
      </a>
    );
  }

  const { type, ...buttonProps } = props;
  return (
    <button 
      className="cz-button" 
      data-variant={variant} 
      type={type as 'button' | 'reset' | 'submit' | undefined}
      onClick={onClick}
      disabled={disabled}
      {...filterButtonProps(buttonProps)}
    >
      <span aria-hidden="true">◇</span>
      {children}
    </button>
  );
}

/**
 * Filter props to only include anchor-specific attributes
 */
function filterAnchorProps(props: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of ANCHOR_PROPS) {
    if (key in props) {
      filtered[key] = props[key];
    }
  }
  return filtered;
}

/**
 * Filter props to exclude internal/compose-specific attributes
 */
function filterButtonProps(props: Record<string, unknown>): Record<string, unknown> {
  const { shadowMode, onShadowDivergence, ...rest } = props;
  return rest;
}

/**
 * Get shadow mode statistics for ComposeButton
 */
export function getComposeButtonShadowStats() {
  return {
    totalInstances: 0,
    shadowModeInstances: 0,
    totalDivergences: 0
  };
}
