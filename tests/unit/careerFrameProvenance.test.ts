import { describe, it, expect } from 'vitest';
import { assertFrameProvenance } from '../../src/lib/career/improve/honesty/frame-provenance';
import type { PhraseFrame } from '../../src/lib/career/improve/jd-phrase-frame';

const frame: PhraseFrame = {
  text: 'Used Apache Airflow for orchestration, ␟',
  slots: [{ placeholder: 'the result', hint: 'the result it produced' }],
  sourceClause: '- Experience with Apache Airflow for orchestration',
  sourceSpan: { coordinateSpace: 'raw', start: 0, end: 49 },
};

describe('assertFrameProvenance', () => {
  it('accepts a bullet whose every token comes from the JD clause or a slot value', () => {
    const after = 'Used Apache Airflow for orchestration, cutting nightly runtime by 40%';
    expect(assertFrameProvenance(after, frame, ['cutting nightly runtime by 40%']).ok).toBe(true);
  });

  it('refuses a token that came from neither the clause nor a slot', () => {
    // "Kubernetes" is in neither the JD clause nor anything the candidate typed.
    const after = 'Used Apache Airflow and Kubernetes for orchestration, saved time';
    const verdict = assertFrameProvenance(after, frame, ['saved time']);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('unprovenanced_frame_token');
  });

  it('allows closed-class connective words', () => {
    const after = 'Used Apache Airflow for the orchestration of our pipelines, saved time';
    expect(assertFrameProvenance(after, frame, ['saved time', 'pipelines']).ok).toBe(true);
  });

  it('refuses an unfilled draft — a sentinel may never reach the résumé', () => {
    const verdict = assertFrameProvenance(frame.text, frame, []);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('unfilled_slot');
  });
});
