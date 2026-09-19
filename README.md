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
