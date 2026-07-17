import { validateProposal } from '../engine.adapter.js';
import { createWandArtifact } from './artifactSchemas.js';
import { serializeStable } from './stableSerialize.js';

export function buildWandGodotExport(proposal) {
  const validation = validateProposal(proposal);
  const artifact = createWandArtifact({ proposal, validation });

  return `${serializeStable(artifact)}\n`;
}
