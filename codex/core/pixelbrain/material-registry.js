export const SOURCE_MATERIAL = 'source';
export const MATERIAL_REGISTRY_VERSION = '0.2.0';
export const DEFAULT_EMISSION_FACTOR = 0;

export const MATERIAL_CATEGORIES = Object.freeze({
  SOURCE: 'source',
  FLAME: 'flame',
  GEMSTONE: 'gemstone',
  METAL: 'metal',
  ORGANIC: 'organic',
});

export const MATERIAL_PALETTES = Object.freeze({
  [SOURCE_MATERIAL]: Object.freeze({
    id: SOURCE_MATERIAL,
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Source',
    category: MATERIAL_CATEGORIES.SOURCE,
    anchors: Object.freeze({}),
    rules: Object.freeze({
      preserveAlpha: true,
      preserveShape: true,
      passthrough: true,
    }),
  }),
  icy_fire: Object.freeze({
    id: 'icy_fire',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Icy Fire',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#02070A',
      shadow: '#06131C',
      deep: '#06324A',
      body: '#0EA5E9',
      frost: '#7DD3FC',
      whiteCore: '#F8FCFF',
      spectral: '#B8F7FF',
      glacialLavender: '#C7D2FE',
      moonlitGray: '#CBD5E1',
    }),
    rules: Object.freeze({
      preserveAlpha: true,
      preserveShape: true,
      forceColdHue: true,
      boostHighlightsToWhite: true,
      deepenLowValuesToBlack: true,
      desaturateMidtones: true,
    }),
  }),
  shadow_fire: Object.freeze({
    id: 'shadow_fire',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Shadow Fire',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#030106',
      shadow: '#12051D',
      deep: '#2E1065',
      body: '#7C3AED',
      frost: '#A78BFA',
      spectral: '#DDD6FE',
      whiteCore: '#FAF5FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  holy_fire: Object.freeze({
    id: 'holy_fire',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Holy Fire',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#160F02',
      shadow: '#3A2704',
      deep: '#92400E',
      body: '#F59E0B',
      frost: '#FDE68A',
      spectral: '#FEF3C7',
      whiteCore: '#FFFBEB',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  poison_flame: Object.freeze({
    id: 'poison_flame',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Poison Flame',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#020A04',
      shadow: '#052E16',
      deep: '#166534',
      body: '#22C55E',
      frost: '#86EFAC',
      spectral: '#BBF7D0',
      whiteCore: '#F0FDF4',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, forceColdHue: false }),
  }),
  void_ice: Object.freeze({
    id: 'void_ice',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Void Ice',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#00030A',
      shadow: '#020617',
      deep: '#1E1B4B',
      body: '#3730A3',
      frost: '#A5B4FC',
      spectral: '#C7D2FE',
      whiteCore: '#EEF2FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  sapphire_enamel: Object.freeze({
    id: 'sapphire_enamel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Sapphire Enamel',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#0A1128',
      shadow: '#102A5C',
      deep: '#1D4ED8',
      body: '#3B82F6',
      frost: '#93C5FD',
      spectral: '#DBEAFE',
      whiteCore: '#F0F9FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  cyan_lightning: Object.freeze({
    id: 'cyan_lightning',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Cyan Lightning',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      body: '#E0F2FE',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  cyan_glow: Object.freeze({
    id: 'cyan_glow',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Cyan Glow',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      body: '#06B6D4',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  darksteel: Object.freeze({
    id: 'darksteel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Darksteel',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#000000',
      shadow: '#08080D',
      deep: '#101017',
      body: '#1A1A26',
      frost: '#2D2D3B',
      spectral: '#4B4B5E',
      whiteCore: '#8A8A9E',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  diamond: Object.freeze({
    id: 'diamond',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Diamond',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#0B1014',
      shadow: '#2A3540',
      deep: '#7E94A6',
      body: '#C9DAE6',
      frost: '#E4EEF5',
      spectral: '#F2F8FC',
      whiteCore: '#FFFFFF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  sapphire: Object.freeze({
    id: 'sapphire',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Sapphire',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#02060F',
      shadow: '#061330',
      deep: '#0B2E6B',
      body: '#0F52BA',
      frost: '#3B82F6',
      spectral: '#93C5FD',
      whiteCore: '#EFF6FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  ruby: Object.freeze({
    id: 'ruby',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Ruby',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#100204',
      shadow: '#330611',
      deep: '#701030',
      body: '#E0115F',
      frost: '#F4639B',
      spectral: '#FBB6D0',
      whiteCore: '#FFF0F5',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  emerald: Object.freeze({
    id: 'emerald',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Emerald',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#021008',
      shadow: '#053827',
      deep: '#0B6B4F',
      body: '#50C878',
      frost: '#86EFAC',
      spectral: '#C6F6D5',
      whiteCore: '#F0FFF4',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  slime_gel: Object.freeze({
    id: 'slime_gel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Slime Gel',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#062615',
      shadow: '#064E3B',
      deep: '#047857',
      body: '#10B981',
      frost: '#6EE7B7',
      spectral: '#A7F3D0',
      whiteCore: '#D1FAE5',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  amethyst: Object.freeze({
    id: 'amethyst',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Amethyst',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#0A0412',
      shadow: '#2A1245',
      deep: '#5B21B6',
      body: '#9966CC',
      frost: '#C4A7E7',
      spectral: '#E9D8FD',
      whiteCore: '#FAF5FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  onyx: Object.freeze({
    id: 'onyx',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Onyx',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#000000',
      shadow: '#0A0A0D',
      deep: '#1A1A20',
      body: '#2E2E38',
      frost: '#4B4B58',
      spectral: '#8A8A99',
      whiteCore: '#E6E6F0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  voidsteel: Object.freeze({
    id: 'voidsteel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Voidsteel',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#01030A',
      shadow: '#07091A',
      deep: '#111633',
      body: '#20284A',
      frost: '#465178',
      spectral: '#7580A8',
      whiteCore: '#D6DAEF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  obsidian: Object.freeze({
    id: 'obsidian',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Obsidian',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#000004',
      shadow: '#05050D',
      deep: '#0E1020',
      body: '#191C2D',
      frost: '#383D55',
      spectral: '#6E7693',
      whiteCore: '#CDD3E4',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  deep_indigo_steel: Object.freeze({
    id: 'deep_indigo_steel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Deep Indigo Steel',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#020414',
      shadow: '#080D24',
      deep: '#111B44',
      body: '#233268',
      frost: '#4E6096',
      spectral: '#8697C2',
      whiteCore: '#DAE2F5',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  void_gold: Object.freeze({
    id: 'void_gold',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Void Gold',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#100B02',
      shadow: '#2A2108',
      deep: '#5C4A18',
      body: '#A58A2D',
      frost: '#CEB65A',
      spectral: '#E8DA91',
      whiteCore: '#FFF6D0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  void_core: Object.freeze({
    id: 'void_core',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Void Core',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#000008',
      shadow: '#07021A',
      deep: '#170A3A',
      body: '#32106D',
      frost: '#6B35B8',
      spectral: '#A17AE0',
      whiteCore: '#E5D7FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  amethyst_resonance: Object.freeze({
    id: 'amethyst_resonance',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Amethyst Resonance',
    category: MATERIAL_CATEGORIES.GEMSTONE,
    anchors: Object.freeze({
      void: '#090214',
      shadow: '#1B0730',
      deep: '#3B116B',
      body: '#6D28A8',
      frost: '#A66BE0',
      spectral: '#D2B5F4',
      whiteCore: '#F5ECFF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  void_rune_glow: Object.freeze({
    id: 'void_rune_glow',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Void Rune Glow',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#020111',
      shadow: '#080327',
      deep: '#160A54',
      body: '#3920A0',
      frost: '#7463E8',
      spectral: '#B8B0FF',
      whiteCore: '#F0EEFF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  void_cloth: Object.freeze({
    id: 'void_cloth',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Void Cloth',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#010105',
      shadow: '#050611',
      deep: '#0E1124',
      body: '#1A2038',
      frost: '#343B5A',
      spectral: '#687294',
      whiteCore: '#C7CEDF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  gold: Object.freeze({
    id: 'gold',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Gold',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#140D02',
      shadow: '#3D2E08',
      deep: '#8A6D1F',
      body: '#D4AF37',
      frost: '#F0D86E',
      spectral: '#FBEFB8',
      whiteCore: '#FFFBE6',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  silver: Object.freeze({
    id: 'silver',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Silver',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#0B0D10',
      shadow: '#2B3138',
      deep: '#6B7480',
      body: '#C0C0C8',
      frost: '#DDE1E6',
      spectral: '#EFF1F4',
      whiteCore: '#FCFDFE',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  bronze: Object.freeze({
    id: 'bronze',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Bronze',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#120A04',
      shadow: '#38220C',
      deep: '#7A4E22',
      body: '#CD7F32',
      frost: '#E3A869',
      spectral: '#F2D2AC',
      whiteCore: '#FDF3E7',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  black_steel: Object.freeze({
    id: 'black_steel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Black Steel',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#030308',
      shadow: '#0B0B14',
      deep: '#16161F',
      body: '#23232E',
      frost: '#3C3C4C',
      spectral: '#7C7C92',
      whiteCore: '#DEDEE8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  blacksteel: Object.freeze({
    id: 'blacksteel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Blacksteel',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#030308',
      shadow: '#0B0B14',
      deep: '#16161F',
      body: '#23232E',
      frost: '#3C3C4C',
      spectral: '#7C7C92',
      whiteCore: '#DEDEE8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, deepenLowValuesToBlack: true }),
  }),
  holy_steel: Object.freeze({
    id: 'holy_steel',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Holy Steel',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#0A0E14',
      shadow: '#1B2330',
      deep: '#3B4A60',
      body: '#8FA8C0',
      frost: '#B8C8D8',
      spectral: '#D8E2EE',
      whiteCore: '#E8F0F8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  sanctified_gold: Object.freeze({
    id: 'sanctified_gold',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Sanctified Gold',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#0E0902',
      shadow: '#2A1F08',
      deep: '#5A4418',
      body: '#A88C40',
      frost: '#D4B860',
      spectral: '#E8C46A',
      whiteCore: '#F4E8A8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  divine_flame_core: Object.freeze({
    id: 'divine_flame_core',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Divine Flame Core',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#1A1206',
      shadow: '#3A2704',
      deep: '#7A4A10',
      body: '#F0B450',
      frost: '#FFD888',
      spectral: '#FFF0B8',
      whiteCore: '#FFFDF0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true, forceWarmHue: true }),
  }),
  radiant_blue: Object.freeze({
    id: 'radiant_blue',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Radiant Blue',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#02080F',
      shadow: '#08222E',
      deep: '#103A52',
      body: '#4FA0D0',
      frost: '#80C0F0',
      spectral: '#A0D8FF',
      whiteCore: '#E0F0FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, forceColdHue: true }),
  }),
  bark: Object.freeze({
    id: 'bark',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Redwood Bark',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#1A0F07',
      shadow: '#2E1A0C',
      deep: '#3D2513',
      body: '#5C3A1F',
      frost: '#7A5233',
      spectral: '#9A6F4A',
      whiteCore: '#B88C67',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  pine_needle: Object.freeze({
    id: 'pine_needle',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Pine Needle',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#0A1F14',
      shadow: '#122B1D',
      deep: '#1A3D2A',
      body: '#2E5C3F',
      frost: '#4A7A55',
      spectral: '#6B9A6F',
      whiteCore: '#8FB88A',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, forceColdHue: true }),
  }),
  // ── Character Creator Materials ─────────────────────────────────────
  skin_light: Object.freeze({
    id: 'skin_light',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Skin Light',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#6A4030', shadow: '#885830', deep: '#A87040', body: '#C08850',
      frost: '#D4A06A', spectral: '#E8B88A', whiteCore: '#FDE8D0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  skin_medium: Object.freeze({
    id: 'skin_medium',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Skin Medium',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#604020', shadow: '#785028', deep: '#906838', body: '#A87848',
      frost: '#C09060', spectral: '#D4A878', whiteCore: '#E8C8A0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  skin_dark: Object.freeze({
    id: 'skin_dark',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Skin Dark',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#382820', shadow: '#503828', deep: '#684830', body: '#805838',
      frost: '#987048', spectral: '#B08860', whiteCore: '#C8A080',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  skin_voidborne: Object.freeze({
    id: 'skin_voidborne',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Skin Voidborne',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#484060', shadow: '#605078', deep: '#786890', body: '#9080A8',
      frost: '#A898C0', spectral: '#C0B8D8', whiteCore: '#D8D0E8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  hair_black: Object.freeze({
    id: 'hair_black',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Black',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#1A1A20', shadow: '#2A2A32', deep: '#3A3A44', body: '#4A4A56',
      frost: '#5A5A68', spectral: '#6A6A78', whiteCore: '#8A8A98',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  hair_brown: Object.freeze({
    id: 'hair_brown',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Brown',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#3A2818', shadow: '#4A3828', deep: '#5A4838', body: '#6A5848',
      frost: '#7A6858', spectral: '#8A7868', whiteCore: '#A89888',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  hair_blonde: Object.freeze({
    id: 'hair_blonde',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Blonde',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#8A7030', shadow: '#A88840', deep: '#C8A860', body: '#D8B870',
      frost: '#E8C880', spectral: '#F0D890', whiteCore: '#F8E8A0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  hair_red: Object.freeze({
    id: 'hair_red',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Red',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#4A1808', shadow: '#6A2010', deep: '#8A3020', body: '#A84030',
      frost: '#C05040', spectral: '#D06050', whiteCore: '#E08070',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  hair_void: Object.freeze({
    id: 'hair_void',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Void',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#1A1030', shadow: '#2A1850', deep: '#3A2070', body: '#4A2890',
      frost: '#5A30B0', spectral: '#7A50D0', whiteCore: '#A080E0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  eye_brown: Object.freeze({
    id: 'eye_brown',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Eye Brown',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#3A2010', shadow: '#4A2818', deep: '#5A3020', body: '#6A3828',
      frost: '#8A5040', spectral: '#A06858', whiteCore: '#C09080',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  eye_blue: Object.freeze({
    id: 'eye_blue',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Eye Blue',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#102040', shadow: '#183060', deep: '#204080', body: '#2850A0',
      frost: '#4070C0', spectral: '#6090E0', whiteCore: '#90B8F0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  eye_green: Object.freeze({
    id: 'eye_green',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Eye Green',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#102010', shadow: '#183018', deep: '#204020', body: '#285028',
      frost: '#408040', spectral: '#60A060', whiteCore: '#80C080',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  eye_void_glow: Object.freeze({
    id: 'eye_void_glow',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Eye Void Glow',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#100830', shadow: '#201860', deep: '#302890', body: '#4038C0',
      frost: '#6050F0', spectral: '#A098FF', whiteCore: '#D0C8FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  cloth_linen: Object.freeze({
    id: 'cloth_linen',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Cloth Linen',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#706860', shadow: '#888070', deep: '#989080', body: '#A8A090',
      frost: '#B8B0A0', spectral: '#C8C0B0', whiteCore: '#D8D0C0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  cloth_wool: Object.freeze({
    id: 'cloth_wool',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Cloth Wool',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#403830', shadow: '#484038', deep: '#605850', body: '#706860',
      frost: '#807870', spectral: '#908880', whiteCore: '#A09890',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  leather_brown: Object.freeze({
    id: 'leather_brown',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Leather Brown',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#3A2010', shadow: '#4A3020', deep: '#5A3828', body: '#6A4030',
      frost: '#7A4838', spectral: '#8A5040', whiteCore: '#A06858',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  skin_apricot_signal: Object.freeze({
    id: 'skin_apricot_signal',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Skin Apricot Signal',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#6B3329', shadow: '#8D4B35', deep: '#B86545', body: '#E08A61',
      frost: '#F0A878', spectral: '#FFD0A0', whiteCore: '#FFE8C8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  hair_midnight_teal: Object.freeze({
    id: 'hair_midnight_teal',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Midnight Teal',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#061018', shadow: '#0B2230', deep: '#123A45', body: '#1F5B62',
      frost: '#3B8990', spectral: '#77BFC0', whiteCore: '#B8F0E8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, forceColdHue: true }),
  }),
  hair_copper_arcade: Object.freeze({
    id: 'hair_copper_arcade',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Hair Copper Arcade',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#421006', shadow: '#6A2010', deep: '#96351A', body: '#C85A27',
      frost: '#F0803C', spectral: '#FFB060', whiteCore: '#FFD88A',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  eye_psychic_cobalt: Object.freeze({
    id: 'eye_psychic_cobalt',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Eye Psychic Cobalt',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#060C3A', shadow: '#101A68', deep: '#2030A8', body: '#3858F0',
      frost: '#68A0FF', spectral: '#A8D8FF', whiteCore: '#E8FFFF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  cloth_star_jacket: Object.freeze({
    id: 'cloth_star_jacket',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Cloth Star Jacket',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#07111F', shadow: '#10233C', deep: '#1B3D66', body: '#2E6FA3',
      frost: '#4CA0C8', spectral: '#9FD8E0', whiteCore: '#E8F8F0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, forceColdHue: true }),
  }),
  cloth_psychic_denim: Object.freeze({
    id: 'cloth_psychic_denim',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Cloth Psychic Denim',
    category: MATERIAL_CATEGORIES.ORGANIC,
    anchors: Object.freeze({
      void: '#15102E', shadow: '#272052', deep: '#3E347A', body: '#5A55A8',
      frost: '#7A8BE0', spectral: '#B8C8FF', whiteCore: '#EEF2FF',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true }),
  }),
  trim_comet_gold: Object.freeze({
    id: 'trim_comet_gold',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Trim Comet Gold',
    category: MATERIAL_CATEGORIES.METAL,
    anchors: Object.freeze({
      void: '#3A2104', shadow: '#6A4208', deep: '#A36A16', body: '#D99A2B',
      frost: '#F0C85A', spectral: '#FFE68A', whiteCore: '#FFF8D0',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
  neon_mint_signal: Object.freeze({
    id: 'neon_mint_signal',
    emissionFactor: DEFAULT_EMISSION_FACTOR,
    label: 'Neon Mint Signal',
    category: MATERIAL_CATEGORIES.FLAME,
    anchors: Object.freeze({
      void: '#02120E', shadow: '#063A2E', deep: '#0A6A55', body: '#18C29B',
      frost: '#56F0C8', spectral: '#A8FFE8', whiteCore: '#F0FFF8',
    }),
    rules: Object.freeze({ preserveAlpha: true, preserveShape: true, boostHighlightsToWhite: true }),
  }),
});

/**
 * Material → shader uniform index. APPEND-ONLY LAW: indices are baked into
 * exported shaders (u_pixelbrain_material), so an existing entry must never
 * be renumbered or removed — new materials append at the end. The contract
 * test (material-shader-index.test.js) fails if a registry material is
 * missing here or if the legacy 0-5 block moves.
 */
export const MATERIAL_SHADER_INDEX = Object.freeze({
  source: 0,
  icy_fire: 1,
  shadow_fire: 2,
  holy_fire: 3,
  poison_flame: 4,
  void_ice: 5,
  sapphire_enamel: 6,
  cyan_lightning: 7,
  cyan_glow: 8,
  darksteel: 9,
  diamond: 10,
  sapphire: 11,
  ruby: 12,
  emerald: 13,
  amethyst: 14,
  onyx: 15,
  voidsteel: 16,
  obsidian: 17,
  deep_indigo_steel: 18,
  void_gold: 19,
  void_core: 20,
  amethyst_resonance: 21,
  void_rune_glow: 22,
  void_cloth: 23,
  gold: 24,
  silver: 25,
  bronze: 26,
  black_steel: 27,
  blacksteel: 28,
  holy_steel: 29,
  sanctified_gold: 30,
  divine_flame_core: 31,
  radiant_blue: 32,
  bark: 33,
  pine_needle: 34,
  skin_light: 35,
  skin_medium: 36,
  skin_dark: 37,
  skin_voidborne: 38,
  hair_black: 39,
  hair_brown: 40,
  hair_blonde: 41,
  hair_red: 42,
  hair_void: 43,
  eye_brown: 44,
  eye_blue: 45,
  eye_green: 46,
  eye_void_glow: 47,
  cloth_linen: 48,
  cloth_wool: 49,
  leather_brown: 50,
  skin_apricot_signal: 51,
  hair_midnight_teal: 52,
  hair_copper_arcade: 53,
  eye_psychic_cobalt: 54,
  cloth_star_jacket: 55,
  cloth_psychic_denim: 56,
  trim_comet_gold: 57,
  neon_mint_signal: 58,
  slime_gel: 59,
});

export const MATERIAL_OPTIONS = Object.freeze(
  Object.entries(MATERIAL_PALETTES).map(([value, config]) => Object.freeze({
    value,
    label: config.label || value,
    category: config.category || MATERIAL_CATEGORIES.SOURCE,
  }))
);

export function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export function resolveMaterialId(material) {
  const key = String(material || SOURCE_MATERIAL).trim();
  return MATERIAL_PALETTES[key] ? key : SOURCE_MATERIAL;
}

export function getMaterialDefinition(material = SOURCE_MATERIAL) {
  return MATERIAL_PALETTES[resolveMaterialId(material)];
}

export function hexToRgb(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function luminanceFromRgb(rgb) {
  if (!rgb) return 0;
  return clamp01(((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255);
}

function pickAnchoredColor(luma, anchors) {
  if (luma >= 0.88) return anchors.whiteCore;
  if (luma >= 0.66) return anchors.spectral;
  if (luma >= 0.58) return anchors.glacialLavender || anchors.frost || anchors.spectral;
  if (luma >= 0.52) return anchors.frost || anchors.body;
  if (luma >= 0.34) return anchors.body;
  if (luma >= 0.18) return anchors.deep;
  if (luma >= 0.07) return anchors.shadow;
  return anchors.void;
}

export function transmuteMaterialColor(hex, material = 'icy_fire') {
  const materialId = resolveMaterialId(material);
  const definition = MATERIAL_PALETTES[materialId];
  if (materialId === SOURCE_MATERIAL || definition.rules?.passthrough) return hex;

  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return pickAnchoredColor(luminanceFromRgb(rgb), definition.anchors);
}

export function transmuteMaterialPalette(sourcePalette, material = 'icy_fire') {
  if (!Array.isArray(sourcePalette)) return [];
  return sourcePalette.map((hex) => transmuteMaterialColor(hex, material));
}

export function transmuteMaterialPalettes(palettes, material = 'icy_fire') {
  if (!Array.isArray(palettes)) return [];
  const materialId = resolveMaterialId(material);
  return palettes.map((palette) => {
    const sourceColors = Array.isArray(palette?.colors) ? palette.colors : [];
    return {
      ...palette,
      colors: transmuteMaterialPalette(sourceColors, materialId),
      sourceColors,
      chromaticMaterial: materialId,
      materialRegistryVersion: MATERIAL_REGISTRY_VERSION,
    };
  });
}

export function transmuteMaterialCoordinates(coordinates, material = 'icy_fire') {
  if (!Array.isArray(coordinates)) return [];
  const materialId = resolveMaterialId(material);
  return coordinates.map((coord) => {
    if (!coord || typeof coord !== 'object' || typeof coord.color !== 'string') return coord;
    return {
      ...coord,
      sourceColor: coord.sourceColor || coord.color,
      color: transmuteMaterialColor(coord.color, materialId),
      chromaticMaterial: materialId,
    };
  });
}
