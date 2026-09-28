#!/usr/bin/env python3
"""Build data/emma/scenes/*.json from the hand-written scene scripts in tools/emma/scenes/*.txt.
DSL:  # id | 中文名 | emoji | purpose
      ## subid | 子场景名
      W: word/phrase | 中文
      P: sentence | 中文 | situation (中文, used for 情景选句)
      D: title | A=Role/角色, E=Emma/艾玛
      A: line | 中文
Usage: build_scenes.py CMUDICT_PATH REPO_DIR
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ipa_util
ipa_util.init(sys.argv[1])
REPO = sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(REPO, 'data', 'emma', 'scenes'); os.makedirs(OUT, exist_ok=True)
ORDER = [('campus', '校园与课堂', '🏫'), ('homestay', '宿舍与寄宿家庭', '🏠'), ('restaurant', '餐厅点餐', '🍽️'),
         ('supermarket', '超市购物', '🛒'), ('transport', '交通出行', '🚌'), ('airport', '机场与入境', '✈️'),
         ('doctor', '看病与药店', '🏥'), ('bank', '银行与手机卡', '💳'), ('renting', '租房', '🔑'),
         ('social', '交友社交', '🤝'), ('sports', '运动娱乐', '⚽'), ('emergency', '求助与紧急情况', '🆘')]

def find_ctx(word, lines):
    toks = word.lower().replace('(', '').replace(')', '').split()
    def tp(t, last):
        if t == 'be': return r'(be|am|is|are|was|were|been|being|\'m|\'re|\'s)'
        if t in ('your', 'my'): return r'(my|your|his|her|our|their)'
        if t in ('you', 'me'): return r'(you|me|him|her|us|them)'
        return re.escape(t) + (r"(s|es|ed|d|ing|'s)?" if last or t == toks[0] else '')
    parts = [tp(t, j == len(toks) - 1) for j, t in enumerate(toks)]
    pat = r"\b" + r"\s+".join(parts) + r"\b"
    for en, zh in lines:
        if re.search(pat, en, re.I): return en, zh
    return None

def parse(path):
    scene = None; sub = None; dlg = None
    for raw in open(path, encoding='utf-8'):
        line = raw.rstrip('\n')
        if not line.strip(): continue
        if line.startswith('## '):
            sid, title = [x.strip() for x in line[3:].split('|')]
            sub = {'id': sid, 'title': title, 'words': [], 'patterns': [], 'dialogues': []}
            scene['subs'].append(sub); dlg = None; continue
        if line.startswith('# '):
            sid, title, emoji, purpose = [x.strip() for x in line[2:].split('|')]
            scene = {'id': sid, 'title': title, 'emoji': emoji, 'purpose': purpose, 'subs': []}; continue
        tag, body = line.split(':', 1)
        parts = [x.strip() for x in body.split('|')]
        if tag == 'W':
            wd = {'w': parts[0], 'z': parts[1], 'i': ipa_util.ipa_of(parts[0])}
            if len(parts) >= 4: wd['e'], wd['c'] = parts[2], parts[3]
            sub['words'].append(wd)
        elif tag == 'P':
            sub['patterns'].append({'en': parts[0], 'zh': parts[1], 'sit': parts[2] if len(parts) > 2 else ''})
        elif tag == 'D':
            roles = {}
            for r in parts[1].split(','):
                k, v = r.strip().split('=')
                en, zh = (v.split('/') + [''])[:2]
                roles[k.strip()] = {'en': en.strip(), 'zh': zh.strip()}
            dlg = {'title': parts[0], 'roles': roles, 'lines': []}
            sub['dialogues'].append(dlg)
        else:
            assert dlg is not None and tag in dlg['roles'], (path, line)
            dlg['lines'].append({'r': tag, 'en': parts[0], 'zh': parts[1]})
    for sub in scene['subs']:
        pool = [(l['en'], l['zh']) for d in sub['dialogues'] for l in d['lines']] + [(p['en'], p['zh']) for p in sub['patterns']]
        for w in sub['words']:
            if 'e' in w: continue
            c = find_ctx(w['w'], pool)
            if not c and w['w'].lower() in EXTRA:
                lst = EXTRA[w['w'].lower()]; k = USED.get(w['w'].lower(), 0)
                c = lst[min(k, len(lst) - 1)]; USED[w['w'].lower()] = k + 1
            if c: w['e'], w['c'] = c
    return scene

EXTRA = {}
for line in open(os.path.join(HERE, 'scenes', '_examples.tsv'), encoding='utf-8'):
    if line.strip() and not line.startswith('#'):
        a = line.rstrip('\n').split('\t'); EXTRA.setdefault(a[0].lower(), []).append((a[1], a[2]))
USED = {}
index = []
built = {}
for f in sorted(os.listdir(os.path.join(HERE, 'scenes'))):
    if f.endswith('.txt'):
        sc = parse(os.path.join(HERE, 'scenes', f))
        built[sc['id']] = sc
        json.dump(sc, open(os.path.join(OUT, sc['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for sid, title, emoji in ORDER:
    if sid in built:
        sc = built[sid]
        index.append({'id': sid, 'title': sc['title'], 'emoji': sc['emoji'], 'purpose': sc['purpose'], 'ready': True,
                      'subs': [{'id': s['id'], 'title': s['title'], 'words': len(s['words']), 'dialogues': len(s['dialogues'])} for s in sc['subs']]})
    else:
        index.append({'id': sid, 'title': title, 'emoji': emoji, 'ready': False, 'subs': []})
json.dump({'scenes': index}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for s in index:
    if s['ready']:
        print(s['id'], [(x['id'], x['words'], x['dialogues']) for x in s['subs']])
