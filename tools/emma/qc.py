#!/usr/bin/env python3
"""Quality checks for Emma data. Usage: qc.py REPO_DIR [ECDICT_CSV] [--sample N]"""
import csv, json, os, re, sys, random, collections
REPO = sys.argv[1]
EC = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
csv.field_size_limit(10**9)
lv = os.path.join(REPO, 'data', 'emma', 'levels'); sc = os.path.join(REPO, 'data', 'emma', 'scenes')
levels = {f[:-5]: json.load(open(os.path.join(lv, f))) for f in sorted(os.listdir(lv)) if f.endswith('.json') and f != 'index.json'}
need = set(w['w'].lower() for d in levels.values() for g in d['groups'] for w in g['words'])
INFL = collections.defaultdict(set)
if EC:
    for row in csv.DictReader(open(EC, encoding='utf-8')):
        k = row['word'].lower()
        if k in need or k.split(' ')[0] in need:
            for part in (row['exchange'] or '').split('/'):
                if ':' in part: INFL[k].add(part.split(':', 1)[1].lower())
def forms(k):
    f = {k, k + 's', k + 'es', k + 'ed', k + 'd', k + 'ing', k + "'s"} | INFL.get(k, set())
    if k.endswith('y'): f |= {k[:-1] + 'ies', k[:-1] + 'ied'}
    if k.endswith('e'): f.add(k[:-1] + 'ing')
    if re.search(r'[^aeiou][aeiou][bdgmnprt]$', k): f |= {k + k[-1] + 'ed', k + k[-1] + 'ing', k + k[-1] + 'er'}
    return f
def has(ex, w):
    k = w.lower(); low = ex.lower().replace('’', "'")
    if ' ' in k:
        t = [x for x in k.split(' ')]
        gap = r"(\s+\S+){0,2}?\s+"
        pat = '|'.join(re.escape(f) for f in forms(t[0]))
        rest = [x for x in t[1:] if x not in ('somebody', 'sb', 'sth', 'something')]
        if re.search(r'\b(' + pat + r')' + ''.join(gap + re.escape(x) for x in rest) + r'\b', low): return True
        return any(re.search(r'\b' + re.escape(f + (' ' + ' '.join(t[1:]) if len(t) > 1 else '')) + r'\b', low) for f in forms(t[0])) or k in low
    toks = re.findall(r"[a-z0-9'.\-]+", low)
    toks += [x.strip("'.") for x in toks]
    return bool(set(toks) & forms(k)) or k in low
total_fail = 0; report = {}
for lid, d in levels.items():
    ws = [w for g in d['groups'] for w in g['words']]
    c = collections.Counter()
    seen = set()
    for w in ws:
        k = w['w'].lower()
        if k in seen: c['dup_headword'] += 1
        seen.add(k)
        if not w.get('z', '').strip(): c['empty_cn'] += 1
        if not w.get('i'): c['no_ipa'] += 1
        if not w.get('e') or not w.get('c'): c['no_example'] += 1
        elif not has(w['e'], w['w']): c['example_missing_headword'] += 1; print('  ex?', lid, w['w'], '|', w['e'])
        if not w.get('k'): c['no_collocation'] += 1
        zz = re.sub(r'\b(n|v|adj|adv|prep|pron|conj|int|num|det|art|aux|modal verb|abbr|phr|pl|vt|vi)\.', '', w.get('z', ''))
        if re.search(r'[\n\t]', zz) or re.search(r'[a-z]{3,}', zz) and not re.search(r'think|can not|a lot of|a little|be born|according to|deal with|in spite of|in advance|Yours sincerely|find|with', zz): c['cn_has_latin'] += 1; print('  cn?', lid, w['w'], zz)
    groups = len(d['groups']); sizes = set(len(g['words']) for g in d['groups'][:-1])
    report[lid] = {'entries': len(ws), 'groups': groups, 'group_sizes': sorted(sizes), **{k: v for k, v in c.items()}}
    total_fail += sum(v for k, v in c.items() if k in ('dup_headword', 'empty_cn', 'no_ipa', 'no_example', 'example_missing_headword'))
print(json.dumps(report, ensure_ascii=False, indent=1))
# scenes
sres = {}
for f in sorted(os.listdir(sc)):
    if f == 'index.json' or not f.endswith('.json'): continue
    s = json.load(open(os.path.join(sc, f)))
    for sub in s['subs']:
        issues = []
        n = len(sub['words'])
        if not 20 <= n <= 30: issues.append('words=%d' % n)
        if len(set(w['w'].lower() for w in sub['words'])) != n: issues.append('dup word')
        for w in sub['words']:
            if not w['z'] or not w['i']: issues.append('missing cn/ipa ' + w['w'])
            if not w.get('e'): issues.append('no ctx ' + w['w'])
        if not 6 <= len(sub['patterns']) <= 10: issues.append('patterns=%d' % len(sub['patterns']))
        for p in sub['patterns']:
            if not p['zh'] or not p['sit']: issues.append('pattern cn/sit ' + p['en'])
        if len(sub['dialogues']) != 2: issues.append('dialogues=%d' % len(sub['dialogues']))
        for dl in sub['dialogues']:
            if not 6 <= len(dl['lines']) <= 12: issues.append('turns=%d %s' % (len(dl['lines']), dl['title']))
            if 'E' not in dl['roles']: issues.append('no Emma role')
            for l in dl['lines']:
                if not l['zh'].strip() or not l['en'].strip(): issues.append('empty line')
        sres[s['id'] + '/' + sub['id']] = issues or 'OK'
        total_fail += len(issues)
print(json.dumps(sres, ensure_ascii=False, indent=1))
if '--sample' in sys.argv:
    n = int(sys.argv[sys.argv.index('--sample') + 1]); random.seed(2026)
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    allw = [(lid, w) for lid, d in levels.items() if not only or lid == only for g in d['groups'] for w in g['words']]
    for lid, w in random.sample(allw, n):
        print('%s\t%s\t%s\t%s\t%s\t%s\t%s' % (lid, w['w'], w['p'], w['i'], w['z'], w.get('e'), w.get('c')))
print('TOTAL HARD FAILURES:', total_fail)
