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
2. 选单元 → 三个大按钮：**学习**（闯关）/ **练习**（混合一小关）/ **测试**；单项模式（英→中 / 中→英 / 填空 / 拼写 / 听写挑战）收在「单项练习」里。
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

## Emma English 系统（v11，v12 简化入口）
Emma 选「英文」后进入五条路线（v15 加了「阅读」）：
- **今日任务**：每天 N 个新词（家长设置，默认 20，可选来源级别）+ 到期复习（Leitner，间隔 0/1/2/4/7/15/30/60 天，第 5 盒＝掌握）。
  新词走拼写向步骤（词卡 → 选意思 + 拼写 → 听写），场景短语走用法向步骤（场景词卡 → 语境选义 → 情景选句）。
- **分级词汇**（重拼写 + 词义）：L1 小学 / L2 初中 / L3 高中 / L4 KET / L4 PET（L5 AWL、FCE 即将上线），每组 20 词可多选。
  入口（v12）：**学习**（6 词：认词卡 → 选意思 → 拼写 → 听写）/ **练习**（混合：EN→CN、CN→EN、拼写、听写、词形/搭配）/ **测试**（25 题，拼写 + 听写占一半以上）；另有「浏览认词卡」小链接。
- **场景学习**（重语境 + 用法，不考拼写）：12 个留学场景——校园、寄宿家庭与宿舍、餐厅、超市、交通出行、机场、看病、银行与手机卡、租房、交友社交、运动娱乐、求助与紧急情况，各 3 个小场景 + 每个小场景 2 段对话。
  入口（v12）：**学习**（场景词卡 + 对话，点一句听一句）/ **练习**（语境选义、情景选句、选回应、对话补全、对话排序混合）/ **对话**（角色扮演 + 跟读，一处完成）/ **测试**。
  对话一律点读：任何模式都不会自动连读多句；全 App 英文只用同一个声音（优先 Samantha，排除 iPad 上的怪声音）。
- 英文测试（分级 / 场景 / 课本综合测试）：每题答完马上显示对错并给出正确答案，答对自动下一题，答错点「下一题」；最后仍出 100 分成绩单。语文综合测试不变。
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

## 阅读 Reading（v15）
- 入口：Emma 的路线页「📖 阅读」（20 篇，初一 / A2–B1，200–350 词，每篇 5 题：主旨、细节、词义、推断、判断）；
  Alex 英文首页「📖 阅读」（10 篇，小学一二年级，60–120 词，每篇 3–4 题，带中文题干）。
- 列表：英文 + 中文标题、难度、词数、完成状态和最好成绩。
- 读文章：长按任意单词（约 0.45 秒，手指或鼠标）→ 读出这个词 + 弹出音标和中文（在词组里的词还会显示词组意思）；
  轻点不触发；点别处关闭。文章区域禁止选字 / 放大镜 / 长按菜单。每段右边 🔊 只读这一段，绝不自动朗读、不连读。
- 做题：读完点「做题」，一次一题，选项打乱；马上显示对错（绿 / 红）和正确答案，答对 1.3 秒后自动下一题，答错显示讲解和「下一题」；
  做题时可点「📖 看文章」回看（同样可长按查词）。最后出星星、分数和错题回顾。
- 进度存在档案的 `reading` 字段：`{ id: { read, done, best, bestC, n, lastScore, last, tries } }`；「进度」页显示阅读进度；家长清空进度时一起清掉。

### 阅读数据管线
```
pip install nltk && python3 -c "import nltk; nltk.download('averaged_perceptron_tagger_eng')"   # 只在构建时用
python3 tools/reading/build.py /workspace/emma-src     # src/*.txt → data/reading/*.json，打印质检，必须 TOTAL HARD FAILURES: 0
```
- 原文、题目、手写释义：`tools/reading/src/alex.txt`、`emma.txt`（格式见 build.py 顶部说明）。
- 每篇的词表覆盖文中所有词形：原形、美式音标（CMUdict）、简短中文（手写 G:/PH: > `gloss_common.tsv` > Emma 词表释义 > ECDICT 清洗后），
  用词性标注挑选上下文里的意思（leaves 叶子 / 离开）。
- 质检报告：`tools/reading/qc_report.txt`（每篇词数、句长、FK 年级、生词密度〔Alex 对照 L1 + 课本词，Emma 对照 L1/L2/KET/PET〕、
  无释义 0、每题恰好一个 *、选项无重复、题型齐全）。
