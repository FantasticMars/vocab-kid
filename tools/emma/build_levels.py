#!/usr/bin/env python3
"""Build data/emma/levels/*.json from the parsed official lists + open dictionary data.

Inputs (SRC dir, see data/SOURCES.md):
  raw/junior2022.json raw/senior2025.json raw/ket2025.json raw/pet2025.json raw/awl.json  (parse_lists.py)
  yw1.md (二级词汇表 fragment), ecdict/ecdict.csv (MIT), cmudict.dict (BSD-2),
  kb/json/*.json (KyleBing/english-vocabulary), tat/*.tsv (Tatoeba, CC BY 2.0 FR)
  tools/emma/gloss_overrides.tsv, tools/emma/examples_authored.tsv (hand-written, this repo)
Usage: build_levels.py SRC_DIR REPO_DIR
"""
import csv, json, os, re, sys, random, collections
from opencc import OpenCC
SRC, REPO = sys.argv[1], sys.argv[2]
TOOLS = os.path.join(REPO, 'tools', 'emma')
OUT = os.path.join(REPO, 'data', 'emma', 'levels')
os.makedirs(OUT, exist_ok=True)
csv.field_size_limit(10**9)
t2s = OpenCC('t2s')
P = lambda *a: os.path.join(SRC, *a)

# ---------------- word lists ----------------
jr = json.load(open(P('raw/junior2022.json')))
sr = json.load(open(P('raw/senior2025.json')))
ket = json.load(open(P('raw/ket2025.json')))
pet = json.load(open(P('raw/pet2025.json')))
awl = json.load(open(P('raw/awl.json')))

FIX_SPLIT = {'ruleseason': ['rule', 'season'], 'searchshock': ['search', 'shock']}
def expand(w):
    return FIX_SPLIT.get(w.lower(), [w])

# 二级 (primary) = starred in the 2022 三级 table ∪ entries of the 二级词汇表 fragment
prim = set(x['w'].lower() for x in jr['core'] if x['primary'])
y1 = open(P('yw1.md'), encoding='utf-8').read().split('\n')[1023:1300]
for l in y1:
    for c in re.findall(r'<td>(.*?)</td>', l):
        c = re.sub(r'\([^)]*\)', '', c).strip()
        if c and not re.fullmatch('[A-Z]', c):
            for p in c.split('/'): prim.add(p.strip().lower())
GEO = {'africa','african','america','american','antarctica','asia','asian','australia','australian'}
compulsory = []   # 1600 义务教育 words (unstarred in 高中 list) + separately listed sets
for x in sr:
    if x['stars'] == 0:
        for w in expand(x['w']): compulsory.append(w)
for w in jr['sets']:
    compulsory.append(w)
seen = set(); L1 = []; L2 = []
for w in compulsory:
    k = w.lower()
    if k in seen: continue
    seen.add(k)
    if (k in prim or w in jr['sets']) and k not in GEO: L1.append(w)
    else: L2.append(w)
L3 = []
for x in sr:
    if x['stars'] > 0:
        for w in expand(x['w']):
            if w.lower() not in seen: seen.add(w.lower()); L3.append(w)
ketw = [x['w'] for x in ket]; ketpos = {x['w'].lower(): x['pos'] for x in ket}
ketset = set(w.lower() for w in ketw)
petw = [x['w'] for x in pet if x['w'].lower() not in ketset]
petpos = {x['w'].lower(): x['pos'] for x in pet}
AWL_FIX = {'credit': 2, 'design': 2, 'enable': 5, 'discrete': 5, 'energy': 5, 'displace': 8,
           'factor': 1, 'domain': 6, 'erode': 9, 'dominate': 3, 'ministry': 6, 'minor': 3}
awlw = []
for x in awl:
    parts = x['w'].split()
    for p in parts:
        awlw.append((p, AWL_FIX.get(p, x['sub'])))

# ---------------- dictionaries ----------------
EC = {}
with open(P('ecdict/ecdict.csv'), encoding='utf-8') as fh:
    for row in csv.DictReader(fh):
        k = row['word'].lower()
        if k not in EC or (row['frq'] not in ('', '0') and EC[k]['frq'] in ('', '0')):
            EC[k] = row
LEM = {}
for k, r in EC.items():
    if r['exchange'] and ' ' not in k:
        for part in r['exchange'].split('/'):
            if part.startswith('0:'): LEM[k] = part[2:].lower()
            elif ':' in part and part[0] in 'pdi3rts':
                v = part.split(':', 1)[1].lower()
                if v and ' ' not in v: LEM.setdefault(v, k)
def _rank1(w):
    r = EC.get(w)
    if not r: return None
    f = int(r['frq'] or 0); b = int(r['bnc'] or 0)
    if f: return f
    if b: return b + 2000
    return None
def rank(w):
    w = w.lower()
    r = _rank1(w)
    if r is None and w in LEM: r = _rank1(LEM[w])
    if r is None and w.endswith('s'): r = _rank1(w[:-1])
    return r if r is not None else 50000
INFL = collections.defaultdict(set); LEMMA = {}
for k, r in EC.items():
    if r['exchange'] and len(k) < 20 and ' ' not in k:
        for part in r['exchange'].split('/'):
            if ':' in part:
                t, v = part.split(':', 1)
                if t in 'pdi3rts' and v and ' ' not in v:
                    INFL[k].add(v.lower())
def forms(w):
    k = w.lower()
    fs = {k} | INFL.get(k, set())
    if ' ' not in k:
        fs |= {k + 's', k + 'es', k + 'ed', k + 'd', k + 'ing'}
        if k.endswith('y'): fs |= {k[:-1] + 'ies', k[:-1] + 'ied'}
        if k.endswith('e'): fs.add(k[:-1] + 'ing')
    return fs

CMU = {}
for line in open(P('cmudict.dict'), encoding='utf-8'):
    parts = line.split('#')[0].split()
    if not parts: continue
    w = parts[0]
    if '(' in w: continue
    CMU[w.lower()] = parts[1:]
V = {'AA':'ɑ','AE':'æ','AH':'ʌ','AO':'ɔ','AW':'aʊ','AY':'aɪ','EH':'e','ER':'ɜr','EY':'eɪ','IH':'ɪ','IY':'i','OW':'oʊ','OY':'ɔɪ','UH':'ʊ','UW':'u'}
C = {'B':'b','CH':'tʃ','D':'d','DH':'ð','F':'f','G':'ɡ','HH':'h','JH':'dʒ','K':'k','L':'l','M':'m','N':'n','NG':'ŋ','P':'p','R':'r','S':'s','SH':'ʃ','T':'t','TH':'θ','V':'v','W':'w','Y':'j','Z':'z','ZH':'ʒ'}
ONSETS = set('p b t d k g f v th dh s z sh zh hh ch jh m n l r w y'.split()) | set(x for x in
  'pl pr pw py bl br by tr tw ty dr dw dy kl kr kw ky gl gr gw fl fr fy vy thr thw sp st sk sm sn sl sw sf spl spr spy str sky skr skw shr my ny hhy ly'.split())
def cmu_ipa(ph):
    # syllabify: split consonant clusters with maximal onset
    toks = [(re.sub(r'\d', '', p), (re.search(r'\d', p).group() if re.search(r'\d', p) else None)) for p in ph]
    vidx = [i for i, (p, s) in enumerate(toks) if s is not None]
    if not vidx: return None
    starts = [0]
    for a, b in zip(vidx, vidx[1:]):
        cl = [toks[i][0].lower() for i in range(a + 1, b)]
        cut = len(cl)
        for j in range(len(cl) + 1):
            on = ''.join(cl[j:])
            if on == '' or on in ONSETS:
                cut = j; break
        starts.append(a + 1 + cut)
    prim_i = next((i for i, v in enumerate(vidx) if toks[v][1] == '1'), None)
    out = []
    for si, st in enumerate(starts):
        en = starts[si + 1] if si + 1 < len(starts) else len(toks)
        syl = ''
        for p, s in toks[st:en]:
            if s is not None:
                if p == 'AH' and s == '0': syl += 'ə'
                elif p == 'ER' and s == '0': syl += 'ər'
                elif p == 'IH' and s == '0' and False: syl += 'ɪ'
                else: syl += V[p]
            else: syl += C[p]
        s = toks[vidx[si]][1]
        mark = ''
        if len(vidx) > 1:
            if s == '1' and si == prim_i: mark = 'ˈ'
            elif s == '2' and prim_i is not None and si < prim_i and not any(toks[vidx[x]][1] == '2' for x in range(si + 1, prim_i)): mark = 'ˌ'
        out.append(mark + syl)
    return ''.join(out)
BR2US = [('aeroplane', 'airplane'), ('yoghurt', 'yogurt'), ('jewellery', 'jewelry'), ('omelette', 'omelet'), ('chilli', 'chili'),
         ('programme', 'program'), ('cheque', 'check'), ('tyre', 'tire'), ('grey', 'gray'), ('pyjamas', 'pajamas'), ('motorway', 'motor way'), ('penfriend', 'pen friend'), ('hoodie', 'hoody')]
def us_variants(t):
    out = [t]
    for a, b in BR2US:
        if a in t: out.append(t.replace(a, b))
    for a, b in [('ise', 'ize'), ('isation', 'ization'), ('our', 'or'), ('tre', 'ter'), ('ogue', 'og'), ('lled', 'led'), ('lling', 'ling'), ('ller', 'ler'), ('ence', 'ense')]:
        if a in t: out.append(t.replace(a, b))
    return out
def cmu_lookup(t):
    for v in us_variants(t):
        if ' ' in v:
            parts = [CMU.get(x) for x in v.split()]
            if all(parts):
                return [p for x in parts for p in x] if False else ('SPLIT', parts)
        if v in CMU: return CMU[v]
    # compound split: head+teacher, tooth+ache, wind+surfing
    for i in range(3, len(t) - 2):
        a, b = t[:i], t[i:]
        if a in CMU and b in CMU and len(b) >= 3:
            return ('SPLIT', [CMU[a], CMU[b]])
    return None
def ipa(w):
    toks = re.findall(r"[a-zA-Z']+", w.lower())
    res = []
    for t in toks:
        ph = CMU.get(t) or CMU.get(t.replace("'", '')) or cmu_lookup(t)
        if not ph: return ''
        if isinstance(ph, tuple):
            a = cmu_ipa(ph[1][0]); b = cmu_ipa(ph[1][1])
            if not a or not b: return ''
            b = b.replace('ˈ', '').replace('ˌ', '')
            a = a if 'ˈ' in a else 'ˈ' + a
            res.append(a + 'ˌ' + b); continue
        s = cmu_ipa(ph)
        if not s: return ''
        if len(toks) > 1 and t in ('a', 'the', 'of', 'to', 'for', 'and', 'an', 'at'):
            s = s.replace('ˈ', '')
            s = {'a': 'ə', 'the': 'ðə', 'of': 'əv', 'to': 'tə', 'for': 'fər', 'and': 'ənd', 'an': 'ən', 'at': 'ət'}[t]
        res.append(s)
    return '/' + ' '.join(res) + '/'

KB = {}
for f in sorted(os.listdir(P('kb/json'))):
    for e in json.load(open(P('kb/json', f), encoding='utf-8')):
        KB.setdefault(e['word'].lower(), e)

# curated glosses from Emma's existing PET/T1B data (hand-checked earlier) + overrides
CUR = {}
pet_json = json.load(open(os.path.join(REPO, 'data', 'emma-pet.json'), encoding='utf-8'))
for u in pet_json['units']:
    for wd in u['words']:
        CUR.setdefault(wd['en'].lower(), wd['zh'])
OVR = {}
ovf = os.path.join(TOOLS, 'gloss_overrides.tsv')
if os.path.exists(ovf):
    for line in open(ovf, encoding='utf-8'):
        if line.strip() and not line.startswith('#'):
            a = line.rstrip('\n').split('\t')
            OVR[a[0].lower()] = {'z': a[1], 'p': a[2] if len(a) > 2 and a[2] else None}

POSMAP = {'n': 'n', 'v': 'v', 'vt': 'v', 'vi': 'v', 'adj': 'j', 'a': 'j', 'adv': 'r', 'ad': 'r', 'prep': 'i',
          'conj': 'c', 'pron': 'p', 'int': 'u', 'interj': 'u', 'num': 'm', 'art': 't', 'det': 'd'}
POSOUT = {'a': 'adj.', 'ad': 'adv.', 'vt': 'v.', 'vi': 'v.', 'interj': 'int.', 'int': 'int.'}
def pos_weights(w):
    r = EC.get(w.lower()); d = {}
    if r and r['pos']:
        for part in r['pos'].split('/'):
            if ':' in part:
                a, b = part.split(':'); d[a] = int(b or 0)
    return d
BAD_SENSE = re.compile(r'人名|姓氏|地名|缩写|[A-Za-z]|俚|古|方言|废|旧时|罕|性交|交媾|妓|鸨|淫|阴茎|阴道|屁|婊|春药|同性恋|色情|裸|尿|屎|[()（）]|◎|城市名|芬兰|德语|法语')
def clean_item(s):
    s = re.sub(r'\[[^\]]*\]|（[^）]*）|\([^)]*\)|<[^>]*>|【[^】]*】', '', s)
    s = s.replace('…', '…').strip(' ，,；;。.')
    return s
def trim_senses(entries, w):
    """entries: list of (pos, text). return 'pos. a，b；pos. c' with <=3 senses."""
    pw = pos_weights(w)
    ents = [(p, t) for p, t in entries if p]
    ents.sort(key=lambda e: -pw.get(POSMAP.get(e[0], '?'), 0))
    out = []; total = 0; seen = set(); merged = collections.OrderedDict()
    for p, t in ents:
        pp = POSOUT.get(p, p + '.')
        items = []
        for grp in re.split(r'[；;]', t):
            for it in re.split(r'[，,、]', grp):
                it = clean_item(it)
                if not it or BAD_SENSE.search(it) or it in seen or len(it) > 10: continue
                items.append(it)
        if not items: continue
        merged.setdefault(pp, [])
        for it in items:
            if it not in seen and it not in merged[pp]:
                merged[pp].append(it); seen.add(it)
    ev = evidence(w)
    def sc(it):
        if not ev: return 0
        key = it if len(it) <= 2 else it[:2]
        return sum(1 for z in ev if key in z)
    thr = max(2, 0.05 * len(ev))
    tot = sum(pw.values()) or 0
    inv = {'n.': 'n', 'v.': 'v', 'adj.': 'j', 'adv.': 'r', 'prep.': 'i', 'conj.': 'c', 'pron.': 'p', 'int.': 'u', 'num.': 'm'}
    groups = list(merged.items())
    if ev:
        scored = [(pp, [(it, sc(it)) for it in items]) for pp, items in groups]
        def wt(pp): return pw.get(inv.get(pp, '?'), 0)
        def has(g): return any(v >= thr for _, v in g[1])
        if scored and has(scored[0]) or any(has(g) for g in scored[:2]):
            if not has(scored[0]) and len(scored) > 1 and (not tot or wt(scored[1][0]) >= 0.25 * tot):
                scored = [scored[1], scored[0]] + scored[2:]
            parts = []
            for gi, (pp, its) in enumerate(scored[:2]):
                good = [it for it, v in its if v >= thr]
                good.sort(key=lambda it: -dict(its)[it])
                if gi == 0 and not good: good = [its[0][0]]
                if gi == 1 and (not good or (tot and wt(pp) < 0.3 * tot) or (not tot)): break
                parts.append(pp + ' ' + '，'.join(good[: (2 if gi == 0 else 1)]))
            return '；'.join(parts)
    parts = []; total = 0
    for i, (pp, items) in enumerate(groups):
        if i >= 2 or total >= 2: break
        if i == 1 and (not tot or pw.get(inv.get(pp, '?'), 0) < 0.3 * tot): break
        take = items[:1] if (i == 1 or len(items) < 2 or len(items[1]) > 3) else items[:2]
        total += len(take)
        parts.append(pp + ' ' + '，'.join(take))
    return '；'.join(parts)
_EVC = {}
def evidence(w):
    k = w.lower()
    if k in _EVC: return _EVC[k]
    fs = forms(k); c = set()
    if ' ' in k:
        for f in forms(k.split()[0]):
            for i in index.get(f, []):
                if contains(pairs[i][0], w): c.add(i)
    else:
        for f in fs: c.update(index.get(f, []))
    res = [pairs[i][1] for i in list(c)[:400]]
    _EVC[k] = res
    return res
def gloss(w):
    k = w.lower()
    if k in OVR: return OVR[k]['z'], 'override'
    if k in CUR: return CUR[k], 'curated'
    if k in KB and KB[k].get('translations'):
        g = trim_senses([(t['type'].strip().rstrip('.'), t['translation']) for t in KB[k]['translations']], w)
        if g: return g, 'kb'
    r = EC.get(k)
    if r and r['translation']:
        ents = []
        for line in r['translation'].split('\n'):
            m = re.match(r'([a-z]+)\.\s*(.*)', line.strip())
            if m: ents.append((m.group(1), m.group(2)))
            elif not line.startswith('['): ents.append(('', line))
        g = trim_senses(ents, w)
        if not g and ents: g = clean_item(re.split(r'[,，\n]', ents[0][1].strip())[0])
        if g: return g, 'ecdict'
    return '', 'none'
def main_pos(w, given=None):
    if given:
        return given.split(' ')[0].split(',')[0].replace('mv', 'v').replace('av', 'v')
    k = w.lower()
    if k in KB and KB[k].get('translations'):
        pw = pos_weights(w)
        ts = sorted(KB[k]['translations'], key=lambda t: -pw.get(POSMAP.get(t['type'].strip().rstrip('.'), '?'), 0))
        return POSOUT.get(ts[0]['type'].strip().rstrip('.'), ts[0]['type'].strip().rstrip('.') + '.').rstrip('.')
    pw = pos_weights(w)
    if pw:
        best = max(pw, key=pw.get)
        return {'n': 'n', 'v': 'v', 'j': 'adj', 'r': 'adv', 'i': 'prep', 'c': 'conj', 'p': 'pron', 'u': 'exclam', 'm': 'num', 'd': 'det'}.get(best, best)
    if ' ' in w: return 'phr'
    return ''

# ---------------- examples (Tatoeba) ----------------
BLOCK = set('''kill killed kills killing murder murdered dead death die died dies dying suicide gun guns shoot shot
sex sexy drunk beer wine whiskey vodka alcohol cigarette cigarettes smoke smoking drug drugs hell damn stupid idiot
hate hated hates divorce divorced pregnant naked kiss kissed kissing prison jail bomb blood bloody fuck shit
girlfriend boyfriend wife wife's husband cheating lover date dating married marry sleep slept bed beat beaten hit fight enemy war weapon
knife steal stole stolen thief rob robbed ugly fat stupid dumb crazy liar lie lied cheat cheated god jesus church
bible pray prayed'''.split())
eng = {}
for line in open(P('tat/eng_sentences.tsv'), encoding='utf-8'):
    a = line.rstrip('\n').split('\t')
    if len(a) == 3: eng[a[0]] = a[2]
cmn = {}
for line in open(P('tat/cmn_sentences.tsv'), encoding='utf-8'):
    a = line.rstrip('\n').split('\t')
    if len(a) == 3: cmn[a[0]] = a[2]
pairs = []; seenp = set()
for line in open(P('tat/cmn-eng_links.tsv'), encoding='utf-8'):
    c, e = line.split()
    if c in cmn and e in eng:
        en = eng[e].strip(); zh = t2s.convert(cmn[c].strip())
        if en in seenp: continue
        toks = re.findall(r"[A-Za-z']+", en)
        if not (4 <= len(toks) <= 12): continue
        if not re.fullmatch(r"[A-Z][A-Za-z0-9 ,.'?!\-]*[.?!]", en): continue
        if re.search(r'[A-Za-z]', zh) or not (3 <= len(zh) <= 30): continue
        if re.search(r'[\"“”]|俺|嘞|咋|甭|恁|啥|噢|伺服器|软体|硬体|笔记型|资料库|网路|程式|计程车|捷运|影片|部落格|行动电话|执行长|讯息', zh): continue
        if not re.search(r'[。？！?!…]$', zh): zh = zh + ('？' if en.endswith('?') else '。')
        seenp.add(en)
        pairs.append((en, zh, toks))
index = collections.defaultdict(list)
for i, (en, zh, toks) in enumerate(pairs):
    for t in set(x.lower() for x in toks): index[t].append(i)
def sent_cost(i, target_forms):
    en, zh, toks = pairs[i]
    worst = 0; blocked = False
    for j, t in enumerate(toks):
        tl = t.lower()
        if tl in target_forms: continue
        if tl in BLOCK: blocked = True
        if t[0].isupper() and j > 0: continue
        if tl in ("i", "i'm", "don't", "can't", "it's", "i'll", "didn't", "doesn't", "isn't", "won't", "you're", "that's", "he's", "she's", "let's", "we're", "they're", "i've", "wasn't", "aren't", "what's", "there's", "couldn't", "wouldn't", "haven't"): continue
        r = rank(tl.strip("'"))
        if tl.endswith("'s"): r = rank(tl[:-2])
        worst = max(worst, r)
    n = len(toks)
    return (1e9 if blocked else 0) + worst + abs(n - 8) * 150 + (300 if en.endswith('?') else 0)
AUTH = {}
af = os.path.join(TOOLS, 'examples_authored.tsv')
if os.path.exists(af):
    for line in open(af, encoding='utf-8'):
        if line.strip() and not line.startswith('#'):
            a = line.rstrip('\n').split('\t')
            if len(a) >= 3: AUTH[a[0].lower()] = (a[1].strip(), a[2].strip())
used = collections.Counter()
def contains(en, w):
    k = w.lower()
    low = en.lower()
    if ' ' in k:
        toks = k.split()
        fs = forms(toks[0])
        rest = ' '.join(toks[1:])
        return any(re.search(r"\b" + re.escape(f + ' ' + rest) + r"\b", low) for f in fs)
    tl = [t.lower() for t in re.findall(r"[A-Za-z']+", en)]
    tl += [t[:-2] for t in tl if t.endswith("'s")]
    return any(t in forms(k) for t in tl)
IDIOMS = ['after all', 'a while', 'at all', 'not to mention', 'get on in life', 'as well', 'of course', 'at least', 'in fact', 'by the way', 'all the same', 'what i don', 'the forest for', 'see the forest']
FUNC_CH = set('的了是不一个地得着之于使把被对在有者为与和及或其所某…等')
def han(s):
    return set(ch for ch in s if '\u4e00' <= ch <= '\u9fff') - FUNC_CH
def raw_trans(w):
    k = w.lower(); t = ''
    if k in KB: t += ' '.join(x['translation'] for x in KB[k].get('translations', []))
    r = EC.get(k)
    if r: t += ' ' + r['translation']
    return t
def example(w, maxrank, gl=''):
    k = w.lower()
    if k in AUTH: return AUTH[k] + ('authored',)
    g1 = han(re.sub(r'[a-z]+\.', '', gl)); g2 = han(raw_trans(w)) | g1
    fs = forms(k)
    cands = set()
    if ' ' in k:
        first = k.split()[0]
        for f in forms(first):
            for i in index.get(f, []):
                if contains(pairs[i][0], w): cands.add(i)
    else:
        for f in fs:
            cands.update(index.get(f, []))
    best = None
    for i in cands:
        exact = k in [t.lower() for t in pairs[i][2]] or (' ' in k and k in pairs[i][0].lower())
        low_en = pairs[i][0].lower()
        if any(ph in low_en and k not in ph.split() for ph in IDIOMS): continue
        zc = han(pairs[i][1])
        if re.match(r'(un|dis|im|in)[a-z]{3,}', k) and k not in ('interest','information','important','invite','include','increase','introduce','instead','inside','into','insect','instruction','industry','influence','improve','imagine','impossible','inch','ink','island','until','under','understand','uniform','unit','universe','university','uncle','usual','discover','discuss','dish','distance','display','disease','disaster','disappear') and not re.search(r'[不没无非未]', pairs[i][1]):
            continue
        if zc & g1: sense = 0
        elif zc & g2: sense = 900
        else: continue
        c = sent_cost(i, fs) + (0 if exact else 400) + used[pairs[i][0]] * 3000 + sense
        if best is None or c < best[0]: best = (c, i)
    if best and best[0] < maxrank:
        used[pairs[best[1]][0]] += 1
        return pairs[best[1]][0], pairs[best[1]][1], 'tatoeba'
    return None

PH_CAND = set()
def _phr_ok(p):
    return 2 <= len(p.split()) <= 4 and not re.search(r"[^a-z ']", p)
for e in KB.values():
    for ph in e.get('phrases', []) or []:
        p = ph['phrase'].strip().lower()
        if _phr_ok(p): PH_CAND.add(p)
PH_CNT = collections.Counter()
for sent in eng.values():
    tl = re.findall(r"[a-z']+", sent.lower())
    for n in (2, 3, 4):
        for j in range(len(tl) - n + 1):
            g = ' '.join(tl[j:j + n])
            if g in PH_CAND: PH_CNT[g] += 1
FUNCW = set('a an the of to in on at for with by up out off from into about over down away back my your his her our their its one some it me you him them us this that and or be do make get take have go'.split())
LONGER = collections.Counter()
for q, v in PH_CNT.items():
    t = q.split()
    for n in range(2, len(t)):
        LONGER[' '.join(t[:n])] += v
IPA_OVR = {'maths': '/mæθs/', 'lead': '/lid/', 'live': '/lɪv/', 'wind': '/wɪnd/', 'tear': '/tɪr/', 'use': '/juz/', 'close': '/kloʊs/',
           'read': '/rid/', 'record': '/ˈrekərd/', 'present': '/ˈprezənt/', 'object': '/ˈɑbdʒekt/', 'minute': '/ˈmɪnət/',
           'desert': '/ˈdezərt/', 'content': '/ˈkɑntent/', 'row': '/roʊ/', 'bow': '/baʊ/', 'wound': '/wund/',
           'p.m.': '/ˌpiˈem/', 'a.m.': '/ˌeɪˈem/', 'o.k.': '/ˌoʊˈkeɪ/', 'ok': '/ˌoʊˈkeɪ/', 'tv': '/ˌtiˈvi/', 'dvd': '/ˌdiviˈdi/',
           'cd': '/ˌsiˈdi/', 'pe': '/ˌpiˈi/', 'ai': '/ˌeɪˈaɪ/', 'id': '/ˌaɪˈdi/', 'it': '/ɪt/', 'cv': '/ˌsiˈvi/', 'dj': '/ˈdiˌdʒeɪ/',
           'duvet': '/duˈveɪ/', 'cookery': '/ˈkʊkəri/', 'the': '/ðə/', 'a': '/ə/', 'an': '/ən/', 'mr': '/ˈmɪstər/', 'mrs': '/ˈmɪsɪz/', 'ms': '/mɪz/', 'dr': '/ˈdɑktər/',
           'refuse': '/rɪˈfjuz/', 'produce': '/prəˈdus/', 'contract': '/ˈkɑntrækt/', 'permit': '/pərˈmɪt/', 'suspect': '/səˈspekt/', 'conduct': '/kənˈdʌkt/', 'contrast': '/ˈkɑntræst/', 'invalid': '/ɪnˈvælɪd/', 'estimate': '/ˈestəmət/', 'approximate': '/əˈprɑksəmət/', 'alternate': '/ˈɔltərnət/', 'separate': '/ˈsepərət/', 'graduate': '/ˈɡrædʒuət/', 'subject': '/ˈsʌbdʒekt/', 'project': '/ˈprɑdʒekt/', 'progress': '/ˈprɑɡres/', 'increase': '/ɪnˈkris/', 'export': '/ˈekspɔrt/', 'import': '/ˈɪmpɔrt/', 'address': '/ˈædres/', 'perfect': '/ˈpɜrfɪkt/', 'polish': '/ˈpɑlɪʃ/', 'excuse': '/ɪkˈskjuz/'}
def collocs(w):
    k = w.lower(); out = []
    e = KB.get(k)
    if not e: return out
    cands = []
    for ph in e.get('phrases', []) or []:
        p = ph['phrase'].strip(); tz = ph['translation']
        toks = p.lower().split()
        if not (2 <= len(toks) <= 4) or not any(t in forms(k) or t == k for t in toks): continue
        if re.search(r"[^a-zA-Z ']", p): continue
        others = [rank(t) for t in toks if t != k and t not in forms(k)]
        if any(r > 6000 for r in others): continue
        z = clean_item(re.split(r'[；;，,]', tz)[0])
        if not z or re.search(r'[A-Za-z]', z) or len(z) > 12: continue
        zh_ok = bool(han(z) & han(raw_trans(w)))
        for t in toks:
            if t in forms(k) or t in FUNCW: continue
            if not (han(z) & han(raw_trans(t))): zh_ok = False
        if not zh_ok: continue
        cnt = PH_CNT.get(p.lower(), 0)
        cnt -= LONGER.get(p.lower(), 0)
        if re.search(r'圣|神|魔|教堂|上帝|宗教|地狱', z): continue
        if cnt < 3: continue
        cands.append((-cnt, p, z))
    cands.sort()
    for _, p, z in cands[:2]: out.append([p, z])
    return out

# ---------------- build ----------------
stats = {}
SKIP = {'suprising', 'v', 'o.k.', 'upon sth', 'sb', 'well made'}
NOGLOSS = []
def build(level_id, title, words, maxrank, pos_of=None, extra=None, subtitle=''):
    entries = []; issues = collections.Counter(); src = collections.Counter()
    seenh = set()
    for w in words:
        w = w.strip().replace('’', "'")
        if w.lower() in seenh or w.lower() in SKIP: continue
        seenh.add(w.lower())
        z, gs = gloss(w)
        z = re.sub(r'\s*(\n|\\n).*', '', z, flags=re.S).strip()
        if not z: issues['no_gloss'] += 1; NOGLOSS.append(w); continue
        i = IPA_OVR.get(w.lower()) or ipa(w)
        ex = example(w, maxrank, z)
        e = {'w': w, 'p': main_pos(w, pos_of.get(w.lower()) if pos_of else None), 'i': i, 'z': z}
        if gs == 'override' and OVR[w.lower()]['p']: e['p'] = OVR[w.lower()]['p']
        if ex: e['e'], e['c'] = ex[0], ex[1]; src[ex[2]] += 1
        else: issues['no_example'] += 1
        k = collocs(w)
        if k: e['k'] = k
        if extra: e.update(extra(w))
        e['_r'] = rank(w)
        src['gloss_' + gs] += 1
        entries.append(e)
    entries.sort(key=lambda e: (e['_r'], e['w'].lower()))
    for e in entries: del e['_r']
    return entries, issues, src

def write(level_id, title, subtitle, entries, meta=None):
    groups = [entries[i:i + 20] for i in range(0, len(entries), 20)]
    doc = {'id': level_id, 'title': title, 'subtitle': subtitle, 'count': len(entries),
           'groups': [{'n': gi + 1, 'words': g} for gi, g in enumerate(groups)]}
    if meta: doc.update(meta)
    fn = os.path.join(OUT, level_id + '.json')
    json.dump(doc, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return fn

report = {}
only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
plan = [
  ('L1', '小学核心', '义务教育英语课程标准(2022) 二级词汇 + 数词/月份/星期', L1, 3500, None),
  ('L2', '初中课标', '义务教育英语课程标准(2022) 三级词汇(初中新增)', L2, 5500, None),
  ('L3', '高中课标', '普通高中英语课程标准 必修+选择性必修词汇', L3, 7000, None),
  ('L4-ket', 'KET · A2 Key', 'Cambridge A2 Key Vocabulary List (2025)', ketw, 5500, ketpos),
  ('L4-pet', 'PET · B1 Preliminary', 'Cambridge B1 Preliminary Vocabulary List (2025) 中 KET 以外的词', petw, 8000, petpos),
  ('L5-awl', 'AWL 学术词汇', 'Academic Word List (Coxhead 2000) 570 词族', [w for w, s in awlw], 8000, None),
]
dump_missing = {}
for lid, title, sub, words, mr, posmap in plan:
    if only and lid not in only: continue
    extra = None
    if lid == 'L5-awl':
        subm = {w.lower(): s for w, s in awlw}
        extra = lambda w, subm=subm: {'s': subm[w.lower()]}
    ents, iss, src = build(lid, title, words, mr, posmap, extra)
    if lid == 'L5-awl':
        ents.sort(key=lambda e: (e['s'], rank(e['w'])))
    write(lid, title, sub, ents)
    report[lid] = {'count': len(ents), 'issues': dict(iss), 'src': dict(src)}
    dump_missing[lid] = [e['w'] for e in ents if 'e' not in e]
    print(lid, len(ents), dict(iss), dict(src))
json.dump(dump_missing, open(os.path.join(SRC, 'missing_examples.json'), 'w'), ensure_ascii=False, indent=0)
print('NOGLOSS', NOGLOSS)
json.dump(report, open(os.path.join(SRC, 'build_report.json'), 'w'), ensure_ascii=False, indent=1)
