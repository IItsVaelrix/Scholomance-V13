const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const CONSTELLATION_CHANNELS = Object.freeze([
  { id: 'identity', label: 'Phrase identity', targetId: 'cos-masthead-query', tone: 'gold' },
  { id: 'meaning', label: 'Meaning field', targetId: 'cos-leximancy', tone: 'amethyst' },
  { id: 'sound', label: 'Sound field', targetId: 'cos-rhyme', tone: 'arc' },
  { id: 'genome', label: 'Phrase genome', targetId: 'cos-genome', tone: 'amethyst' },
  { id: 'readings', label: 'Readings', targetId: 'cos-readings', tone: 'gold' },
  { id: 'scale', label: 'Scale field', targetId: 'cos-scale', tone: 'arc' },
  { id: 'discovery', label: 'Discovery field', targetId: 'cos-discovery', tone: 'amethyst' },
  { id: 'provenance', label: 'Provenance', targetId: 'cos-provenance', tone: 'gold' },
]);

const CHANNEL_POSITIONS = Object.freeze({
  meaning: [-4.15, 1.55, -0.8],
  sound: [4.15, 1.35, -0.45],
  genome: [0.15, -2.55, 0],
  readings: [-3.45, -2.3, -1.5],
  scale: [3.55, -2.2, -1.65],
  discovery: [0, 3.35, -2.1],
  provenance: [0, -4.15, -3.2],
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function childPosition(origin, index, total, phase) {
  const angle = phase + index * GOLDEN_ANGLE;
  const spread = total > 6 ? 1.6 : 1.25;
  const radius = spread * (0.62 + ((index % 3) * 0.16));
  return [
    origin[0] + Math.cos(angle) * radius,
    origin[1] + Math.sin(angle) * radius,
    origin[2] + Math.sin(angle * 1.7) * 0.62,
  ];
}

function stablePhase(value) {
  let hash = 2166136261;
  const text = String(value ?? 'CONSTELLATION-OS');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2;
}

function channelItems(packet, channelId) {
  switch (channelId) {
    case 'identity':
      return [
        { id: 'kind', label: packet.query.kind, magnitude: 0.66 },
        { id: 'tokens', label: `${packet.query.tokenCount} tokens`, magnitude: 0.58 },
        ...(packet.query.intent ? [{ id: 'intent', label: packet.query.intent, magnitude: 0.72 }] : []),
      ];
    case 'meaning':
      return (packet.leximancy?.interpretations ?? []).slice(0, 8).map((item) => ({
        id: item.id,
        label: item.gloss,
        magnitude: 0.56 + clamp(item.confidence) * 0.42,
      }));
    case 'sound': {
      const phonemes = (packet.rhymeAstrology?.phonemes ?? []).slice(0, 9).map((phoneme, index) => ({
        id: `phoneme-${index}`,
        label: phoneme,
        magnitude: /[012]$/.test(phoneme) ? 0.92 : 0.64,
      }));
      const rhymes = (packet.rhymeAstrology?.exactRhymes ?? []).slice(0, 4).map((rhyme) => ({
        id: `rhyme-${rhyme}`,
        label: rhyme,
        magnitude: 0.58,
      }));
      return [...phonemes, ...rhymes];
    }
    case 'genome':
      return [
        ...(packet.phraseGenome?.devicesHint ?? []).slice(0, 6).map((device) => ({
          id: `device-${device}`,
          label: device,
          magnitude: 0.68,
        })),
        ...(packet.phraseGenome?.schoolHint
          ? [{ id: 'school', label: packet.phraseGenome.schoolHint, magnitude: 0.9 }]
          : []),
      ];
    case 'readings':
      return (packet.readings?.readings ?? []).slice(0, 8).map((reading, index) => ({
        id: `${reading.anchor}-${reading.role}-${index}`,
        label: `${reading.anchor} · ${reading.role.replace(/-/g, ' ')}`,
        magnitude: reading.candidate ? 0.82 : 0.56,
      }));
    case 'scale':
      return (packet.scaleField?.scale?.ladder ?? []).slice(0, 10).map((step) => ({
        id: `scale-${step.word}`,
        label: `${step.word} · ${Number(step.relative).toFixed(2)}`,
        magnitude: step.isAnchor ? 1 : 0.5 + clamp(step.relative) * 0.35,
      }));
    case 'discovery':
      return (packet.discovery?.hits ?? []).slice(0, 10).map((hit) => ({
        id: `discovery-${hit.token}`,
        label: hit.token,
        magnitude: 0.52 + clamp(hit.score) * 0.46,
      }));
    case 'provenance':
      return Object.entries(packet.provenance?.engineVersions ?? {}).slice(0, 7).map(([name, version]) => ({
        id: `engine-${name}`,
        label: `${name} · ${version}`,
        magnitude: 0.54,
      }));
    default:
      return [];
  }
}

function channelAvailable(packet, channelId) {
  switch (channelId) {
    case 'identity': return true;
    case 'meaning': return Boolean(packet.leximancy);
    case 'sound': return Boolean(packet.rhymeAstrology);
    case 'genome': return Boolean(packet.phraseGenome);
    case 'readings': return Boolean(packet.readings?.readings?.length);
    case 'scale': return Boolean(packet.scaleField);
    case 'discovery': return Boolean(packet.discovery);
    case 'provenance': return Boolean(packet.provenance);
    default: return false;
  }
}

/**
 * Presentation-only projection. It maps the authoritative page packet into a
 * deterministic spatial index and never computes literary or scoring truth.
 */
export function projectConstellationPacket(packet) {
  const pagePhase = stablePhase(packet.pageBytecode);
  const nodes = [];
  const edges = [];
  const channels = CONSTELLATION_CHANNELS.filter((channel) => channelAvailable(packet, channel.id));

  const queryNode = {
    id: 'query-lodestar',
    channelId: 'identity',
    label: packet.query.raw,
    kind: 'lodestar',
    tone: 'gold',
    magnitude: 1.35,
    position: [0, 0.35, 1.35],
  };
  nodes.push(queryNode);

  channels.forEach((channel, channelIndex) => {
    const items = channelItems(packet, channel.id);
    if (channel.id === 'identity') {
      items.forEach((item, itemIndex) => {
        const node = {
          ...item,
          id: `identity-${item.id}`,
          channelId: channel.id,
          kind: 'satellite',
          tone: channel.tone,
          position: childPosition(queryNode.position, itemIndex, items.length, pagePhase),
        };
        nodes.push(node);
        edges.push({ id: `${queryNode.id}-${node.id}`, from: queryNode.id, to: node.id, channelId: channel.id });
      });
      return;
    }

    const position = CHANNEL_POSITIONS[channel.id];
    const anchor = {
      id: `channel-${channel.id}`,
      channelId: channel.id,
      label: channel.label,
      kind: 'channel',
      tone: channel.tone,
      magnitude: 0.88,
      position,
    };
    nodes.push(anchor);
    edges.push({ id: `${queryNode.id}-${anchor.id}`, from: queryNode.id, to: anchor.id, channelId: channel.id });

    items.forEach((item, itemIndex) => {
      const node = {
        ...item,
        id: `${channel.id}-${item.id}`,
        channelId: channel.id,
        kind: 'satellite',
        tone: channel.tone,
        position: childPosition(
          position,
          itemIndex,
          items.length,
          pagePhase + channelIndex * 0.73,
        ),
      };
      nodes.push(node);
      edges.push({ id: `${anchor.id}-${node.id}`, from: anchor.id, to: node.id, channelId: channel.id });
    });
  });

  return {
    id: packet.pageBytecode,
    nodes,
    edges,
    channels,
  };
}
