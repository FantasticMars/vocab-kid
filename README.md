# 单词小达人（双档案）

给孩子用的英语单词练习小网页（中文界面）。支持两个档案：

| 档案 | 内容 |
|------|------|
| **Alex** | 小学课本 Welcome + Unit 1–6（`data/words.json`） |
| **Emma** | 六年级/初一 PET 主题词（`data/emma-pet.json`） |

## 打开方式

```bash
cd /Users/yz/Desktop/vocab-kid   # 或 /workspace/vocab-kid
python3 -m http.server 8765
```

- 本机：http://localhost:8765/
- iPad（同 Wi‑Fi）：http://192.168.5.60:8765/

## 孩子怎么用

1. 启动先选 **Alex** 或 **Emma**（右上角可切换）。
2. 选单元 → **闯关** 或单独模式（英→中 / 中→英 / 填空 / 拼写 / **听写挑战**）。
3. 每关结束有 **星星（最多 5★，可半星）**；听写会计时，冲击「最好成绩」。

## 给 Emma 加单词

编辑 `data/emma-pet.json`：在某个 `units[]` 的 `words` 里追加 `{ "en": "...", "zh": "..." }`，可选加 `fillIns` / `sentences`。保存后刷新即可。Alex 词表同理改 `data/words.json`。

## 本地存储

- `vocabKid.activeProfile` — 当前档案 id（`alex` / `emma`）
- `vocabKid.profiles.v1` — 各档案的 progress / history / bests（听写 PB）

## 中文 语文（v8）
- 选档案后先选「英文 English」或「中文 语文」（只有有字库的档案才能进语文；Emma 显示空状态）。
- 字库：`data/alex-hanzi.json`（三年级上册，按单元/课：四会生字 250 个 + 看拼音写词语 451 个）。
  源数据与生成脚本在 `tools/hanzi/`（`python3 build.py`，需要 `pip install pypinyin`）。
- 写字用 [Hanzi Writer](https://hanziwriter.org)（MIT，`lib/hanzi-writer.min.js` v3.7.3），
  笔画数据来自 hanzi-writer-data（Make Me a Hanzi，Arphic Public License，见 `data/hanzi/ARPHICPL.TXT`），
  已放在 `data/hanzi/<字>.json`，不依赖 CDN。
- 模式：认字卡、读音、组词、选词填空、描红、默写、听写挑战（计时+最好成绩）、错字复习。
- 语文进度保存在同一个 localStorage 档案下的 `hanzi` 字段，与英文进度互不影响。

## Emma English 系统（v11）
Emma 选「英文」后进入四条路线：
- **今日任务**：每天 N 个新词（家长设置，默认 20，可选来源级别）+ 到期复习（Leitner，间隔 0/1/2/4/7/15/30/60 天，第 5 盒＝掌握）。
  新词走拼写向步骤（词卡 → 选意思 + 拼写 → 听写），场景短语走用法向步骤（场景词卡 → 语境选义 → 情景选句）。
- **分级词汇**（重拼写 + 词义）：L1 小学 / L2 初中 / L4 KET / L4 PET（L3 高中、L5 AWL、FCE 即将上线），每组 20 词可多选。
  模式：闯关、认词卡、EN→CN、CN→EN、拼写、听写、词形/搭配、综合测试（拼写 + 听写占一半以上）。
- **场景学习**（重语境 + 用法，不考拼写）：机场、校园、餐厅、超市、看病、社交，各 3 个小场景 + 2 段对话。
  模式：场景词卡、语境选义、情景选句、听对话补全、听一句选回应、对话排序、角色扮演、跟读、场景综合测试。
- **课本 & PET**：原来的 `data/emma-pet.json` 单元练习。

SRS 存在 localStorage 档案的 `emma` 字段（`srs` / `settings` / `daily`）。Alex 不受影响。

### Emma English 数据管线
原始资料放在 `/workspace/emma-src`（不入库）：课标 markdown、Cambridge PDF 文本、ECDICT csv、cmudict.dict、Tatoeba tsv、KyleBing json。
```
python3 tools/emma/parse_lists.py SRC SRC/raw          # 课标 / KET / PET / AWL 词表 → raw/*.json
python3 tools/emma/build_levels.py SRC . L1,L2,L4-ket,L4-pet   # 释义、IPA、例句、搭配 → data/emma/levels/*.json
python3 tools/emma/make_level_index.py .               # data/emma/levels/index.json
python3 tools/emma/build_scenes.py SRC/cmudict.dict .  # tools/emma/scenes/*.txt → data/emma/scenes/*.json
python3 tools/emma/qc.py . SRC/ecdict/ecdict.csv       # 质检（必须 TOTAL HARD FAILURES: 0）
```
来源与许可见 `data/SOURCES.md`。
