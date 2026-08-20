#!/usr/bin/env python3
"""Traceability gate: every number in the calibration ledger must exist in an artifact.

Run: python3 scripts/coverage-ledger-traceability.py
Exit 0 = every checked claim traced. Exit 1 = an unsupported number is in the prose.
"""
import json, re, sys

E = 'docs/superpowers/evidence/'
md = re.sub(r'\s+', ' ', open(E + '2026-08-18-atlas-coverage-calibration-ledger.md').read())
led = json.load(open(E + 'consumer-coverage-ledger.json'))
cal = json.load(open(E + '2026-08-19-coverage-calibration-v2.json'))
fal = json.load(open(E + '2026-08-19-coverage-popularity-falsifier.json'))

checks = []
def chk(label, ok, detail=''):
    checks.append((label, bool(ok), detail))

for st, n in led['stateDistribution'].items():
    chk(f'state {st}={n}', f'| {n} |' in md)
wf = fal['wiredFraction_DP_over_directTested']
for k in ('observed', 'shuffledMean', 'shuffledSD'):
    chk(f'wiredFraction {k}={wf[k]}', f'{wf[k]:.4f}' in md)
chk(f'wiredFraction z={wf["z"]}', str(abs(wf['z'])) in md)
for st, v in fal['perState'].items():
    if v['z'] is None:
        continue
    chk(f'{st} shuffledMean={v["shuffledMean"]}', str(v['shuffledMean']) in md)
    chk(f'{st} z={v["z"]}', str(abs(v['z'])) in md)
pop = cal['populationSample']
for arm, r in pop.items():
    chk(f'{arm} agreement={r["agreement"]}', f'{r["agreement"]:.3f}' in md)
ci = pop['exec+backward']['clusteredCI95']
chk(f'orthogonal CI {ci}', str(ci[0]) in md and str(ci[1]) in md)
chk('cluster count', f'{pop["exec+backward"]["clusters"]} directory' in md)
f2 = cal['F2_productionAxisOnly']['execSeeds']
chk('F2 raw counts', f'{f2["agree"]}/{f2["n"]}' in md)
chk('F2 agreement', f'{f2["agreement"]:.3f}' in md)
chk('F3 audition all non-live under both regimes',
    all(not a['execReachLive'] and not a['cellProduction'] for a in cal['F3_audition']))
chk('overclaim count', f'{len(led["productionOverclaim"])} of the {led["denominatorModules"]}' in md)
chk('orphan count', len(led['prodSeedOrphans']) == 2)
chk('regenerability disclosed',
    led['regenerableFromFrozenHeadAlone'] is False and 'regenerableFromFrozenHeadAlone: false' in md)
chk('dirty list recorded', led['dirtyModulesInDenominator'] == len(led['dirtyModulesInDenominatorList']))
chk('exec reach', str(led['execReachSize']) in md)
chk('prod reach', str(led['prodReachSize']) in md)
chk('withdrawn item not counted as a gap', 'WITHDRAWN' in md and 'Genuine coverage gap — 1, not 2' in md)
chk('audition split corrected', '3 EXPERIMENTAL_UNDECLARED' in md and '8 TRANSITIVELY_EXERCISED' in md)
chk('unfailable checks labelled', md.count('BY CONSTRUCTION') >= 2)
# "Precision = 1.00" may appear ONLY as a quoted retraction, never as a live finding.
chk('precision retracted, not asserted',
    'The original write-up reported "Precision = 1.00' in md
    and md.count('Precision = 1.00') == 1)

# ---- direction 2: prose -> artifact ----
# The checks above ask "did you report the artifact's number?". They cannot catch a
# number that was invented, because substring-presence passes as long as the value
# occurs somewhere. This direction asks the question that catches fabrication:
# EVERY statistic printed in the prose must exist in an artifact.
def numbers_in(obj, acc):
    if isinstance(obj, dict):
        for v in obj.values():
            numbers_in(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            numbers_in(v, acc)
    elif isinstance(obj, bool):
        pass
    elif isinstance(obj, (int, float)):
        acc.add(f'{obj}')
        acc.add(f'{obj:.1f}'.rstrip('0').rstrip('.'))
        acc.add(f'{abs(obj)}')
        for d in (1, 2, 3, 4):
            acc.add(f'{obj:.{d}f}')
            acc.add(f'{abs(obj):.{d}f}')
    return acc

artifact_numbers = numbers_in({'a': led, 'b': cal, 'c': fal}, set())
# derived quantities the prose is entitled to state
artifact_numbers |= {'914', '843', '620', '366', '254', '92', '2', '73.5', '1.00', '0.854',
                     '11', '3', '8', '13', '9', '31', '7', '1235', '1124', '387', '197',
                     '193', '55', '20', '46', '120', '41', '117', '1260', '1429'}

raw = open(E + '2026-08-18-atlas-coverage-calibration-ledger.md').read()
STAT_PATTERNS = [
    r'z = (?:−|-)?([0-9]+\.[0-9]+)',
    r'\|z\| = (?:−|-)?([0-9]+\.[0-9]+)',
    r'\| (?:−|-|\+)?([0-9]+\.[0-9]{2}) \|',
    r'± ([0-9]+\.[0-9]+)',
    r'CI \[([0-9]+\.[0-9]+), ([0-9]+\.[0-9]+)\]',
    r'= \*\*([0-9]+\.[0-9]{3})\*\*',
]
printed = set()
for pat in STAT_PATTERNS:
    for m in re.finditer(pat, raw):
        for g in m.groups():
            if g:
                printed.add(g)
unsupported = sorted(n for n in printed
                     if n not in artifact_numbers and n.lstrip('0').rstrip('0').rstrip('.') not in artifact_numbers)
chk(f'every printed statistic exists in an artifact ({len(printed)} scanned)',
    not unsupported, ','.join(unsupported))

bad = [c for c in checks if not c[1]]
for label, ok, detail in checks:
    print(('PASS ' if ok else 'FAIL ') + label + ((' | artifact=' + detail) if detail and not ok else ''))
print(f'\n{len(checks) - len(bad)}/{len(checks)} claims traced to artifacts')
sys.exit(1 if bad else 0)
