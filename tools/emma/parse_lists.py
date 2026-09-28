#!/usr/bin/env python3
"""Parse official word lists into raw headword lists (tools/emma/raw/*.json).
Sources (see data/SOURCES.md):
  - 义务教育英语课程标准(2022年版) 附录 三级词汇表 (1600 words; '*' = 二级/小学)
  - 普通高中英语课程标准(2017年版2025年修订) 附录2 词汇表 (3100; '*' 必修, '**' 选择性必修)
  - Cambridge A2 Key / B1 Preliminary Vocabulary Lists (Aug 2025, © UCLES / CUPA)
Usage: parse_lists.py SRC_DIR OUT_DIR
"""
import json, re, sys, os, html
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def clean_entry(s):
    """'colour (AmE color) *' -> ('colour', star_count, 'colour (AmE color)')"""
    s = html.unescape(s).replace('\\*', '*').replace('$^{*}$', '*').strip()
    stars = s.count('*')
    s = s.replace('*', '').strip()
    return s, stars

def headwords_from(entry):
    """return list of usable headwords from an entry like 'actor / actress', 'mobile (mobile phone)'"""
    raw = entry
    # AmE variants / pl / = expansions in parentheses -> drop
    base = re.sub(r'\((?:AmE|pl\.|=|BrE)[^)]*\)', '', raw)
    base = re.sub(r'\(\s*(to|of)\s*\)', '', base)   # according (to)
    m = re.search(r'\(([^)]*)\)', base)
    paren = m.group(1).strip() if m else ''
    base = re.sub(r'\([^)]*\)', '', base).strip()
    parts = [p.strip() for p in base.split('/') if p.strip()]
    return parts, paren

# ---------- 初中 2022 ----------
t = open(os.path.join(SRC, 'yw2.md'), encoding='utf-8').read().split('\n')
body = '\n'.join(t[29:119])   # A .. Z  (before 数词表)
cells = []
incsv = False
for line in body.split('\n'):
    line = line.strip()
    if line.startswith('```'):
        incsv = line != '```' ; continue
    if incsv and line:
        m = re.fullmatch(r'(\S+(?: \([^)]*\))?(?: ?\*)?) (.+)', line)
        if m: cells += [m.group(1), m.group(2)]; continue
    if not line or line.startswith('#'): continue
    if '<table>' in line:
        cells += re.findall(r'<td>(.*?)</td>', line)
    else:
        cells += re.split(r'\s{1,}(?=[a-zA-Z])', line) if False else [line]
# plain lines may hold 2 words ("ability abroad") -> split carefully
items = []
pending = ''
for c in cells:
    c = c.strip()
    if not c or re.fullmatch(r'[A-Z]', c): continue
    if re.fullmatch(r'[A-Z] .+', c): c = c[2:]
    if pending:
        c = pending + ' ' + c; pending = ''
    if c.count('(') > c.count(')'):
        pending = c; continue
    # plain-text line with two single words
    if '<' not in c and re.fullmatch(r'[a-z]+ [a-z]+', c) and c not in ('ice cream', 'kung fu', 'mobile phone'):
        a, b = c.split(); items += [a, b]; continue
    items.append(c)
jr = []
seen = set()
for it in items:
    e, stars = clean_entry(it)
    if not e: continue
    words, paren = headwords_from(e)
    for w in words:
        k = w.lower()
        if k in seen: continue
        seen.add(k)
        jr.append({'w': w, 'raw': e, 'primary': stars > 0})
# extra sets listed separately: numbers / months / weekdays
extra = []
sec = '\n'.join(t[119:130])
for c in re.findall(r'<td>(.*?)</td>', sec):
    c = c.strip()
    if c and re.fullmatch(r'[a-zA-Z\- ]+', c) and c.lower() not in seen:
        seen.add(c.lower()); extra.append(c)
mon = '\n'.join(t[124:130])
json.dump({'core': jr, 'sets': extra}, open(os.path.join(OUT, 'junior2022.json'), 'w'), ensure_ascii=False, indent=0)
print('junior', len(jr), 'primary', sum(1 for x in jr if x['primary']), 'sets', len(extra))

# ---------- 高中 ----------
g = open(os.path.join(SRC, 'gz.md'), encoding='utf-8').read().split('\n')
sr = []
seen2 = set()
for line in g[2397:5665]:
    s = line.strip()
    if not s or re.fullmatch(r'[A-Z]', s) or re.fullmatch(r'\d+', s) or '课程标准' in s or '附录' in s:
        continue
    e, stars = clean_entry(s)
    words, paren = headwords_from(e)
    for w in words:
        if w.lower() in seen2: continue
        seen2.add(w.lower())
        sr.append({'w': w, 'raw': e, 'stars': stars})
json.dump(sr, open(os.path.join(OUT, 'senior2025.json'), 'w'), ensure_ascii=False, indent=0)
from collections import Counter
print('senior', len(sr), Counter(x['stars'] for x in sr))

# ---------- Cambridge ----------
def cam(fn, name):
    L = open(os.path.join(SRC, fn), encoding='utf-8').read().split('\n')
    stop = next(i for i, l in enumerate(L) if l.strip() == 'Appendix 1' and i > 200)
    out, seen3 = [], set()
    for l in L[:stop]:
        s = l.strip()
        m = re.fullmatch(r"([A-Za-z][A-Za-z '’./\-()]*?) \(([a-z][a-z &,]*)\)(?: \(.*\))?", s)
        if not m or not (set(re.split(r'[ &,]+', m.group(2))) & {'v','n','adj','adv','prep','det','pron','conj','exclam','mv','av','phr','pl','sing'}): continue
        head, pos = m.group(1).replace('’', "'"), m.group(2)
        if head.endswith('.') or head.startswith(('sb', 'upon', 'to ', 'a ', 'of ')) or head.count('(') != head.count(')'):
            continue
        def fixp(mm):
            inner = mm.group(1)
            first = inner.split('/')[0].strip()
            if first in ('on', 'with', 'by', 'at', 'in', 'for', 'about', 'to', 'from'):
                return ' ' + first
            return ''
        head = re.sub(r"\(([^)]*)\)", fixp, head)          # blond(e)->blond, depend (on/upon)->depend on
        head = re.sub(r'\s+', ' ', head).strip()
        for h in head.split('/'):
            h = h.strip()
            if not h or h.lower() in seen3: continue
            seen3.add(h.lower()); out.append({'w': h, 'pos': pos})
    json.dump(out, open(os.path.join(OUT, name), 'w'), ensure_ascii=False, indent=0)
    print(name, len(out))
cam('keyr.txt', 'ket2025.json')
cam('petr.txt', 'pet2025.json')
