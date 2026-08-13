#!/usr/bin/env python3
"""Measure what corpus sanitation was worth, at the point of use.

  python3 scripts/audit_corpus_damage.py [OLD.sqlite] [NEW.sqlite]

Three questions, because a single "damaged records" number answers none of them:

  1. GLOBAL     what fraction of every stored record is malformed?
  2. AT USE     what fraction of the records a CALLER RECEIVES is malformed?
                A global rate says nothing about exposure; FTS ranking decides
                which records people actually see.
  3. RECALL     which records could the old corpus never return at all?

The damage predicates are deliberately case-SENSITIVE. The first version flagged
WordNet phrases ("book fair") and Joyce's telegraphic prose ("Act speech.") as
structural matter, i.e. it manufactured 13 defects that were not there. A
measurement that inflates its own subject is the failure it is trying to report.
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

print('══ 1. GLOBAL: what fraction of every record is damaged? ══')
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
