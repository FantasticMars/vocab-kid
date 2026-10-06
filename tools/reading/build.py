#!/usr/bin/env python3
"""Build the 阅读 (reading) data from the hand-written passages in tools/reading/src/{alex,emma}.txt.

Passage format (blocks separated by a line '====='; lines starting with '#' are comments):
  id: e01 / title: ... / zh: 中文标题 / level: A2 / genre: 类型 / src: original|facts|aesop|folk / sum: 中文简介
  P: paragraph text                      (one line per paragraph)
  G: word = 中文                          hand gloss for one word form (context sense; wins over the dictionary).
                                          Capitalised headwords (names, Green, Run) only match that exact case.
  PH: phrase = 中文                       hand gloss for a phrase; long-pressing any word inside it also shows this
  Q: type | question [| 中文翻译]          type: main / detail / vocab / infer / who / tf
  * correct option   - wrong option      (exactly one '*')
  A: T|F                                 (tf questions instead of options)
  E: 中文讲解                             shown after the question is answered

Output: data/reading/index.json (list view) + data/reading/<id>.json (one per passage, lazy-loaded)
Each passage JSON: paragraphs with word offsets [start, end, glossKey, phraseIndex], a glossary
{key: [lemma, ipa, 中文, source]} covering EVERY word form in the text, phrase glosses and questions.

Gloss priority: hand G: > tools/reading/gloss_common.tsv > tools/emma/gloss_overrides.tsv > level lists
(data/emma/levels, already cleaned) > textbook lists > ECDICT (same noisy-sense cleanup as tools/emma/build_levels.py).
Context: words are POS-tagged with NLTK's averaged perceptron tagger (build time only; `pip install nltk` and
nltk.download('averaged_perceptron_tagger_eng')). The tag picks the lemma (leaves/NNS -> leaf, lives/VBZ -> live) and the
matching sense of a multi-POS gloss. Without nltk the build still runs (warning; no POS filtering).
IPA: US IPA from CMUdict (tools/emma/ipa_util.py), tools/reading/ipa_extra.tsv, ECDICT phonetic as a fallback.

Usage: python3 tools/reading/build.py [SRC_DIR=/workspace/emma-src]   (prints the QC report, exit 1 on hard failures)
"""
import collections, csv, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/emma-src'
sys.path.insert(0, os.path.join(REPO, 'tools', 'emma'))
import ipa_util
ipa_util.init(os.path.join(SRC, 'cmudict.dict'))
OUT = os.path.join(REPO, 'data', 'reading')
os.makedirs(OUT, exist_ok=True)
csv.field_size_limit(10 ** 9)
DATA_V = 15

# ---------------- parse ----------------
def parse(kid):
    path = os.path.join(HERE, 'src', kid + '.txt')
    out = []
    for blk in open(path, encoding='utf-8').read().split('\n====='):
        p = {'kid': kid, 'paras': [], 'G': [], 'PH': [], 'qs': []}
        q = None
        for raw in blk.split('\n'):
            line = raw.rstrip()
            if not line.strip() or line.startswith('#') or line.strip() == '=====':
                continue
            m = re.match(r'^(id|title|zh|level|genre|src|sum):\s*(.*)$', line)
            if m:
                v = m.group(2).strip()
                if len(v) > 1 and v[0] == '"' and v[-1] == '"': v = v[1:-1]
                p[m.group(1)] = v; continue
            if line.startswith('P:'): p['paras'].append(line[2:].strip()); continue
            if line.startswith('PH:'):
                a, b = line[3:].split('=', 1); p['PH'].append((a.strip(), b.strip())); continue
            if line.startswith('G:'):
                a, b = line[2:].split('=', 1); p['G'].append((a.strip(), b.strip())); continue
            if line.startswith('Q:'):
                parts = [x.strip() for x in line[2:].split('|')]
                q = {'type': parts[0], 'q': parts[1], 'qz': parts[2] if len(parts) > 2 else '', 'opts': [], 'stars': 0, 'tf': None, 'e': ''}
                p['qs'].append(q); continue
            if line.startswith('* '): q['opts'].append((line[2:].strip(), True)); q['stars'] += 1; continue
            if line.startswith('- '): q['opts'].append((line[2:].strip(), False)); continue
            if line.startswith('A:'): q['tf'] = line[2:].strip().upper(); continue
            if line.startswith('E:'): q['e'] = line[2:].strip(); continue
            raise SystemExit('unparsed line in %s %s: %r' % (kid, p.get('id'), line))
        if p.get('id'): out.append(p)
    return out

ABBR = r"(?:Mr|Mrs|Ms|Dr|St)\.|a\.m\.|p\.m\."
TOK = re.compile(r"(?<![0-9A-Za-z])(?:" + ABBR + r"|[A-Za-z]+(?:['’\-][A-Za-z]+)*)")
def norm(t):
    t = t.replace('’', "'")
    if t.endswith('.'): t = t[:-1]
    return t
def tokens(text):
    return [(m.start(), m.end(), m.group()) for m in TOK.finditer(text)]

# ---------------- dictionaries ----------------
passages = {k: parse(k) for k in ('alex', 'emma')}
need = set()
for ps in passages.values():
    for p in ps:
        for para in p['paras']:
            for _, _, t in tokens(para):
                n = norm(t).lower(); need.add(n)
                if n.endswith("'s"): need.add(n[:-2])
                for part in n.split('-'): need.add(part)

def load_tsv(path):
    d = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            if line.strip() and not line.startswith('#'):
                a = line.rstrip('\n').split('\t')
                d[a[0].lower()] = a[1]
    return d
COMMON = load_tsv(os.path.join(HERE, 'gloss_common.tsv'))
OVR = load_tsv(os.path.join(REPO, 'tools', 'emma', 'gloss_overrides.tsv'))
LEVEL = {}      # word -> cleaned gloss from the level lists
LEVELSET = collections.defaultdict(set)
for lid in ('L1', 'L2', 'L4-ket', 'L4-pet', 'L3'):
    d = json.load(open(os.path.join(REPO, 'data', 'emma', 'levels', lid + '.json'), encoding='utf-8'))
    for g in d['groups']:
        for w in g['words']:
            k = w['w'].lower()
            LEVELSET[lid].add(k)
            LEVEL.setdefault(k, w['z'])
TEXTBOOK = {}
for f in ('words.json', 'emma-pet.json'):
    for u in json.load(open(os.path.join(REPO, 'data', f), encoding='utf-8'))['units']:
        for w in u['words']:
            TEXTBOOK.setdefault(w['en'].lower(), w['zh'])
ALEXSET = set(w['en'].lower() for u in json.load(open(os.path.join(REPO, 'data', 'words.json'), encoding='utf-8'))['units'] for w in u['words'])

EC = {}
LEM = {'v': collections.defaultdict(dict), 'n': {}, 'adj': {}}   # inflected form -> lemma, by part of speech
VTYPE = {'VBD': 'pd', 'VBN': 'pd', 'VBG': 'i', 'VBZ': '3'}
def _frq(row):
    f = int(row['frq'] or 0) or (int(row['bnc'] or 0) + 2000 if row['bnc'] not in ('', '0') else 0)
    return f or 99999
with open(os.path.join(SRC, 'ecdict', 'ecdict.csv'), encoding='utf-8') as fh:
    rows = []
    for row in csv.DictReader(fh):
        k = row['word'].lower()
        ex = row['exchange'] or ''
        if k in need and (k not in EC or (row['frq'] not in ('', '0') and EC[k]['frq'] in ('', '0'))):
            EC[k] = row
        if ex and ' ' not in k and re.fullmatch(r"[a-z'\-]+", k):
            for part in ex.split('/'):
                if ':' not in part: continue
                t, v = part.split(':', 1); v = v.lower()
                if v not in need or v == k: continue
                if t in 'pdi3':
                    for tt in VTYPE:
                        if t in VTYPE[tt]:
                            old = LEM['v'][tt].get(v)
                            if not old or _frq(row) < old[1]: LEM['v'][tt][v] = (k, _frq(row))
                    rows.append(k)
                elif t == 's':
                    old = LEM['n'].get(v)
                    if not old or _frq(row) < old[1]: LEM['n'][v] = (k, _frq(row))
                    rows.append(k)
                elif t in 'rt':
                    old = LEM['adj'].get(v)
                    if not old or _frq(row) < old[1]: LEM['adj'][v] = (k, _frq(row))
                    rows.append(k)
need2 = set(rows)
with open(os.path.join(SRC, 'ecdict', 'ecdict.csv'), encoding='utf-8') as fh:
    for row in csv.DictReader(fh):
        k = row['word'].lower()
        if k in need2 and k not in EC: EC[k] = row
LEMMA_FIX = {'sat': 'sit', 'born': 'born', 'drunk': 'drink', 'evening': 'evening', 'ground': 'ground', 'feed': 'feed', 'lay': 'lay', 'found': 'find', 'cells': 'cell', 'means': 'mean', 'leaves|n': 'leaf', 'lives|n': 'life'}
def known(w):
    return w in EC or w in LEVEL or w in OVR or w in TEXTBOOK
def rule_lemma(w, tag):
    """fallback when ECDICT has no exchange entry: spelled -> spell, stopped -> stop, tried -> try"""
    c = []
    if tag in ('VBD', 'VBN') and w.endswith('ed'):
        c = [w[:-2], w[:-1], w[:-3] if len(w) > 4 and w[-3] == w[-4] else '', w[:-3] + 'y' if w.endswith('ied') else '']
    elif tag == 'VBG' and w.endswith('ing'):
        c = [w[:-3], w[:-3] + 'e', w[:-4] if len(w) > 5 and w[-4] == w[-5] else '']
    elif tag in ('VBZ', 'NNS', 'NNPS') and w.endswith('s'):
        c = [w[:-1], w[:-2] if w.endswith('es') else '', w[:-3] + 'y' if w.endswith('ies') else '']
    for x in c:
        if x and len(x) >= 2 and known(x): return x
    return w
def lemma_of(w, tag=''):
    """POS-aware lemma: verbs use p/d/i/3 exchanges, plural nouns s:, comparatives r:/t:."""
    if w + '|' + coarse(tag) in LEMMA_FIX: return LEMMA_FIX[w + '|' + coarse(tag)]
    if tag in VTYPE:
        x = LEM['v'][tag].get(w)
        if x: return x[0]
    elif tag in ('NNS', 'NNPS'):
        x = LEM['n'].get(w)
        if x: return x[0]
    elif tag in ('JJR', 'JJS', 'RBR', 'RBS'):
        x = LEM['adj'].get(w)
        if x: return x[0]
    elif not tag:
        for d in (LEM['v']['VBD'], LEM['v']['VBZ'], LEM['v']['VBG'], LEM['n'], LEM['adj']):
            if w in d: return d[w][0]
    return rule_lemma(w, tag)

# --- the same noisy-sense cleanup as tools/emma/build_levels.py (clean_item / BAD_SENSE / POS ranking) ---
POSMAP = {'n': 'n', 'v': 'v', 'vt': 'v', 'vi': 'v', 'adj': 'j', 'a': 'j', 'adv': 'r', 'ad': 'r', 'prep': 'i',
          'conj': 'c', 'pron': 'p', 'int': 'u', 'interj': 'u', 'num': 'm', 'art': 't', 'det': 'd'}
POSOUT = {'a': 'adj.', 'ad': 'adv.', 'vt': 'v.', 'vi': 'v.', 'interj': 'int.', 'int': 'int.'}
BAD_SENSE = re.compile(r'人名|姓氏|地名|缩写|[A-Za-z]|俚|古|方言|废|旧时|罕|性交|交媾|妓|鸨|淫|阴茎|阴道|屁|婊|春药|同性恋|色情|裸|尿|屎|[()（）]|◎|城市名|芬兰|德语|法语|的过去式|的复数|过去分词|现在分词|第三人称')
def pos_weights(w):
    r = EC.get(w.lower()); d = {}
    if r and r['pos']:
        for part in r['pos'].split('/'):
            if ':' in part:
                a, b = part.split(':'); d[a] = int(b or 0)
    return d
def clean_item(s):
    s = re.sub(r'\[[^\]]*\]|（[^）]*）|\([^)]*\)|<[^>]*>|【[^】]*】', '', s)
    return s.strip(' ，,；;。.')
def trim_senses(entries, w):
    pw = pos_weights(w)
    ents = [(p, t) for p, t in entries if p]
    ents.sort(key=lambda e: -pw.get(POSMAP.get(e[0], '?'), 0))
    seen = set(); merged = collections.OrderedDict()
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
    inv = {'n.': 'n', 'v.': 'v', 'adj.': 'j', 'adv.': 'r', 'prep.': 'i', 'conj.': 'c', 'pron.': 'p', 'int.': 'u', 'num.': 'm'}
    tot = sum(pw.values()) or 0
    parts = []; total = 0
    for i, (pp, items) in enumerate(merged.items()):
        if i >= 2 or total >= 2: break
        if i == 1 and (not tot or pw.get(inv.get(pp, '?'), 0) < 0.3 * tot): break
        take = items[:1] if (i == 1 or len(items) < 2 or len(items[1]) > 3) else items[:2]
        total += len(take)
        parts.append(pp + ' ' + '，'.join(take))
    return '；'.join(parts)
def ec_entries(k):
    r = EC.get(k)
    if not r or not r['translation']: return []
    ents = []
    for line in r['translation'].split('\\n'):
        m = re.match(r'([a-z]+)\.\s*(.*)', line.strip())
        if m: ents.append((m.group(1), m.group(2)))
    return ents
def ecdict_gloss(k):
    return trim_senses(ec_entries(k), k)

# ---- part of speech: Penn tag -> coarse class, and which gloss labels fit it ----
def coarse(tag):
    if tag.startswith('NN'): return 'n'
    if tag.startswith('VB') or tag == 'MD': return 'v'
    if tag.startswith('JJ'): return 'adj'
    if tag.startswith('RB') or tag == 'RP': return 'adv'
    if tag in ('IN', 'TO'): return 'prep'
    if tag in ('PRP', 'PRP$', 'WP', 'WP$', 'EX'): return 'pron'
    if tag in ('DT', 'PDT', 'WDT'): return 'det'
    if tag == 'CD': return 'num'
    if tag == 'UH': return 'int'
    if tag == 'CC': return 'conj'
    return ''
FITS = {'n': {'n'}, 'v': {'v', 'vt', 'vi', 'aux', 'modal'}, 'adj': {'adj', 'a'}, 'adv': {'adv', 'ad'},
        'prep': {'prep', 'conj'}, 'pron': {'pron', 'det'}, 'det': {'det', 'art', 'pron', 'adj'}, 'num': {'num'},
        'int': {'int', 'interj', 'exclam'}, 'conj': {'conj'}}
ECPOS = {'n': ('n',), 'v': ('v', 'vt', 'vi'), 'adj': ('a', 'adj'), 'adv': ('ad', 'adv'), 'prep': ('prep',), 'pron': ('pron',),
         'det': ('art', 'det'), 'num': ('num',), 'int': ('int', 'interj'), 'conj': ('conj',)}
def segments(g):
    """'v. 打电话；叫；n. 电话' -> [('v', 'v. 打电话；叫'), ('n', 'n. 电话')]; unlabelled pieces stick to the previous label."""
    segs = []
    for piece in g.split('；'):
        m = re.match(r'^([a-z]+)\.\s*', piece)
        if m or not segs: segs.append([m.group(1) if m else '', piece])
        else: segs[-1][1] += '；' + piece
    return segs
def pick_pos(g, c):
    """Keep only the senses whose label fits the coarse POS c. Returns (gloss, fitted?)"""
    if not g or not c: return g, True
    segs = segments(g)
    labelled = [s for s in segs if s[0]]
    if not labelled: return g, None          # no labels -> can't judge
    fit = [s[1] for s in segs if s[0] in FITS.get(c, set())]
    if fit: return '；'.join(fit), True
    return g, False
def ec_pos(k, c):
    """concise ECDICT senses of word k for coarse POS c, e.g. 'v. 爱，热爱'"""
    for p, t in ec_entries(k):
        if p in ECPOS.get(c, ()):
            items = []
            for it in re.split(r'[，,、；;]', t):
                it = clean_item(it)
                if it and not BAD_SENSE.search(it) and len(it) <= 10 and it not in items: items.append(it)
            if items:
                return POSOUT.get(p, p + '.') + ' ' + '，'.join(items[:2 if len(items[0]) > 1 else 3])
    return ''
TABLES = (('common', COMMON), ('override', OVR), ('level', LEVEL), ('textbook', TEXTBOOK))
def table_gloss(k):
    for src, t in TABLES:
        if k in t: return t[k], src
    return '', ''
PWKEY = {'n': 'n', 'v': 'v', 'adj': 'j', 'adv': 'r', 'prep': 'i', 'pron': 'p', 'det': 'd', 'num': 'm', 'int': 'u', 'conj': 'c'}
def pos_ok(w, c):
    """is POS c a real, common use of w (ECDICT pos weights)? guards against tagger mistakes"""
    pw = pos_weights(w); tot = sum(pw.values())
    if tot: return pw.get(PWKEY.get(c, '?'), 0) >= 0.15 * tot
    return any(p in ECPOS.get(c, ()) for p, _ in ec_entries(w)[:3])   # no weights: POS among the main senses
def cjk(s): return set(re.findall(r'[\u4e00-\u9fff]', s))
def choose(w, g, src, c, tag, lem, k):
    pg, ok = pick_pos(g, c)
    if ok: return pg, src, lem
    if ok is None:
        # unlabelled curated gloss on a morphologically clear form (planted: '植物', patients: '有耐心的'):
        # switch to the ECDICT sense for that POS when the two glosses share nothing
        if tag in ('NNS', 'NNPS', 'VBD', 'VBN', 'VBG') and lem != k and pos_ok(w, c):
            e = ec_pos(w, c)
            if e and not (cjk(e) & cjk(g)): return e, 'ecdict-pos', lem
        return g, src, lem
    # the tagger often mislabels verbs as nouns ('see', 'put', 'play'), so only trust it towards v./adj.
    if c in ('v', 'adj') and pos_ok(w, c):   # love: 'n. 爱情' used as a verb -> 'v. 爱'; red: 'n. 红色' -> adj.
        e = ec_pos(w, c)
        if e: return e, 'ecdict-pos', lem
    return g, src, lem                   # tagger probably wrong: keep the curated gloss
def dict_gloss(k, tag=''):
    """(gloss, source, lemma) for lowercase form k with Penn tag (context POS).
    curated tables (form, lemma) first, then ECDICT (lemma, form); senses filtered by the context POS."""
    c = coarse(tag)
    lem = LEMMA_FIX.get(k + '|' + c) or LEMMA_FIX.get(k) or lemma_of(k, tag)
    if k in COMMON: return pick_pos(COMMON[k], c)[0], 'common', lem
    order = [lem, k] if (tag in VTYPE and lem != k) else ([k, lem] if lem != k else [k])
    for w in order:
        g, src = table_gloss(w)
        if g: return choose(w, g, src, c, tag, lem, k)
    for w in ([lem, k] if lem != k else [k]):
        g = ecdict_gloss(w)
        if g: return choose(w, g, 'ecdict', c, tag, lem, k)
    if c:
        for w in order:
            e = ec_pos(w, c)
            if e: return e, 'ecdict-pos', lem
    if tag:   # tagger guess found nothing (understood/JJ): retry without the tag
        r = dict_gloss(k, '')
        if r[0]: return r
        for t2 in ('VBN', 'VBD', 'NNS', 'VBZ', 'VBG'):
            l2 = lemma_of(k, t2)
            if l2 != k:
                r = dict_gloss(l2, '')
                if r[0]: return r[0], r[1], l2
    return '', 'none', lem

def ipa_for(form):
    w = norm(form).lower()
    if w in IPA_X: return '' if IPA_X[w] == '-' else IPA_X[w]
    s = ipa_util.ipa_of(w)
    if not s and w.endswith("'s"):
        b = ipa_for(w[:-2])
        if b: s = b[:-1] + ('z' if b[-2] not in 'ptkfθ' else 's') + '/'
    if not s:
        r = EC.get(w)
        if r and r['phonetic']: s = '/' + r['phonetic'].strip('/') + '/'
    return s
IPA_X = load_tsv(os.path.join(HERE, 'ipa_extra.tsv'))

try:
    import nltk
    nltk.pos_tag(['test'])
    def tag_tokens(text, toks):
        """Penn tags for our word tokens, tagged in context with punctuation and numbers kept."""
        allt = []
        for m in re.finditer(TOK.pattern + r"|\d[\d,:.]*\d|\d|[^\sA-Za-z0-9]", text):
            t = m.group().replace('’', "'")
            c = re.match(r"^(.+?)(n't|'s|'m|'re|'ll|'ve|'d)$", t, re.I)
            if c and c.group(1).lower() not in ('o', 'chang'):
                head = c.group(1)
                if c.group(2).lower() == "n't" and head.lower() in ('won', 'can'): head = {'won': 'will', 'can': 'can'}[head.lower()]
                allt.append((m.start(), head)); allt.append((-1, c.group(2)))
            else:
                allt.append((m.start(), t))
        tags = nltk.pos_tag([t for _, t in allt])
        at = {s: tg for (s, _), (_, tg) in zip(allt, tags) if s >= 0}
        return [at.get(s, '') for s, _, _ in toks]
except Exception as e:  # pragma: no cover
    print('WARNING: nltk tagger unavailable (%s) - glosses will not be POS-filtered' % e)
    def tag_tokens(text, toks): return [''] * len(toks)

# closed-class words: not counted in the unknown-word density (the level lists only hold content words)
FUNC = set('i me my mine you your yours he him his she her hers it its we us our ours they them their theirs a an the to of in on at by for '
           'with from into onto about up down out over under too also am is are was were be been being do does did has have had '
           'and or but so if than that this these those there here what who whom whose which when where why how not no yes oh '
           'can could will would shall should may might must let'.split())
PROPER_OK = set()
# ---------------- build ----------------
def is_name_like(t):
    return t[0].isupper()

hard = []
report = {}
index = {}
for kid, ps in passages.items():
    index[kid] = []
    for p in ps:
        pid = p['id']
        HG = {}      # exact-case hand gloss
        HGL = {}     # lowercase hand gloss (only from lowercase headwords)
        for a, b in p['G']:
            HG[norm(a)] = b
            if a[0].islower(): HGL[norm(a).lower()] = b
        # phrases, longest first
        phs = [(a, b) for a, b in p['PH']]
        phtoks = [[norm(t).lower() for _, _, t in tokens(a)] for a, _ in phs]
        paras = []; gl = {}; used_G = set(); ph_hits = collections.Counter()
        nwords = 0; unknown = collections.Counter(); props = set(); sent = 0; syl = 0; occ = []
        for para in p['paras']:
            toks = tokens(para)
            low = [norm(t).lower() for _, _, t in toks]
            phidx = [-1] * len(toks)
            for pi in sorted(range(len(phs)), key=lambda i: -len(phtoks[i])):
                L = len(phtoks[pi])
                for s in range(0, len(toks) - L + 1):
                    if low[s:s + L] == phtoks[pi] and all(phidx[s + j] == -1 for j in range(L)):
                        # tokens must be adjacent (only spaces between them)
                        if all(re.fullmatch(r'\s+', para[toks[s + j][1]:toks[s + j + 1][0]]) for j in range(L - 1)):
                            for j in range(L): phidx[s + j] = pi
                            ph_hits[pi] += 1
            tags = tag_tokens(para, toks)
            wl = []
            for ti, (s, e, t) in enumerate(toks):
                n = norm(t)
                nwords += 1
                prev = para[:s].rstrip()
                sent_start = not prev or prev[-1] in '.!?:"“' or prev.endswith('."') or prev.endswith('?"') or prev.endswith('!"')
                tag = tags[ti]
                if n in HG:
                    info = (n.lower() if n.lower() != n else n, HG[n], 'hand'); used_G.add(n)
                    base = n
                elif n.lower() in HGL:
                    info = (n.lower(), HGL[n.lower()], 'hand'); used_G.add(n.lower())
                    base = n.lower()
                else:
                    k = n.lower(); base = k
                    g, srcg, lem = dict_gloss(k, tag)
                    if not g and k.endswith("'s"):
                        b0 = k[:-2]
                        bg = HG.get(n[:-2]) or HGL.get(b0) or dict_gloss(b0, 'NN')[0]
                        if bg:
                            first = re.split(r'[，；]', re.sub(r'^[a-z]+\.\s*', '', bg))[0]
                            g, srcg, lem = re.sub(r'（[^）]*）', '', first) + '的', 'possessive', b0
                    if not g and '-' in k:
                        parts = [HGL.get(x) or dict_gloss(x)[0] for x in k.split('-')]
                        if all(parts): g, srcg, lem = ' + '.join(re.split(r'[，；]', re.sub(r'^[a-z]+\.\s*', '', x))[0] for x in parts), 'compound', k
                    info = (lem, g, srcg)
                    if t[0].isupper() and not sent_start:
                        props.add(t)   # capitalised mid-sentence without a hand gloss -> must be reviewed
                occ.append((len(paras), len(wl), base, info, n))
                wl.append([s, e, None, phidx[ti]])
                # stats
                lem = info[0].lower()
                proper = t[0].isupper() and ((info[2] == 'hand' and n in HG) or not sent_start or t in PROPER_OK)
                if not proper and lem not in FUNC and n.lower() not in COMMON and not re.fullmatch(r'[ap]\.m', n.lower()):
                    lists = (LEVELSET['L1'] | ALEXSET) if kid == 'alex' else (LEVELSET['L1'] | LEVELSET['L2'] | LEVELSET['L4-ket'] | LEVELSET['L4-pet'])
                    if lem not in lists and n.lower() not in lists and lemma_of(n.lower()) not in lists:
                        unknown[lem] += 1
                syl += max(1, len(re.findall(r'[aeiouy]+', n.lower())) - (1 if n.lower().endswith('e') and not n.lower().endswith('le') and len(n) > 3 else 0))
            sent += max(1, len(re.findall(r'[.!?]+(?:["”])?(?:\s|$)', para)))
            paras.append({'t': para, 'w': wl})
        # glossary keys: one per form; a form used with different senses in one passage gets form#2, form#3 ...
        variants = collections.defaultdict(list)
        for pi_, wi_, base, info, n in occ:
            if info not in variants[base]: variants[base].append(info)
        for pi_, wi_, base, info, n in occ:
            vi = variants[base].index(info)
            key = base if vi == 0 else base + '#' + str(vi + 1)
            if key not in gl:
                gl[key] = [info[0], ipa_for(info[0] if info[2] == 'possessive' else n), re.sub(r'(……|…)\s+', r'\1', info[1]), info[2]]
                if info[2] == 'possessive': gl[key][1] = ipa_for(n)
            paras[pi_]['w'][wi_][2] = key
        # QC per passage
        issues = []
        nogloss = sorted(k for k, v in gl.items() if not v[2])
        noipa = sorted(k for k, v in gl.items() if not v[1] and IPA_X.get(k.lower()) != '-')
        if nogloss: issues.append('NO GLOSS: ' + ', '.join(nogloss))
        unmatched = [phs[i][0] for i in range(len(phs)) if not ph_hits[i]]
        if unmatched: issues.append('PH not found in text: ' + ' | '.join(unmatched))
        unusedG = [a for a, _ in p['G'] if norm(a) not in used_G and norm(a).lower() not in used_G]
        qs = []
        for qi, q in enumerate(p['qs']):
            tag = '%s Q%d' % (pid, qi + 1)
            if q['type'] == 'tf':
                if q['tf'] not in ('T', 'F') or q['opts']: issues.append(tag + ' tf needs A: T|F and no options')
                o = ['True', 'False']; a = 0 if q['tf'] == 'T' else 1
            else:
                if q['stars'] != 1: issues.append('%s has %d correct (*) options' % (tag, q['stars']))
                o = [x for x, _ in q['opts']]; a = next((i for i, (_, ok) in enumerate(q['opts']) if ok), -1)
                need_n = 3 if kid == 'alex' else 4
                if len(o) != need_n: issues.append('%s has %d options (want %d)' % (tag, len(o), need_n))
                if len(set(x.lower().strip(' .') for x in o)) != len(o): issues.append(tag + ' duplicate options')
            if not q['e']: issues.append(tag + ' no explanation (E:)')
            if kid == 'alex' and not q['qz']: issues.append(tag + ' no Chinese question line')
            qs.append({'type': q['type'], 'q': q['q'], 'qz': q['qz'], 'o': o, 'a': a, 'e': q['e']})
        types = [q['type'] for q in p['qs']]
        if kid == 'emma':
            if len(qs) != 5: issues.append('%d questions (want 5)' % len(qs))
            for t in ('main', 'detail', 'vocab', 'infer', 'tf'):
                if t not in types: issues.append('missing question type ' + t)
            if not 200 <= nwords <= 350: issues.append('length %d outside 200-350' % nwords)
        else:
            if not 3 <= len(qs) <= 4: issues.append('%d questions (want 3-4)' % len(qs))
            if not 60 <= nwords <= 120: issues.append('length %d outside 60-120' % nwords)
        for k in ('title', 'zh', 'level', 'genre', 'src', 'sum'):
            if not p.get(k): issues.append('missing ' + k)
        hard.extend(pid + ': ' + x for x in issues)
        content_tokens = sum(1 for para in paras for w in para['w'])
        unk_tok = sum(unknown.values())
        fk = 0.39 * nwords / max(1, sent) + 11.8 * syl / max(1, nwords) - 15.59
        report[pid] = {
            'title': p['title'], 'words': nwords, 'paras': len(paras), 'sentences': sent, 'avg_sentence': round(nwords / max(1, sent), 1),
            'fk_grade': round(fk, 1), 'glossary': len(gl), 'hand_glossed': sum(1 for v in gl.values() if v[3] == 'hand'),
            'phrases': len(phs), 'questions': len(qs), 'q_types': ','.join(types),
            'unknown_density': '%.1f%% tokens / %d types' % (100.0 * unk_tok / max(1, content_tokens), len(unknown)),
            'unknown_sample': ', '.join(w for w, _ in unknown.most_common(14)),
            'no_ipa': ', '.join(noipa), 'unused_G': ', '.join(unusedG), 'caps_review': ', '.join(sorted(props)),
            'issues': issues,
        }
        obj = {'v': DATA_V, 'id': pid, 'kid': kid, 'title': p['title'], 'zh': p['zh'], 'level': p['level'], 'genre': p['genre'],
               'src': p['src'], 'sum': p['sum'], 'words': nwords, 'paras': paras, 'gl': gl,
               'ph': [[a, b] for a, b in phs], 'qs': qs}
        s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
        if ('{' + '{') in s or ('{' + '%') in s: hard.append(pid + ': template marker in output')
        open(os.path.join(OUT, pid + '.json'), 'w', encoding='utf-8').write(s)
        index[kid].append({'id': pid, 'title': p['title'], 'zh': p['zh'], 'level': p['level'], 'genre': p['genre'], 'words': nwords, 'nq': len(qs)})
idx = {'v': DATA_V, 'alex': index['alex'], 'emma': index['emma']}
open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8').write(json.dumps(idx, ensure_ascii=False, indent=1))

# ---------------- report ----------------
lines = []
for kid in ('alex', 'emma'):
    lines.append('== %s ==' % kid.upper())
    for it in index[kid]:
        r = report[it['id']]
        lines.append('%s  %-44s %3d words  %d paras  %2d sent  avg %4.1f  FK %4.1f  gloss %3d (hand %3d)  ph %2d  q %d [%s]  unknown %s' % (
            it['id'], r['title'][:44], r['words'], r['paras'], r['sentences'], r['avg_sentence'], r['fk_grade'], r['glossary'], r['hand_glossed'],
            r['phrases'], r['questions'], r['q_types'], r['unknown_density']))
        if r['unknown_sample']: lines.append('       unknown: ' + r['unknown_sample'])
        if r['no_ipa']: lines.append('       no IPA: ' + r['no_ipa'])
        if r['unused_G']: lines.append('       unused G: ' + r['unused_G'])
        if r['caps_review']: lines.append('       CAPS (no hand gloss): ' + r['caps_review'])
        for x in r['issues']: lines.append('       !! ' + x)
tot_gl = sum(r['glossary'] for r in report.values())
tot_nog = sum(len([1 for x in r['issues'] if x.startswith('NO GLOSS')]) for r in report.values())
tot_ipa = sum(len(r['no_ipa'].split(', ')) if r['no_ipa'] else 0 for r in report.values())
lines.append('passages: alex %d, emma %d | glossary entries %d | words without gloss: %d passages affected | entries without IPA: %d' % (
    len(index['alex']), len(index['emma']), tot_gl, tot_nog, tot_ipa))
lines.append('TOTAL HARD FAILURES: %d' % len(hard))
txt = '\n'.join(lines)
print(txt)
open(os.path.join(HERE, 'qc_report.txt'), 'w', encoding='utf-8').write(txt + '\n')
json.dump(report, open(os.path.join(HERE, 'qc_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(1 if hard else 0)
