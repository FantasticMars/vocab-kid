"""US IPA from CMUdict (BSD-2), syllable-aware stress marks."""
import re
_P = None
def P(x): return _P
CMU = {}
def init(path):
  for line in open(path, encoding='utf-8'):
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


IPA_OVR = {'gp': '/ˌdʒiˈpi/', 'atm': '/ˌeɪtiˈem/', 'wi-fi': '/ˈwaɪfaɪ/', 'call 911': '/kɔl ˌnaɪn wʌn ˈwʌn/', 'emoji': '/ɪˈmoʊdʒi/', 'pin': '/pɪn/', 'e-ticket': '/ˈiˌtɪkət/', 'lead': '/lid/', 'live': '/lɪv/', 'wind': '/wɪnd/', 'tear': '/tɪr/', 'use': '/juz/', 'close': '/kloʊs/',
           'read': '/rid/', 'record': '/ˈrekərd/', 'present': '/ˈprezənt/', 'object': '/ˈɑbdʒekt/', 'minute': '/ˈmɪnət/',
           'desert': '/ˈdezərt/', 'content': '/ˈkɑntent/', 'row': '/roʊ/', 'bow': '/baʊ/', 'wound': '/wund/',
           'p.m.': '/ˌpiˈem/', 'a.m.': '/ˌeɪˈem/', 'o.k.': '/ˌoʊˈkeɪ/', 'ok': '/ˌoʊˈkeɪ/', 'tv': '/ˌtiˈvi/', 'dvd': '/ˌdiviˈdi/',
           'cd': '/ˌsiˈdi/', 'pe': '/ˌpiˈi/', 'ai': '/ˌeɪˈaɪ/', 'id': '/ˌaɪˈdi/', 'it': '/ɪt/', 'cv': '/ˌsiˈvi/', 'dj': '/ˈdiˌdʒeɪ/',
           'duvet': '/duˈveɪ/', 'cookery': '/ˈkʊkəri/', 'the': '/ðə/', 'a': '/ə/', 'an': '/ən/', 'mr': '/ˈmɪstər/', 'mrs': '/ˈmɪsɪz/', 'ms': '/mɪz/', 'dr': '/ˈdɑktər/',
           'refuse': '/rɪˈfjuz/', 'produce': '/prəˈdus/', 'contract': '/ˈkɑntrækt/', 'permit': '/pərˈmɪt/', 'suspect': '/səˈspekt/', 'conduct': '/kənˈdʌkt/', 'contrast': '/ˈkɑntræst/', 'invalid': '/ɪnˈvælɪd/', 'estimate': '/ˈestəmət/', 'approximate': '/əˈprɑksəmət/', 'alternate': '/ˈɔltərnət/', 'separate': '/ˈsepərət/', 'graduate': '/ˈɡrædʒuət/', 'subject': '/ˈsʌbdʒekt/', 'project': '/ˈprɑdʒekt/', 'progress': '/ˈprɑɡres/', 'increase': '/ɪnˈkris/', 'export': '/ˈekspɔrt/', 'import': '/ˈɪmpɔrt/', 'address': '/ˈædres/', 'perfect': '/ˈpɜrfɪkt/', 'polish': '/ˈpɑlɪʃ/', 'excuse': '/ɪkˈskjuz/'}
def ipa_of(w):
    return IPA_OVR.get(w.lower()) or ipa(w)
