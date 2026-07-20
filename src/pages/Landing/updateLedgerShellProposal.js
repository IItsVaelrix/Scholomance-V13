import { validateDivProposal } from '../../features/divwand/validateDivProposal.js';

export const UPDATE_LEDGER_SHELL_PROPOSAL = {
  rationale: 'Landing twin-gate Update Ledger crystal frame.',
  confidence: 1,
  reviewRequired: false,
  sourceIntentHash: 'landing-update-ledger-shell-v1',
  proposedLayout: {
    id: 'ledger-root',
    type: 'container',
    role: 'card',
    style: { variant: 'glassmorphic', glowColor: 'psychic', borderRadius: 12 },
    layout: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: 16,
      gap: 12,
    },
    children: [
      {
        id: 'ledger-header',
        type: 'container',
        role: 'header',
        layout: { display: 'flex', alignItems: 'center', height: 48 },
        style: { variant: 'transparent' },
        children: [],
      },
      {
        id: 'ledger-scroll',
        type: 'container',
        role: 'content',
        style: { variant: 'obsidianPanel', borderRadius: 8 },
        layout: {
          display: 'flex',
          flexDirection: 'column',
          padding: 12,
          gap: 10,
        },
        children: [],
      },
    ],
  },
};

export const SAFE_LEDGER_SHELL = {
  rationale: 'Minimal safe Update Ledger shell.',
  confidence: 1,
  reviewRequired: false,
  proposedLayout: {
    id: 'ledger-safe-root',
    type: 'container',
    role: 'card',
    style: { variant: 'obsidianPanel', borderRadius: 8 },
    layout: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: 16,
      gap: 8,
    },
    children: [
      {
        id: 'ledger-safe-header',
        type: 'container',
        role: 'header',
        layout: { height: 40 },
        style: { variant: 'transparent' },
        children: [],
      },
      {
        id: 'ledger-safe-content',
        type: 'container',
        role: 'content',
        layout: { display: 'flex', flexDirection: 'column' },
        style: { variant: 'transparent' },
        children: [],
      },
    ],
  },
};

const outcome = validateDivProposal(UPDATE_LEDGER_SHELL_PROPOSAL);
export const ledgerShell = outcome.valid ? UPDATE_LEDGER_SHELL_PROPOSAL : SAFE_LEDGER_SHELL;
