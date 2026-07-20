import ledgerSource from '../../data/update-ledger.json?raw';
import { ComposeUpdateLedger } from '../../core/compose/migrated/ComposeUpdateLedger';
import { parseLedgerEntries } from './updateLedgerModel.js';
import './UpdateLedgerWindow.css';

export default function UpdateLedgerWindow({ source } = {}) {
  const entries = parseLedgerEntries(source ?? ledgerSource, 30);
  return <ComposeUpdateLedger entries={entries} />;
}
