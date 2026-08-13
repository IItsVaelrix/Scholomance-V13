#!/usr/bin/env python3
r"""Measure what corpus sanitation was worth — and read the LIMITATION first.

  python3 scripts/audit_corpus_damage.py [OLD.sqlite] [NEW.sqlite]

─── THIS MEASUREMENT IS NOT INDEPENDENT ───────────────────────────────────

Its damage predicates are the SAME RULES the sanitizer enforces:

  predicate `raw-line-wrap`       vs  contract does replace(/\s+/g, ' ')
  predicate `heading-as-sentence` vs  contract quarantines the same regex
  predicate `truncated-at-title`  vs  contract protects the same title list

So a post-sanitation reading of 0.00% is guaranteed by construction, not
observed. It restates what the code does. Quoting it as a quality improvement is
a check that cannot fail, and the first version of this script was quoted
exactly that way.

Worse, the heading predicate was TUNED mid-flight: it reported 13 defects, they
were judged false positives, and it was made case-sensitive to agree with the
contract. Changing the instrument until it agrees with the thing it measures is
the failure this file exists to catch.

─── WHAT IT IS LEGITIMATELY FOR ───────────────────────────────────────────

Answering "how far does this corpus depart from the current contract" — a
conformance check, useful for finding residue in an OLD artifact. Nothing here
licenses a claim that text is better, only that it conforms.

And the two damage classes must never be summed, because they are not the same
kind of harm:

  DESTRUCTION  a word is gone and only the raw source can restore it
               (1,761 records, 1.52% of the pre-sanitation corpus)
  FORMATTING   every character is present, the whitespace differs
               (43,425 records, 37.54% — 98.7% of the headline "38%")

For an independent signal, ask something the sanitizer does not control. The
grammar is one: parse rate over a matched sample moved 40.23% -> 39.82%, i.e.
NOT better, exactly as the Failure Tribunal predicted — whole sentences are
harder to parse than the fragments that preceded them.
"""
import sqlite3, re, os
import sys
OLD = sys.argv[1] if len(sys.argv) > 1 else 'scholomance_corpus.sqlite.pre-sanitation.bak'
NEW = sys.argv[2] if len(sys.argv) > 2 else 'scholomance_corpus.sqlite'
def openro(p): return sqlite3.connect(f'file:{p}?mode=ro', uri=True)

TRUNC = re.compile(r'\b(Mr|Mrs|Dr|St|Messrs|Prof|Rev|Capt|Col|Gen|Lt|Sgt|Ms|Mme|Mlle)\.$')
def damaged(text):
    reasons = []
    if TRUNC.search(text.strip()): reasons.append('truncated-at-title')
    if '\n' in text or '\r' in text: reasons.append('raw-line-wrap')
    # CASE-SENSITIVE, matching the contract. The loose version flagged WordNet
    # phrases ('book fair') and Joyce's telegraphic prose ('Act speech.') as
    # structural matter — a measurement that manufactures its own damage.
    if re.match(r'^(CHAPTER|BOOK|PART|ACT|SCENE|CANTO)\b', text.strip()): reasons.append('heading-as-sentence')
    if text.strip().startswith('[Illustration'): reasons.append('illustration-as-sentence')
    if re.match(r'^[\s*_]+$', text): reasons.append('markup-as-sentence')
    return reasons

print('══ 0. NOT INDEPENDENT: these predicates ARE the sanitizer rules. 0% post-sanitation')
print('══    is guaranteed by construction. Read the module docstring before quoting it.')
print()
print('══ 1. CONFORMANCE: what fraction of every record departs from the contract? ══')
for label, path in (('OLD', OLD), ('NEW', NEW)):
    c = openro(path)
    total = c.execute('SELECT COUNT(*) FROM sentence').fetchone()[0]
    bad = 0; kinds = {}
    for (t,) in c.execute('SELECT text FROM sentence'):
        rs = damaged(t)
        if rs:
            bad += 1
            for r in rs: kinds[r] = kinds.get(r, 0) + 1
    print(f'  {label}: {bad:6}/{total} damaged  ({bad/total*100:5.2f}%)   {kinds}')
    c.close()

print('\n══ 2. AT THE POINT OF USE: FTS results a caller actually receives ══')
QUERIES = ['wound','shadow','blood','light','heart','moon','fire','death','love','night',
           'silence','dream','storm','river','bone','crown','mirror','winter','ghost','iron']
for label, path in (('OLD', OLD), ('NEW', NEW)):
    c = openro(path)
    served = 0; bad = 0
    for q in QUERIES:
        rows = c.execute("SELECT text FROM sentence_fts WHERE sentence_fts MATCH ? LIMIT 20", (q,)).fetchall()
        for (t,) in rows:
            served += 1
            if damaged(t): bad += 1
    print(f'  {label}: {bad:4}/{served} served records damaged  ({bad/served*100:5.2f}%)  over {len(QUERIES)} queries x 20')
    c.close()

print('\n══ 3. RECALL: records the old corpus could never return ══')
c_old, c_new = openro(OLD), openro(NEW)
for q in ['Bennet','Watson','Gardiner','Collins','Philips']:
    o = c_old.execute("SELECT COUNT(*) FROM sentence_fts WHERE sentence_fts MATCH ?", (q,)).fetchone()[0]
    n = c_new.execute("SELECT COUNT(*) FROM sentence_fts WHERE sentence_fts MATCH ?", (q,)).fetchone()[0]
    print(f'  {q:10} OLD {o:5}   NEW {n:5}   {n-o:+d}')
