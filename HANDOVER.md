# HANDOVER — janken

## 現在地 (2026-09-28)

- `index.html`: **デバッグモード**。常時2ペイン。
  - 上段: **Game**（丸絵文字ボタン ✊✌️✋ + 回転する AI の手 + `¥10 投入`）
  - 左ペイン: **Profile**（6項目、各 `+¥100`）＋ 左下に **デバッグシグナルのデッキ**
  - 右ペイン: **Stats**（戦績: 残高・W/L/D・勝率・判定理由/確信・傾向・履歴ログ）
  - nav（タブ）は廃止
- Game ルール: `¥10 投入`で開始。あいこは再投入なしで回り続ける。勝ち `+¥10` / 負け `−¥10`（投入 −10、勝ち payout +20）
- デバッグシグナル（`renderDebug`）: session / phase / round / balance / profile / events / predicted / hand / confidence / needsHuman / tendency
- `sw.js`: キャッシュ `janken-pwa-v4`、navigation は network-first

## テスト

- `test/janken.test.js`（node:test、依存なし）。実行: `node --test`
- エンジン（judge / HANDS / predict / play）、en2ja、index.html の構造不変条件を検査

## 検証状況

- node の DOM スタブでロジック検証済み（投入→回転→判定→10回で継続、profile 加算、デッキ 11 cards）
- **実ブラウザ未検証**（この環境にブラウザなし。`chromium-browser` は snap 未導入で起動不可）

## 既知

- 癖検出が弱く、同じ手を出し続けると AI も同じ手を返してあいこが続く（仕様）
- 旧 SW キャッシュを持つブラウザは最大数回リロードが必要（v4 で network-first）
