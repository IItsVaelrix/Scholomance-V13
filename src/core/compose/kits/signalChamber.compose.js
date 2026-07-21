/**
 * Scholomance Signal Chamber Compose UI Kit
 *
 * Change classification: architectural UI-kit seed.
 * Canonical output: PB-UI-SCENE-v1.
 * Runtime values such as playback time, meter values, and device state are
 * represented by bindings, not embedded in the canonical scene packet.
 */

export const COMPOSE_CONTRACTS = Object.freeze({
  component: 'SCHOL-COMPONENT-DEFINITION-v1',
  scene: 'PB-UI-SCENE-v1',
  layout: 'PB-LAYOUT-v1',
  event: 'PB-UI-EVENT-v1',
});

export const SIGNAL_CHAMBER_VERSION = '1.0.0';

export const SIGNAL_CHAMBER_THEME_TOKENS = Object.freeze({
  contract: 'SCHOL-TOKEN-SET-v1',
  version: SIGNAL_CHAMBER_VERSION,
  id: 'listen-signal-chamber-theme',
  aliases: {
    auroraStart: '--ritual-aurora-start',
    auroraEnd: '--ritual-aurora-end',
    glow: '--ritual-glow',
    metal: '--ritual-metal',
    surface: '--ritual-surface',
    surfaceRaised: '--ritual-surface-raised',
    text: '--ritual-text',
    textMuted: '--ritual-text-muted',
    success: '--ritual-success',
    warning: '--ritual-warning',
    danger: '--ritual-danger',
  },
  motion: {
    fastMs: 150,
    standardMs: 360,
    slowMs: 600,
    breatheMs: 1600,
    glowRadiusPx: 12,
    phase: 'shared',
    reducedMotion: 'disable-breathe-preserve-state',
  },
  schools: {
    divination: {
      auroraStart: '#8d6316',
      auroraEnd: '#d8ab46',
      glow: '#c8942e',
    },
    alchemical: {
      auroraStart: '#557c42',
      auroraEnd: '#9bbf62',
      glow: '#84aa58',
    },
    resonance: {
      auroraStart: '#7550a5',
      auroraEnd: '#b27adb',
      glow: '#9a68ca',
    },
    vortex: {
      auroraStart: '#5f6779',
      auroraEnd: '#9fa8bd',
      glow: '#858fa7',
    },
    nullVoid: {
      auroraStart: '#087f82',
      auroraEnd: '#38e1db',
      glow: '#21c7c5',
    },
  },
});

function freezeDefinition(definition) {
  return Object.freeze({
    contract: COMPOSE_CONTRACTS.component,
    version: SIGNAL_CHAMBER_VERSION,
    states: [],
    events: [],
    capabilities: [],
    ...definition,
    provenance: Object.freeze({
      system: 'Scholomance Compose',
      source: 'listen-signal-chamber-ui-kit',
      version: SIGNAL_CHAMBER_VERSION,
      ...(definition.provenance ?? {}),
    }),
  });
}

export const SIGNAL_CHAMBER_DEFINITIONS = Object.freeze({
  'signal-chamber-shell': freezeDefinition({
    kind: 'signal-chamber-shell',
    description: 'Three-region Listen workspace with a central resonance instrument and transport deck.',
    anatomy: {
      rootRole: 'container',
      parts: [
        { id: 'heading', role: 'group', required: true },
        { id: 'apertureRail', role: 'container', required: true },
        { id: 'core', role: 'container', required: true },
        { id: 'parameterRail', role: 'container', required: true },
        { id: 'transport', role: 'group', required: true },
        { id: 'footer', role: 'group', required: false },
      ],
      slots: [
        { id: 'heading', accepts: ['signal-lock-plate'], min: 1, max: 1 },
        { id: 'apertureRail', accepts: ['aperture-rail'], min: 1, max: 1 },
        { id: 'core', accepts: ['resonance-core'], min: 1, max: 1 },
        { id: 'parameterRail', accepts: ['parameter-rail'], min: 1, max: 1 },
        { id: 'transport', accepts: ['transport-deck'], min: 1, max: 1 },
        { id: 'footer', accepts: ['signal-status-line'], min: 0, max: 1 },
      ],
    },
    accessibility: {
      nativeStrategy: 'hybrid',
      landmark: 'main',
      labelSource: 'props.ariaLabel',
      obligations: ['single-main-landmark', 'labelled-regions', 'reduced-motion'],
    },
    defaultLayout: 'layout://listen/signal-chamber-shell/v1',
    defaultVisuals: [
      'visual://listen/chamber-skin/v1',
      'visual://listen/chamber-frame/v1',
    ],
  }),

  'signal-lock-plate': freezeDefinition({
    kind: 'signal-lock-plate',
    description: 'Stable title plate for the current resonance target.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'eyebrow', role: 'group', required: true },
        { id: 'title', role: 'group', required: true },
        { id: 'frequency', role: 'group', required: true },
      ],
    },
    accessibility: {
      nativeStrategy: 'native',
      labelSource: 'props.title',
      obligations: ['heading-order'],
    },
    defaultLayout: 'layout://listen/lock-plate/v1',
    defaultVisuals: ['visual://listen/glass-panel/v1', 'visual://listen/pulse-dot/v1'],
  }),

  'aperture-rail': freezeDefinition({
    kind: 'aperture-rail',
    description: 'Selectable analysis-lens rail.',
    anatomy: {
      rootRole: 'container',
      parts: [
        { id: 'heading', role: 'group', required: true },
        { id: 'options', role: 'group', required: true },
        { id: 'presets', role: 'group', required: false },
      ],
      slots: [
        { id: 'options', accepts: ['aperture-option'], min: 1 },
        { id: 'presets', accepts: ['rune-preset'], min: 0 },
      ],
    },
    states: [
      { id: 'enabled', type: 'boolean', default: true },
      { id: 'selectedId', type: 'string', default: 'null-void' },
    ],
    events: [
      { type: 'LISTEN.APERTURE.SELECT', payload: { apertureId: 'string' } },
      { type: 'LISTEN.PRESET.SELECT', payload: { presetId: 'string' } },
    ],
    accessibility: {
      nativeStrategy: 'composite',
      landmark: 'navigation',
      labelSource: 'props.ariaLabel',
      keyboard: ['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', 'Space'],
      obligations: ['single-selection', 'visible-focus', 'selected-state-announced'],
    },
    defaultLayout: 'layout://listen/rail-stack/v1',
    defaultVisuals: ['visual://listen/glass-panel/v1'],
  }),

  'aperture-option': freezeDefinition({
    kind: 'aperture-option',
    description: 'One selectable analysis lens.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'icon', role: 'group', required: true },
        { id: 'label', role: 'group', required: true },
        { id: 'description', role: 'group', required: false },
      ],
    },
    states: [
      { id: 'selected', type: 'boolean', default: false },
      { id: 'disabled', type: 'boolean', default: false },
    ],
    events: [{ type: 'LISTEN.APERTURE.SELECT', payload: { apertureId: 'string' } }],
    accessibility: {
      nativeStrategy: 'native',
      nativeElement: 'button',
      obligations: ['button-name', 'selected-state-announced'],
    },
    defaultLayout: 'layout://listen/aperture-option/v1',
    defaultVisuals: ['visual://listen/focus-ring/v1'],
  }),

  'resonance-core': freezeDefinition({
    kind: 'resonance-core',
    description: 'Central circular resonance instrument with static geometry and runtime bindings.',
    anatomy: {
      rootRole: 'container',
      parts: [
        { id: 'dial', role: 'container', required: true },
        { id: 'sigil', role: 'group', required: true },
        { id: 'sideMeters', role: 'group', required: false },
        { id: 'nameplate', role: 'group', required: true },
      ],
      slots: [
        { id: 'sideMeters', accepts: ['metric-dial'], min: 0, max: 2 },
      ],
    },
    events: [
      { type: 'LISTEN.CORE.ACTIVATE', payload: {} },
      { type: 'LISTEN.CORE.SEEK', payload: { normalizedPosition: 'number' } },
    ],
    accessibility: {
      nativeStrategy: 'hybrid',
      labelSource: 'props.ariaLabel',
      obligations: ['decorative-geometry-hidden', 'operable-core-control'],
    },
    capabilities: [
      { id: 'wand', required: false, fallback: 'native-dom-core' },
      { id: 'reduced-motion', required: true },
    ],
    defaultLayout: 'layout://listen/resonance-core/v1',
    defaultVisuals: [
      'visual://listen/radial-instrument/v1',
      'visual://listen/harmonic-seam/v1',
    ],
  }),

  'parameter-rail': freezeDefinition({
    kind: 'parameter-rail',
    description: 'Runtime-bound signal parameters, scope, and output routing.',
    anatomy: {
      rootRole: 'container',
      parts: [
        { id: 'heading', role: 'group', required: true },
        { id: 'scope', role: 'container', required: true },
        { id: 'metrics', role: 'group', required: true },
        { id: 'output', role: 'group', required: true },
        { id: 'density', role: 'group', required: false },
      ],
      slots: [
        { id: 'scope', accepts: ['waveform-scope'], min: 1, max: 1 },
        { id: 'metrics', accepts: ['metric-bar', 'signal-field'], min: 1 },
        { id: 'output', accepts: ['signal-field'], min: 1 },
        { id: 'density', accepts: ['segment-meter'], min: 0, max: 1 },
      ],
    },
    accessibility: {
      nativeStrategy: 'hybrid',
      landmark: 'region',
      labelSource: 'props.ariaLabel',
      obligations: ['form-controls-labelled', 'meter-values-announced'],
    },
    defaultLayout: 'layout://listen/rail-stack/v1',
    defaultVisuals: ['visual://listen/glass-panel/v1'],
  }),

  'waveform-scope': freezeDefinition({
    kind: 'waveform-scope',
    description: 'Read-only signal visualization surface.',
    anatomy: {
      rootRole: 'container',
      parts: [
        { id: 'toolbar', role: 'group', required: true },
        { id: 'plot', role: 'container', required: true },
        { id: 'readout', role: 'group', required: false },
      ],
    },
    accessibility: {
      nativeStrategy: 'hybrid',
      labelSource: 'props.ariaLabel',
      obligations: ['canvas-text-alternative', 'decorative-grid-hidden'],
    },
    capabilities: [{ id: 'canvas', required: false, fallback: 'static-waveform' }],
    defaultLayout: 'layout://listen/waveform-scope/v1',
    defaultVisuals: ['visual://listen/waveform-lattice/v1'],
  }),

  'metric-bar': freezeDefinition({
    kind: 'metric-bar',
    description: 'Labelled runtime-bound meter.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'label', role: 'group', required: true },
        { id: 'value', role: 'group', required: true },
        { id: 'track', role: 'container', required: true },
      ],
    },
    accessibility: {
      nativeStrategy: 'native',
      nativeElement: 'meter',
      obligations: ['meter-label', 'meter-min-max-now'],
    },
    defaultLayout: 'layout://listen/metric-bar/v1',
    defaultVisuals: ['visual://listen/meter-track/v1'],
  }),

  'signal-field': freezeDefinition({
    kind: 'signal-field',
    description: 'Labelled select, text, or read-only value field.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'label', role: 'group', required: true },
        { id: 'control', role: 'group', required: true },
      ],
    },
    events: [{ type: 'LISTEN.FIELD.CHANGE', payload: { fieldId: 'string', value: 'json' } }],
    accessibility: {
      nativeStrategy: 'native',
      obligations: ['control-label-association', 'error-description'],
    },
    defaultLayout: 'layout://listen/signal-field/v1',
    defaultVisuals: ['visual://listen/focus-ring/v1'],
  }),

  'segment-meter': freezeDefinition({
    kind: 'segment-meter',
    description: 'Discrete phoneme-density or signal-density indicator.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'label', role: 'group', required: true },
        { id: 'segments', role: 'container', required: true },
      ],
    },
    accessibility: {
      nativeStrategy: 'hybrid',
      obligations: ['progress-name', 'progress-value'],
    },
    defaultLayout: 'layout://listen/segment-meter/v1',
    defaultVisuals: ['visual://listen/segment-glow/v1'],
  }),

  'transport-deck': freezeDefinition({
    kind: 'transport-deck',
    description: 'Playback transport with one dominant toggle and secondary controls.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'signalLamp', role: 'group', required: true },
        { id: 'primaryControls', role: 'group', required: true },
        { id: 'secondaryControls', role: 'group', required: false },
        { id: 'time', role: 'group', required: false },
      ],
      slots: [
        { id: 'primaryControls', accepts: ['transport-control'], min: 1 },
        { id: 'secondaryControls', accepts: ['transport-control', 'metric-bar'], min: 0 },
      ],
    },
    states: [
      { id: 'mode', type: 'enum', values: ['standby', 'loading', 'playing', 'paused', 'seeking', 'error'], default: 'standby' },
    ],
    events: [
      { type: 'LISTEN.TRANSPORT.PREVIOUS', payload: {} },
      { type: 'LISTEN.TRANSPORT.TOGGLE', payload: {} },
      { type: 'LISTEN.TRANSPORT.NEXT', payload: {} },
      { type: 'LISTEN.TRANSPORT.RESTART', payload: {} },
      { type: 'LISTEN.TRANSPORT.LOOP', payload: { enabled: 'boolean' } },
      { type: 'LISTEN.TRANSPORT.VOLUME', payload: { normalizedValue: 'number' } },
    ],
    accessibility: {
      nativeStrategy: 'composite',
      labelSource: 'props.ariaLabel',
      keyboard: ['Tab', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight'],
      obligations: ['button-names', 'pressed-state-announced', 'live-playback-status'],
    },
    defaultLayout: 'layout://listen/transport-deck/v1',
    defaultVisuals: ['visual://listen/elevated-deck/v1', 'visual://listen/harmonic-seam/v1'],
  }),

  'transport-control': freezeDefinition({
    kind: 'transport-control',
    description: 'Native transport button with stable event identity.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'icon', role: 'group', required: true },
        { id: 'label', role: 'group', required: false },
      ],
    },
    accessibility: {
      nativeStrategy: 'native',
      nativeElement: 'button',
      obligations: ['button-name', 'visible-focus'],
    },
    defaultLayout: 'layout://listen/transport-control/v1',
    defaultVisuals: ['visual://listen/focus-ring/v1'],
  }),

  'rune-preset': freezeDefinition({
    kind: 'rune-preset',
    description: 'Small selectable preset glyph.',
    anatomy: {
      rootRole: 'group',
      parts: [{ id: 'glyph', role: 'group', required: true }],
    },
    states: [{ id: 'selected', type: 'boolean', default: false }],
    events: [{ type: 'LISTEN.PRESET.SELECT', payload: { presetId: 'string' } }],
    accessibility: {
      nativeStrategy: 'native',
      nativeElement: 'button',
      obligations: ['button-name', 'selected-state-announced'],
    },
    defaultLayout: 'layout://listen/rune-preset/v1',
    defaultVisuals: ['visual://listen/rune-badge/v1'],
  }),

  'metric-dial': freezeDefinition({
    kind: 'metric-dial',
    description: 'Compact radial meter bound to runtime signal state.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'dial', role: 'container', required: true },
        { id: 'label', role: 'group', required: true },
      ],
    },
    accessibility: {
      nativeStrategy: 'hybrid',
      obligations: ['meter-label', 'meter-min-max-now'],
    },
    defaultLayout: 'layout://listen/metric-dial/v1',
    defaultVisuals: ['visual://listen/radial-meter/v1'],
  }),

  'signal-status-line': freezeDefinition({
    kind: 'signal-status-line',
    description: 'Low-emphasis current-signal and protocol status.',
    anatomy: {
      rootRole: 'group',
      parts: [
        { id: 'signal', role: 'group', required: true },
        { id: 'protocol', role: 'group', required: true },
      ],
    },
    accessibility: {
      nativeStrategy: 'native',
      landmark: 'contentinfo',
      live: 'polite',
      obligations: ['status-not-color-only'],
    },
    defaultLayout: 'layout://listen/status-line/v1',
    defaultVisuals: [],
  }),
});

function layout(id, mode, intent) {
  return Object.freeze({
    contract: COMPOSE_CONTRACTS.layout,
    version: SIGNAL_CHAMBER_VERSION,
    id,
    mode,
    ...intent,
  });
}

export const SIGNAL_CHAMBER_LAYOUTS = Object.freeze({
  'layout://listen/signal-chamber-shell/v1': layout(
    'layout://listen/signal-chamber-shell/v1',
    'grid',
    {
      common: { width: '100%', minHeight: '100%', overflow: 'hidden' },
      grid: {
        columns: ['minmax(248px, 0.78fr)', 'minmax(560px, 3.8fr)', 'minmax(248px, 0.78fr)'],
        rows: ['auto', 'minmax(0, 1fr)', 'auto', 'auto'],
        areas: [
          ['heading', 'heading', 'heading'],
          ['apertureRail', 'core', 'parameterRail'],
          ['apertureRail', 'transport', 'parameterRail'],
          ['footer', 'footer', 'footer'],
        ],
        gap: '0px',
      },
      responsive: [
        {
          when: { maxWidthPx: 1023 },
          mode: 'flow',
          flow: { direction: 'column', gap: '12px' },
          order: ['heading', 'core', 'transport', 'apertureRail', 'parameterRail', 'footer'],
        },
      ],
    },
  ),

  'layout://listen/lock-plate/v1': layout('layout://listen/lock-plate/v1', 'flow', {
    flow: { direction: 'column', align: 'center', justify: 'center', gap: '8px' },
    common: { maxWidth: '360px', marginInline: 'auto' },
  }),

  'layout://listen/rail-stack/v1': layout('layout://listen/rail-stack/v1', 'flow', {
    flow: { direction: 'column', gap: '14px' },
    common: { minWidth: 0, overflowY: 'auto', overflowX: 'hidden' },
  }),

  'layout://listen/aperture-option/v1': layout('layout://listen/aperture-option/v1', 'grid', {
    grid: {
      columns: ['24px', 'minmax(0, 1fr)'],
      rows: ['auto', 'auto'],
      areas: [
        ['icon', 'label'],
        ['icon', 'description'],
      ],
      gap: '4px 12px',
    },
  }),

  'layout://listen/resonance-core/v1': layout('layout://listen/resonance-core/v1', 'overlay', {
    overlay: {
      layers: ['dial', 'sigil', 'sideMeters', 'nameplate'],
      anchors: {
        dial: 'center',
        sigil: 'center',
        sideMeters: 'stretch',
        nameplate: 'bottom-center',
      },
    },
    common: { aspectRatio: '1 / 1', maxHeight: 'min(72vh, 820px)', marginInline: 'auto' },
  }),

  'layout://listen/waveform-scope/v1': layout('layout://listen/waveform-scope/v1', 'grid', {
    grid: {
      columns: ['1fr'],
      rows: ['auto', 'minmax(150px, 1fr)', 'auto'],
      areas: [['toolbar'], ['plot'], ['readout']],
      gap: '8px',
    },
  }),

  'layout://listen/metric-bar/v1': layout('layout://listen/metric-bar/v1', 'grid', {
    grid: {
      columns: ['1fr', 'auto'],
      rows: ['auto', '6px'],
      areas: [
        ['label', 'value'],
        ['track', 'track'],
      ],
      gap: '8px',
    },
  }),

  'layout://listen/signal-field/v1': layout('layout://listen/signal-field/v1', 'flow', {
    flow: { direction: 'column', gap: '7px' },
  }),

  'layout://listen/segment-meter/v1': layout('layout://listen/segment-meter/v1', 'flow', {
    flow: { direction: 'column', gap: '8px' },
  }),

  'layout://listen/transport-deck/v1': layout('layout://listen/transport-deck/v1', 'grid', {
    grid: {
      columns: ['minmax(150px, 0.8fr)', 'minmax(320px, 2fr)', 'minmax(180px, 1fr)'],
      rows: ['auto'],
      areas: [['signalLamp', 'primaryControls', 'time']],
      gap: '16px',
      align: 'center',
    },
    responsive: [
      {
        when: { maxWidthPx: 720 },
        mode: 'flow',
        flow: { direction: 'column', align: 'stretch', gap: '12px' },
      },
    ],
  }),

  'layout://listen/transport-control/v1': layout('layout://listen/transport-control/v1', 'flow', {
    flow: { direction: 'row', align: 'center', justify: 'center', gap: '6px' },
  }),

  'layout://listen/rune-preset/v1': layout('layout://listen/rune-preset/v1', 'flow', {
    flow: { direction: 'row', align: 'center', justify: 'center' },
    common: { aspectRatio: '1 / 1' },
  }),

  'layout://listen/metric-dial/v1': layout('layout://listen/metric-dial/v1', 'flow', {
    flow: { direction: 'column', align: 'center', gap: '6px' },
  }),

  'layout://listen/status-line/v1': layout('layout://listen/status-line/v1', 'flow', {
    flow: { direction: 'row', align: 'center', justify: 'center', gap: '14px', wrap: true },
  }),
});

export const SIGNAL_CHAMBER_VISUALS = Object.freeze({
  'visual://listen/chamber-skin/v1': Object.freeze({
    kind: 'token',
    tokenSetId: SIGNAL_CHAMBER_THEME_TOKENS.id,
    role: 'skin',
    placementSlot: 'root',
    removable: false,
  }),
  'visual://listen/chamber-frame/v1': Object.freeze({
    kind: 'wand',
    formulaId: 'wand://formula/chamber-concentric-frame/v1',
    role: 'structural-ornament',
    placementSlot: 'background',
    removable: true,
    fallback: 'native-dom-frame',
  }),
  'visual://listen/glass-panel/v1': Object.freeze({
    kind: 'native-dom',
    role: 'surface',
    placementSlot: 'root',
    removable: true,
    props: {
      surface: 'glass',
      borderToken: 'metal',
      backdropBlurPx: 8,
      elevation: 2,
    },
  }),
  'visual://listen/elevated-deck/v1': Object.freeze({
    kind: 'native-dom',
    role: 'surface',
    placementSlot: 'root',
    removable: true,
    props: { surface: 'raised-metal', elevation: 4 },
  }),
  'visual://listen/harmonic-seam/v1': Object.freeze({
    kind: 'native-dom',
    role: 'ornamentation',
    placementSlot: 'after',
    removable: true,
    props: {
      className: 'compose-harmonic-seam',
      colorFromToken: 'auroraStart',
      colorToToken: 'auroraEnd',
      glowFromToken: 'glow',
      glowRadiusPx: SIGNAL_CHAMBER_THEME_TOKENS.motion.glowRadiusPx,
      transitionMs: SIGNAL_CHAMBER_THEME_TOKENS.motion.standardMs,
      breatheMs: SIGNAL_CHAMBER_THEME_TOKENS.motion.breatheMs,
      phase: SIGNAL_CHAMBER_THEME_TOKENS.motion.phase,
    },
  }),
  'visual://listen/pulse-dot/v1': Object.freeze({
    kind: 'native-dom',
    role: 'status-indicator',
    placementSlot: 'eyebrow',
    removable: true,
    props: {
      className: 'compose-pulse-dot',
      glowFromToken: 'glow',
      breatheMs: SIGNAL_CHAMBER_THEME_TOKENS.motion.breatheMs,
      phase: SIGNAL_CHAMBER_THEME_TOKENS.motion.phase,
    },
  }),
  'visual://listen/radial-instrument/v1': Object.freeze({
    kind: 'wand',
    formulaId: 'wand://formula/radial-resonance-instrument/v1',
    role: 'instrument-geometry',
    placementSlot: 'dial',
    removable: true,
    fallback: 'native-dom-concentric-rings',
  }),
  'visual://listen/waveform-lattice/v1': Object.freeze({
    kind: 'wand',
    formulaId: 'wand://formula/waveform-lattice/v1',
    role: 'data-visualization',
    placementSlot: 'plot',
    removable: true,
    fallback: 'native-dom-static-waveform',
  }),
  'visual://listen/focus-ring/v1': Object.freeze({
    kind: 'native-dom',
    role: 'focus-indicator',
    placementSlot: 'root',
    removable: false,
    props: {
      colorFromToken: 'glow',
      widthPx: 2,
      offsetPx: 3,
    },
  }),
  'visual://listen/meter-track/v1': Object.freeze({
    kind: 'native-dom',
    role: 'data-visualization',
    placementSlot: 'track',
    removable: true,
    props: { fillFromToken: 'glow', transitionMs: SIGNAL_CHAMBER_THEME_TOKENS.motion.standardMs },
  }),
  'visual://listen/segment-glow/v1': Object.freeze({
    kind: 'native-dom',
    role: 'data-visualization',
    placementSlot: 'segments',
    removable: true,
    props: { fillFromToken: 'glow', activeOpacity: 1, inactiveOpacity: 0.18 },
  }),
  'visual://listen/rune-badge/v1': Object.freeze({
    kind: 'scdl-asset',
    packetId: 'scdl://asset/signal-rune-badge/v1',
    role: 'iconography',
    placementSlot: 'glyph',
    removable: true,
    fallback: 'native-text-glyph',
  }),
  'visual://listen/radial-meter/v1': Object.freeze({
    kind: 'wand',
    formulaId: 'wand://formula/radial-meter/v1',
    role: 'data-visualization',
    placementSlot: 'dial',
    removable: true,
    fallback: 'native-meter',
  }),
});

export const DEFAULT_SIGNAL_CHAMBER_AUTHORING = Object.freeze({
  sceneId: 'listen-signal-chamber-ui-kit',
  ariaLabel: 'Scholomance Signal Chamber',
  school: 'nullVoid',
  signal: {
    title: 'THE VOID',
    frequencyLabel: '85.00 Hz',
    resonanceStatus: 'RESONANCE_LOCKED',
  },
  apertures: [
    { id: 'oscilloscope', label: 'OSCILLOSCOPE', description: 'Waveform View', glyph: '≈' },
    { id: 'alchemical', label: 'ALCHEMICAL', description: 'Harmonic Analysis', glyph: '△' },
    { id: 'resonance', label: 'RESONANCE', description: 'Frequency Mapping', glyph: '✣' },
    { id: 'vortex', label: 'VORTEX', description: 'Phase Topology', glyph: '◉' },
    { id: 'null-void', label: 'NULL VOID', description: 'Signal Chamber', glyph: '⟡' },
  ],
  selectedApertureId: 'null-void',
  presets: [
    { id: 'void-a', label: 'Void lattice A', glyph: '◇' },
    { id: 'void-b', label: 'Void lattice B', glyph: '⬡' },
    { id: 'void-c', label: 'Void lattice C', glyph: '✦' },
    { id: 'void-d', label: 'Void lattice D', glyph: '◈' },
  ],
  parameters: [
    { id: 'vibration', label: 'VIBRATION', binding: 'listen.signal.vibration', min: 0, max: 1, format: 'percent' },
    { id: 'aura-node', label: 'AURA NODE', binding: 'listen.signal.auraNode', format: 'text' },
    { id: 'entropy', label: 'ENTROPY', binding: 'listen.signal.entropy', min: 0, max: 1, format: 'percent' },
  ],
  outputField: {
    id: 'signal-output',
    label: 'SIGNAL OUTPUT',
    binding: 'listen.output.deviceId',
    optionsBinding: 'listen.output.devices',
  },
  density: {
    label: 'PHONEME DENSITY',
    binding: 'listen.signal.phonemeDensity',
    segments: 16,
  },
  transport: {
    modeBinding: 'listen.transport.mode',
    timeBinding: 'listen.transport.timeLabel',
    volumeBinding: 'listen.transport.volume',
    loopBinding: 'listen.transport.loop',
    controls: [
      { id: 'previous', label: 'Previous signal', icon: 'skip-back', event: 'LISTEN.TRANSPORT.PREVIOUS' },
      { id: 'restart', label: 'Restart signal', icon: 'restart', event: 'LISTEN.TRANSPORT.RESTART' },
      { id: 'toggle', label: 'Play or pause signal', iconBinding: 'listen.transport.toggleIcon', event: 'LISTEN.TRANSPORT.TOGGLE', dominant: true },
      { id: 'next', label: 'Next signal', icon: 'skip-forward', event: 'LISTEN.TRANSPORT.NEXT' },
      { id: 'loop', label: 'Toggle loop', icon: 'loop', event: 'LISTEN.TRANSPORT.LOOP', pressedBinding: 'listen.transport.loop' },
    ],
  },
  protocolLabel: 'Scholomance v11.3',
});

function node({ id, kind, role = 'group', props = {}, state, layoutRef, visualRefs = [], slots, children }) {
  const value = { id, kind, role, props, visualRefs };
  if (state !== undefined) value.state = state;
  if (layoutRef !== undefined) value.layoutRef = layoutRef;
  if (slots !== undefined) value.slots = slots;
  if (children !== undefined) value.children = children;
  return value;
}

function apertureOptionNode(option, selectedId) {
  return node({
    id: `aperture-${option.id}`,
    kind: 'aperture-option',
    props: {
      apertureId: option.id,
      label: option.label,
      description: option.description,
      glyph: option.glyph,
      eventType: 'LISTEN.APERTURE.SELECT',
    },
    state: { selected: option.id === selectedId, disabled: false },
    layoutRef: 'layout://listen/aperture-option/v1',
    visualRefs: ['visual://listen/focus-ring/v1'],
  });
}

function presetNode(preset, selectedId) {
  return node({
    id: `preset-${preset.id}`,
    kind: 'rune-preset',
    props: {
      presetId: preset.id,
      label: preset.label,
      glyph: preset.glyph,
      eventType: 'LISTEN.PRESET.SELECT',
    },
    state: { selected: preset.id === selectedId },
    layoutRef: 'layout://listen/rune-preset/v1',
    visualRefs: ['visual://listen/rune-badge/v1', 'visual://listen/focus-ring/v1'],
  });
}

function metricNode(parameter) {
  return node({
    id: `metric-${parameter.id}`,
    kind: parameter.format === 'text' ? 'signal-field' : 'metric-bar',
    props: {
      fieldId: parameter.id,
      label: parameter.label,
      binding: parameter.binding,
      format: parameter.format,
      min: parameter.min,
      max: parameter.max,
      readOnly: true,
    },
    layoutRef: parameter.format === 'text'
      ? 'layout://listen/signal-field/v1'
      : 'layout://listen/metric-bar/v1',
    visualRefs: parameter.format === 'text'
      ? ['visual://listen/focus-ring/v1']
      : ['visual://listen/meter-track/v1'],
  });
}

function transportControlNode(control) {
  return node({
    id: `transport-${control.id}`,
    kind: 'transport-control',
    props: {
      controlId: control.id,
      label: control.label,
      icon: control.icon,
      iconBinding: control.iconBinding,
      eventType: control.event,
      pressedBinding: control.pressedBinding,
      dominant: Boolean(control.dominant),
    },
    layoutRef: 'layout://listen/transport-control/v1',
    visualRefs: ['visual://listen/focus-ring/v1'],
  });
}

export function createSignalChamberScene(authoring = DEFAULT_SIGNAL_CHAMBER_AUTHORING) {
  const sceneWithoutChecksum = {
    contract: COMPOSE_CONTRACTS.scene,
    version: SIGNAL_CHAMBER_VERSION,
    id: authoring.sceneId,
    root: node({
      id: 'listen-signal-chamber',
      kind: 'signal-chamber-shell',
      role: 'container',
      props: {
        ariaLabel: authoring.ariaLabel,
        schoolTokenBinding: 'listen.school.active',
        authoredSchoolFallback: authoring.school,
      },
      layoutRef: 'layout://listen/signal-chamber-shell/v1',
      visualRefs: ['visual://listen/chamber-skin/v1', 'visual://listen/chamber-frame/v1'],
      slots: {
        heading: [
          node({
            id: 'signal-lock-plate',
            kind: 'signal-lock-plate',
            props: {
              eyebrow: authoring.signal.resonanceStatus,
              title: authoring.signal.title,
              frequencyLabel: authoring.signal.frequencyLabel,
            },
            layoutRef: 'layout://listen/lock-plate/v1',
            visualRefs: ['visual://listen/glass-panel/v1', 'visual://listen/pulse-dot/v1'],
          }),
        ],
        apertureRail: [
          node({
            id: 'aperture-rail',
            kind: 'aperture-rail',
            role: 'container',
            props: { ariaLabel: 'Aperture analysis modes', heading: 'APERTURE' },
            state: { selectedId: authoring.selectedApertureId, enabled: true },
            layoutRef: 'layout://listen/rail-stack/v1',
            visualRefs: ['visual://listen/glass-panel/v1'],
            slots: {
              options: authoring.apertures.map((option) => apertureOptionNode(option, authoring.selectedApertureId)),
              presets: authoring.presets.map((preset) => presetNode(preset, null)),
            },
          }),
        ],
        core: [
          node({
            id: 'resonance-core',
            kind: 'resonance-core',
            role: 'container',
            props: {
              ariaLabel: `${authoring.signal.title} resonance instrument`,
              signalTitle: authoring.signal.title,
              signalGeometryBinding: 'listen.signal.geometry',
              activationEvent: 'LISTEN.CORE.ACTIVATE',
              seekEvent: 'LISTEN.CORE.SEEK',
            },
            layoutRef: 'layout://listen/resonance-core/v1',
            visualRefs: ['visual://listen/radial-instrument/v1', 'visual://listen/harmonic-seam/v1'],
            slots: {
              sideMeters: [
                node({
                  id: 'metric-dial-left',
                  kind: 'metric-dial',
                  props: { label: 'PHASE', binding: 'listen.signal.phase' },
                  layoutRef: 'layout://listen/metric-dial/v1',
                  visualRefs: ['visual://listen/radial-meter/v1'],
                }),
                node({
                  id: 'metric-dial-right',
                  kind: 'metric-dial',
                  props: { label: 'GAIN', binding: 'listen.signal.gain' },
                  layoutRef: 'layout://listen/metric-dial/v1',
                  visualRefs: ['visual://listen/radial-meter/v1'],
                }),
              ],
            },
          }),
        ],
        parameterRail: [
          node({
            id: 'parameter-rail',
            kind: 'parameter-rail',
            role: 'container',
            props: { ariaLabel: 'Signal parameters', heading: 'PARAMETERS' },
            layoutRef: 'layout://listen/rail-stack/v1',
            visualRefs: ['visual://listen/glass-panel/v1'],
            slots: {
              scope: [
                node({
                  id: 'waveform-scope',
                  kind: 'waveform-scope',
                  role: 'container',
                  props: {
                    ariaLabel: 'Waveform analysis',
                    waveformBinding: 'listen.signal.waveform',
                    analysisModeBinding: 'listen.signal.analysisMode',
                    readoutBinding: 'listen.signal.waveformReadout',
                  },
                  layoutRef: 'layout://listen/waveform-scope/v1',
                  visualRefs: ['visual://listen/waveform-lattice/v1'],
                }),
              ],
              metrics: authoring.parameters.map(metricNode),
              output: [
                node({
                  id: 'signal-output-field',
                  kind: 'signal-field',
                  props: {
                    fieldId: authoring.outputField.id,
                    label: authoring.outputField.label,
                    binding: authoring.outputField.binding,
                    optionsBinding: authoring.outputField.optionsBinding,
                    controlType: 'select',
                    eventType: 'LISTEN.FIELD.CHANGE',
                  },
                  layoutRef: 'layout://listen/signal-field/v1',
                  visualRefs: ['visual://listen/focus-ring/v1'],
                }),
              ],
              density: [
                node({
                  id: 'phoneme-density',
                  kind: 'segment-meter',
                  props: {
                    label: authoring.density.label,
                    binding: authoring.density.binding,
                    segmentCount: authoring.density.segments,
                  },
                  layoutRef: 'layout://listen/segment-meter/v1',
                  visualRefs: ['visual://listen/segment-glow/v1'],
                }),
              ],
            },
          }),
        ],
        transport: [
          node({
            id: 'transport-deck',
            kind: 'transport-deck',
            props: {
              ariaLabel: 'Signal transport',
              modeBinding: authoring.transport.modeBinding,
              timeBinding: authoring.transport.timeBinding,
              volumeBinding: authoring.transport.volumeBinding,
              loopBinding: authoring.transport.loopBinding,
            },
            layoutRef: 'layout://listen/transport-deck/v1',
            visualRefs: ['visual://listen/elevated-deck/v1', 'visual://listen/harmonic-seam/v1'],
            slots: {
              primaryControls: authoring.transport.controls.map(transportControlNode),
              secondaryControls: [
                node({
                  id: 'transport-volume',
                  kind: 'metric-bar',
                  props: {
                    label: 'VOLUME',
                    binding: authoring.transport.volumeBinding,
                    min: 0,
                    max: 1,
                    eventType: 'LISTEN.TRANSPORT.VOLUME',
                    interactive: true,
                  },
                  layoutRef: 'layout://listen/metric-bar/v1',
                  visualRefs: ['visual://listen/meter-track/v1', 'visual://listen/focus-ring/v1'],
                }),
              ],
            },
          }),
        ],
        footer: [
          node({
            id: 'signal-status-line',
            kind: 'signal-status-line',
            props: {
              signalStateBinding: authoring.transport.modeBinding,
              protocolLabel: authoring.protocolLabel,
            },
            layoutRef: 'layout://listen/status-line/v1',
          }),
        ],
      },
    }),
    definitions: SIGNAL_CHAMBER_DEFINITIONS,
    layouts: SIGNAL_CHAMBER_LAYOUTS,
    visuals: SIGNAL_CHAMBER_VISUALS,
    metadata: {
      kitId: 'scholomance-listen-signal-chamber',
      kitVersion: SIGNAL_CHAMBER_VERSION,
      runtimeOwnership: [
        'playback-time',
        'transport-mode',
        'waveform-samples',
        'meter-values',
        'device-list',
        'active-school',
      ],
    },
  };

  const canonicalSource = canonicalStringify(sceneWithoutChecksum);
  return Object.freeze({
    ...sceneWithoutChecksum,
    sourceChecksum: `fnv1a-${fnv1a32(canonicalSource)}`,
  });
}

export function canonicalStringify(value) {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        const next = value[key];
        if (next !== undefined) result[key] = sortCanonical(next);
        return result;
      }, {});
  }
  return value;
}

export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Reference-integrity smoke check only.
 * The repository's canonical validateComposeScene remains the validation authority.
 */
export function assertSignalChamberReferenceIntegrity(scene) {
  const ids = new Set();
  const errors = [];

  function visit(current) {
    if (!current || typeof current !== 'object') return;
    if (ids.has(current.id)) errors.push(`duplicate-node-id:${current.id}`);
    ids.add(current.id);

    if (!scene.definitions[current.kind]) errors.push(`unknown-definition:${current.kind}`);
    if (current.layoutRef && !scene.layouts[current.layoutRef]) errors.push(`unknown-layout:${current.layoutRef}`);
    for (const visualRef of current.visualRefs ?? []) {
      if (!scene.visuals[visualRef]) errors.push(`unknown-visual:${visualRef}`);
    }
    for (const slotChildren of Object.values(current.slots ?? {})) {
      for (const child of slotChildren) visit(child);
    }
    for (const child of current.children ?? []) visit(child);
  }

  visit(scene.root);
  if (errors.length > 0) {
    throw new Error(`Signal Chamber Compose reference errors:\n${errors.join('\n')}`);
  }
  return true;
}

export const SIGNAL_CHAMBER_UI_KIT = Object.freeze({
  id: 'scholomance-listen-signal-chamber',
  version: SIGNAL_CHAMBER_VERSION,
  tokens: SIGNAL_CHAMBER_THEME_TOKENS,
  definitions: SIGNAL_CHAMBER_DEFINITIONS,
  layouts: SIGNAL_CHAMBER_LAYOUTS,
  visuals: SIGNAL_CHAMBER_VISUALS,
  createScene: createSignalChamberScene,
});
