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

## 非目標

- 強い AI（**勝つ**ためではなく、**判定を出す**ため）
- 通信・アカウント・保存
- サーバ側の実装（ブラウザで完結する）

## 未確認

- 癖の検出は「直近 6 手 + 1 次マルコフ」だけ。**弱い**（意図的に。判定の見える化が目的）
- ブラウザでの動作は未検証（この環境にブラウザが無い。`node` での動作は確認済み）
