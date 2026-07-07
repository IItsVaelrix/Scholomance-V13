import { validateDivProposal } from '../engine.adapter.js';
import { createDivWandArtifact } from './artifactSchemas.js';
import { serializeStable } from './stableSerialize.js';

export function buildDivWandGodotExport(proposal) {
  const validation = validateDivProposal(proposal);
  const artifact = createDivWandArtifact({ proposal, validation });

  return `${serializeStable(artifact)}\n`;
}
