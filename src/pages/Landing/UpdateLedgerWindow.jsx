import { motion } from 'framer-motion';
import ledgerSource from '../../data/update-ledger.json?raw';
import { DivLayoutRenderer } from '../../features/divwand/DivLayoutRenderer.jsx';
import '../../features/wand/wand-tokens.css';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { parseLedgerEntries } from './updateLedgerModel.js';
import { ledgerShell } from './updateLedgerShellProposal.js';
import './UpdateLedgerWindow.css';

function LedgerEntry({ entry, index, reduceMotion }) {
  const body = (
    <>
      <time className="update-ledger__date" dateTime={entry.date}>
        {entry.date}
      </time>
      <h3 className="update-ledger__entry-title">{entry.title}</h3>
      <p className="update-ledger__summary">{entry.summary}</p>
    </>
  );

  if (reduceMotion) {
    return <li className="update-ledger__entry">{body}</li>;
  }

  return (
    <motion.li
      className="update-ledger__entry"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.04, 0.4),
        ease: 'easeOut',
      }}
    >
      {body}
    </motion.li>
  );
}

export default function UpdateLedgerWindow({ source } = {}) {
  const reduceMotion = usePrefersReducedMotion();
  const entries = parseLedgerEntries(source ?? ledgerSource, 30);

  return (
    <section
      className="update-ledger"
      role="region"
      aria-label="Scholomance Update Ledger"
    >
      <DivLayoutRenderer
        proposal={ledgerShell}
        slots={{
          title: (
            <h2 className="update-ledger__title">Scholomance Update Ledger</h2>
          ),
          content: entries.length ? (
            <ol className="update-ledger__entries" tabIndex={0}>
              {entries.map((entry, index) => (
                <LedgerEntry
                  key={entry.id}
                  entry={entry}
                  index={index}
                  reduceMotion={reduceMotion}
                />
              ))}
            </ol>
          ) : (
            <p className="update-ledger__empty">Chronicle awaiting first entry</p>
          ),
        }}
      />
    </section>
  );
}
