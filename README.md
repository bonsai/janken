# janken — じゃんけんを「判定」で選ぶ

**乱数を使わない。生成しない。判定だけする。**

`janken.jev.js` は、相手の癖を観測して手を選ぶ。Jev（TypeSafe System One）の 3 つの形だけで組む。

| 形 | ここでの意味 |
|---|---|
| `Choice` | グー / チョキ / パー。**3 つ以外は構造的に返せない** |
| `Score` | その手をどれくらい推すか（0..1） |
| `Noul` | 「癖が十分か」（Yes / No） |

## 動かす

```bash
python3 -m http.server 8080     # index.html を開く
# または
node --input-type=module -e "
import { JankenJev } from './janken.jev.js';
const ai = new JankenJev({ seed: 0 });
ai.observe('グー'); ai.observe('グー'); ai.observe('チョキ');
console.log(ai.play('チョキ'));
"
```

`index.html` は 1 ファイルで完結。依存なし。鍵も要らない。

## 画面

`index.html` は 3 ビュー（Game / Profile / Stats）に分けた SPA。

- **Game** — 丸絵文字ボタン（✊✌️✋）3つのみ。`¥10 投入`で AI の手が回り出す。あいこは再投入なしで回り続ける。勝ち `+¥10` / 負け `−¥10`（投入 −10、勝ち payout +20）
- **Profile** — 6 項目、1 項目ごとに `+¥100`（残高に加算）
- **Stats** — 残高・回数・勝敗・勝率・判定理由/確信・傾向・履歴

## 中身

- `tendency()` — 直近 `window` 手の頻度。これが判定の材料
- `followUp(prev)` — 「相手が X を出したあと何を出しやすいか」の 1 次マルコフ
- `play(playerHand)` — 上の 2 つを `Noul`（信じてよいか）で束ね、`Choice` で手を返す
- `HUMAN_THRESHOLD = 0.55` — これ未満は **「分からない」として引く**（人に投げる場所）

## なぜ乱数を使わないか

- 乱数だと**説明できない**。「なぜその手か」を出すには、材料と確信が要る
- 同じ履歴なら**同じ手**（決定的）。だからテストできる
- 相手が人なら、人の癖は乱数より読める。**判定の練習台**として作っている

## 検査

```bash
# 同じ履歴なら同じ手（決定的）
node --input-type=module -e "
import { JankenJev } from './janken.jev.js';
const a=new JankenJev({seed:0}), b=new JankenJev({seed:0});
for (const h of ['グー','チョキ','グー']) { a.observe(h); b.observe(h); }
const x=a.play('グー'), y=b.play('グー');
console.log(x.hand===y.hand ? 'ok 決定的' : 'NG');
"
```

- [x] 3 つの手以外を返さない（`Choice` の options が型）
- [x] 同じ履歴・同じ seed で同じ手
- [x] 履歴が 3 手未満なら「分からない」に落ちる


## 戦績と学習（jsonl / ml）

- 戦績は `data/scores.jsonl`（**追記型**。1 行 1 回。壊れた行は捨てる）
- 癖を見抜く部分は別 repo **`bonsai/jjj`** に分けた（読むだけのエージェント）
- 学習: `node ml/train.js data/scores.jsonl data/model.json` → 12 次元の softmax（依存なし）
  - 実測（**ダミーの 24 行**）: `acc 78.3% / baseline 60.9% / samples 23`
  - **ダミーデータなので、この数字は「学習が動いた」ことしか示さない**
- `file://` でも動く（`janken.jev.js` は古典スクリプト。Node からは `janken.jev.mjs`）

## サンプル（file:// で開く）

```
file://wsl$/Ubuntu-24.04/home/sexy/repo/janken/index.html
```

## 非目標

- 強い AI（**勝つ**ためではなく、**判定を出す**ため）
- 通信・アカウント・保存
- サーバ側の実装（ブラウザで完結する）

## 未確認

- 癖の検出は「直近 6 手 + 1 次マルコフ」だけ。**弱い**（意図的に。判定の見える化が目的）
- ブラウザでの動作は未検証（この環境にブラウザが無い。`node` での動作は確認済み）
