/**
 * Compose-backed Update Ledger shell — always-on chrome with DivWand fallback.
 */

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import DigitalRainText from '../../../components/DigitalRainText.jsx';
import { DivLayoutRenderer } from '../../../features/divwand/DivLayoutRenderer.jsx';
import '../../../features/wand/wand-tokens.css';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion.js';
import { ledgerShell } from '../../../pages/Landing/updateLedgerShellProposal.js';
import '../../../pages/Landing/UpdateLedgerWindow.css';
import {
  createUpdateLedgerScene,
  renderSceneToDomSpec,
  validateComposeScene,
  type DomNodeSpec,
} from '../packets';

export type LedgerEntryData = {
  id: string;
  date: string;
  title: string;
  summary: string;
};

const BOOT_DELAYS_MS = [400, 800, 1200] as const;

function findPartSpec(dom: DomNodeSpec, part: string): DomNodeSpec | undefined {
  return dom.children.find((child) => child.id.endsWith(`.${part}`));
}

function bootLines(entryCount: number): string[] {
  return [
    '> binding chronicle…',
    `> entries sealed: ${entryCount}`,
    '> ready.',
  ];
}

function LedgerEntry({
  entry,
  index,
  reduceMotion,
}: {
  entry: LedgerEntryData;
  index: number;
  reduceMotion: boolean;
}) {
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

function LegacyUpdateLedger({ entries }: { entries: LedgerEntryData[] }) {
  const reduceMotion = usePrefersReducedMotion();

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

function useBootSequence(entryCount: number, reduceMotion: boolean): number {
  const lines = bootLines(entryCount);
  const [visibleCount, setVisibleCount] = useState(() =>
    reduceMotion ? lines.length : 0,
  );

  useEffect(() => {
    if (reduceMotion) {
      setVisibleCount(lines.length);
      return undefined;
    }

    setVisibleCount(0);
    const timers = BOOT_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => setVisibleCount(index + 1), delay),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [entryCount, reduceMotion, lines.length]);

  return visibleCount;
}

export type ComposeUpdateLedgerProps = {
  entries: LedgerEntryData[];
};

export function ComposeUpdateLedger({ entries }: ComposeUpdateLedgerProps) {
  const reduceMotion = usePrefersReducedMotion();
  const entryCount = entries.length;

  const scene = useMemo(
    () => createUpdateLedgerScene({ entryCount }),
    [entryCount],
  );

  const sceneValid = useMemo(() => validateComposeScene(scene).ok, [scene]);

  const domSpec = useMemo(
    () => (sceneValid ? renderSceneToDomSpec(scene) : null),
    [scene, sceneValid],
  );

  const headerSpec = domSpec ? findPartSpec(domSpec, 'header') : undefined;
  const bootSpec = domSpec ? findPartSpec(domSpec, 'boot') : undefined;
  const scrollSpec = domSpec ? findPartSpec(domSpec, 'scroll') : undefined;

  const visibleBootCount = useBootSequence(entryCount, reduceMotion);
  const lines = bootLines(entryCount);

  if (!sceneValid) {
    return <LegacyUpdateLedger entries={entries} />;
  }

  return (
    <section
      className="update-ledger update-ledger--compose"
      role={domSpec?.role ?? 'region'}
      aria-label={domSpec?.attrs['aria-label'] ?? 'Scholomance Update Ledger'}
      id={domSpec?.id}
      data-compose-ledger="true"
      data-compose-scene-id={domSpec?.id}
    >
      <div className="update-ledger__frame" style={domSpec?.style}>
        <header
          className="update-ledger__header"
          id={headerSpec?.id ?? 'ledger-header'}
          data-compose-part="header"
        >
          <span className="update-ledger__chip" aria-hidden="true">
            CHRONICLE // ONLINE
          </span>
          <DigitalRainText
            text="Scholomance Ledger"
            as="h2"
            className="update-ledger__title"
            animateOnMount
          />
        </header>

        <div
          className="update-ledger__boot"
          role={bootSpec?.role ?? 'status'}
          aria-live="polite"
          id={bootSpec?.id ?? 'ledger-boot'}
          data-compose-part="boot"
        >
          {lines.slice(0, visibleBootCount).map((line) => (
            <p key={line} className="update-ledger__boot-line">
              {line}
            </p>
          ))}
        </div>

        <div
          className="update-ledger__scroll-host"
          id={scrollSpec?.id ?? 'ledger-scroll'}
          data-compose-part="scroll"
        >
          {entries.length ? (
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
          )}
        </div>
      </div>
    </section>
  );
}
