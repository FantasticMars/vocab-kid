#!/usr/bin/env python3
"""Write data/emma/levels/index.json (level list incl. placeholders) from the built level files.
Usage: python3 make_level_index.py REPO"""
import json, os, sys
repo = sys.argv[1] if len(sys.argv) > 1 else '.'
d = os.path.join(repo, 'data/emma/levels')
ORDER = [
    ('L1', 'L1 小学', '课标二级词汇 · 小学核心词'),
    ('L2', 'L2 初中', '课标三级词汇 · 初中新增'),
    ('L3', 'L3 高中', '高中课标 必修 + 选择性必修'),
    ('L4-ket', 'L4 KET · A2', '剑桥 A2 Key 官方词表'),
    ('L4-pet', 'L4 PET · B1', '剑桥 B1 Preliminary（KET 以外新增）'),
    ('L5', 'L5 学术 AWL', '学术词汇表 570 词族'),
    ('L6-fce', 'FCE · B2', '剑桥 B2 First'),
]
out = []
for lid, name, sub in ORDER:
    f = os.path.join(d, lid + '.json')
    if os.path.exists(f):
        j = json.load(open(f))
        out.append({'id': lid, 'name': name, 'sub': sub, 'ready': True, 'count': j['count'], 'groups': len(j['groups'])})
    else:
        out.append({'id': lid, 'name': name, 'sub': sub, 'ready': False})
json.dump({'levels': out}, open(os.path.join(d, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps(out, ensure_ascii=False))
