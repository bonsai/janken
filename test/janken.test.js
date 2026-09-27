/**
 * test/janken.test.js — 依存なし（node:test）。実行: node --test test/
 *
 * 検査対象:
 *   - janken.jev.js（判定エンジン。Choice / Score / Noul）
 *   - en2ja.js（表示辞書）
 *   - index.html（SPA の構造不変条件。nav id の取り違え等の再発防止）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JankenJev, HANDS, BEATS, judgeRound, HUMAN_THRESHOLD } from "../janken.jev.mjs";
import "../en2ja.js";

const en2ja = globalThis.en2ja;
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** 決定的な擬似乱数（テストを再現可能にする） */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function pick(rng) {
  return HANDS[Math.floor(rng() * HANDS.length)];
}
function fresh() {
  return new JankenJev({ window: 6 });
}

// ---------------------------------------------------------------------------
// 1. 構造: HANDS は 3 つ。3 つ以外は返せない
// ---------------------------------------------------------------------------

test("HANDS は グー / チョキ / パー の 3 つ", () => {
  assert.equal(HANDS.length, 3);
  assert.deepEqual([...HANDS].sort(), ["グー", "チョキ", "パー"].sort());
});

test("BEATS は 3 手すべてを被覆し、循環する（グー→チョキ→パー→グー）", () => {
  assert.deepEqual(Object.keys(BEATS).sort(), [...HANDS].sort());
  assert.equal(BEATS["グー"], "チョキ");
  assert.equal(BEATS["チョキ"], "パー");
  assert.equal(BEATS["パー"], "グー");
});

test("judgeRound: 9 通りの勝敗表", () => {
  const table = {
    "グー,チョキ": "勝ち",
    "グー,パー": "負け",
    "チョキ,パー": "勝ち",
    "チョキ,グー": "負け",
    "パー,グー": "勝ち",
    "パー,チョキ": "負け",
    "グー,グー": "あいこ",
    "チョキ,チョキ": "あいこ",
    "パー,パー": "あいこ",
  };
  for (const [pair, expected] of Object.entries(table)) {
    const [a, b] = pair.split(",");
    assert.equal(judgeRound(a, b), expected, `${a} vs ${b}`);
  }
});

// ---------------------------------------------------------------------------
// 2. JankenJev.observe — 入力の選別と履歴の上限
// ---------------------------------------------------------------------------

test("observe は 3 手以外を捨てる", () => {
  const ai = fresh();
  ai.observe("グー");
  ai.observe("raptor");
  ai.observe("");
  ai.observe(null);
  ai.observe(undefined);
  assert.deepEqual(ai.history, ["グー"]);
});

test("履歴は 64 手で頭切りされる", () => {
  const ai = fresh();
  for (let i = 0; i < 100; i++) ai.observe(pick(makeRng(i)));
  assert.equal(ai.history.length, 64);
});

// ---------------------------------------------------------------------------
// 3. tendency / followDistribution — 判定の材料
// ---------------------------------------------------------------------------

test("tendency は窓内の頻度で、合計が 1 になる", () => {
  const ai = new JankenJev({ window: 4 });
  for (const h of ["グー", "グー", "チョキ", "パー", "グー", "グー"]) ai.observe(h);
  const t = ai.tendency(); // 直近 4 手: チョキ,パー,グー,グー
  assert.equal(t["チョキ"], 0.25);
  assert.equal(t["パー"], 0.25);
  assert.equal(t["グー"], 0.5);
  const sum = HANDS.reduce((a, h) => a + t[h], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("履歴が空でも tendency は 0 を返す（0 除算しない）", () => {
  const t = fresh().tendency();
  for (const h of HANDS) assert.equal(t[h], 0);
});

test("followDistribution: 遷移が無ければ null", () => {
  const ai = fresh();
  ai.observe("グー");
  assert.equal(ai.followDistribution("グー"), null); // 直後の手が無い
  assert.equal(ai.followDistribution("チョキ"), null); // そもそも出ていない
});

test("followDistribution: グーの後はチョキ、を学習する（Laplace 平滑化つき）", () => {
  const ai = fresh();
  for (const h of ["グー", "チョキ", "グー", "チョキ"]) ai.observe(h);
  const d = ai.followDistribution("グー"); // グー→チョキ が 2 回。事前 +1 で 3/5
  assert.equal(d["チョキ"], 0.6);
  assert.equal(d["グー"], 0.2);
  assert.equal(d["パー"], 0.2);
  assert.equal(Math.max(...HANDS.map((h) => d[h])), d["チョキ"]);
});

// ---------------------------------------------------------------------------
// 4. predict — Score と Noul（信じてよいか）
// ---------------------------------------------------------------------------

test("履歴が浅いと「分からない」（needsHuman = true, confidence 0）", () => {
  const d = fresh().predict();
  assert.equal(d.confidence, 0);
  assert.equal(d.needsHuman, true);
  assert.equal(d.predicted, HANDS[0]); // 同点は先頭
  assert.equal(d.reason, "直近の頻度から推定");
});

test("confidence は [0,1] に収まる", () => {
  const rng = makeRng(7);
  const ai = fresh();
  for (let i = 0; i < 40; i++) {
    ai.observe(pick(rng));
    const { confidence } = ai.predict();
    assert.ok(confidence >= 0 && confidence <= 1, `confidence=${confidence}`);
  }
});

test("癖が十分なら predicted が頻出手になる（Score が最大）", () => {
  const ai = fresh();
  for (let i = 0; i < 8; i++) ai.observe("グー");
  const d = ai.predict();
  assert.equal(d.predicted, "グー");
  assert.ok(d.scores["グー"] > d.scores["チョキ"]);
  assert.ok(d.scores["グー"] > d.scores["パー"]);
});

test("マルコフ: グー→チョキ の癖を next 予測に反映する", () => {
  const ai = fresh();
  // 末尾は グー。直前が グー のときは チョキ が続く、という遷移を材料にする
  for (const h of ["グー", "チョキ", "グー", "チョキ", "グー"]) ai.observe(h);
  const d = ai.predict();
  assert.equal(d.predicted, "チョキ");
  assert.ok(d.scores["チョキ"] > d.scores["グー"]);
});

test("Noul: 信じられる（confidence >= threshold）ときだけ needsHuman=false", () => {
  const ai = fresh();
  for (let i = 0; i < 12; i++) ai.observe("グー");
  const d = ai.predict();
  assert.equal(d.needsHuman, d.confidence < HUMAN_THRESHOLD);
  assert.equal(d.needsHuman, false);
  assert.equal(d.reason, "直近の手から次の傾向を推定");
});

// ---------------------------------------------------------------------------
// 5. play — Choice（3 手のどれかを返す）
// ---------------------------------------------------------------------------

test("play は必ず HANDS のいずれかを返す（多様な履歴で）", () => {
  const rng = makeRng(42);
  const ai = fresh();
  for (let i = 0; i < 500; i++) {
    ai.observe(pick(rng));
    const d = ai.play();
    assert.ok(HANDS.includes(d.hand), `hand=${d.hand}`);
    assert.deepEqual(d.options, [...HANDS]);
    assert.equal(d.kind, "choice");
  }
});

test("癖を信じるときは「predicted に勝つ手」を返す", () => {
  const ai = fresh();
  for (let i = 0; i < 12; i++) ai.observe("グー");
  const d = ai.play();
  assert.equal(d.predicted, "グー");
  assert.equal(d.needsHuman, false);
  assert.equal(d.hand, "パー"); // グー に勝つのは パー
  assert.equal(BEATS[d.hand], d.predicted);
});

test("分からないときは predicted をそのまま返す（勝ち手に変換しない）", () => {
  const d = fresh().play();
  assert.equal(d.needsHuman, true);
  assert.equal(d.hand, d.predicted);
});

test("決定的: 同じ履歴なら同じ判定（手・確信・Score）", () => {
  const seq = ["グー", "チョキ", "グー", "チョキ", "パー", "パー"];
  const a = fresh();
  const b = fresh();
  for (const h of seq) {
    a.observe(h);
    b.observe(h);
  }
  const da = a.play();
  const db = b.play();
  assert.equal(da.hand, db.hand);
  assert.equal(da.confidence, db.confidence);
  assert.equal(da.predicted, db.predicted);
  assert.deepEqual(da.scores, db.scores);
});

test("play は observe より前の履歴だけで判定する（リークなし）", () => {
  const a = fresh();
  const b = fresh();
  a.observe("グー");
  a.observe("グー");
  b.observe("グー");
  b.observe("グー");
  // b だけ先に手を出す → a と同一判定のはず
  const before = b.play();
  a.observe("チョキ"); // a に余計な観測を足す
  const after = b.play();
  assert.equal(before.hand, after.hand);
  assert.equal(before.confidence, after.confidence);
});

// ---------------------------------------------------------------------------
// 6. en2ja — 表示辞書
// ---------------------------------------------------------------------------

test("en2ja は既知キーを日本語にし、未知はそのまま返す", () => {
  assert.equal(en2ja("rock"), "グー");
  assert.equal(en2ja("scissors"), "チョキ");
  assert.equal(en2ja("paper"), "パー");
  assert.equal(en2ja("win"), "勝ち");
  assert.equal(en2ja("draw"), "あいこ");
  assert.equal(en2ja("unknown-key"), "unknown-key");
});

// ---------------------------------------------------------------------------
// 7. index.html の構造不変条件（DOM 無しで検証できる範囲）
// ---------------------------------------------------------------------------

test("SPA: game / profile / stats の 3 パネルが存在する", () => {
  for (const v of ["game", "profile", "stats"]) {
    assert.match(html, new RegExp(`id="panel-${v}"`), `panel-${v}`);
  }
});

test("SPA: nav の id は navGame / navProfile / navStats（nav-xxx ではない）", () => {
  for (const id of ["navGame", "navProfile", "navStats"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.doesNotMatch(html, /id="nav-(game|profile|stats)"/);
});

test("Game: 丸ボタンは グー / チョキ / パー の 3 つで、絵文字を持つ", () => {
  const hands = [...html.matchAll(/class="hand" data-hand="([^"]+)"[^>]*>([^<]+)</g)];
  assert.equal(hands.length, 3);
  assert.deepEqual(hands.map((m) => m[1]), ["グー", "チョキ", "パー"]);
  assert.deepEqual(hands.map((m) => m[2]), ["✊", "✌️", "✋"]);
});

test("Game: 投入ボタンと回転する AI の手がある", () => {
  assert.match(html, /id="insertCoin"/);
  assert.match(html, /id="aiHand"/);
  assert.match(html, /\.ai-hand\.spin\{animation/);
  assert.match(html, /¥10 投入/);
});

test("Game: 投入前に手は無効化されている（初期は disabled）", () => {
  assert.match(html, /setHandsEnabled\(false\)/);
});

test("inline スクリプトは IIFE で包む（グローバル const の再宣言を避ける）", () => {
  assert.match(html, /\(function\(\)\{/);
  assert.match(html, /\}\)\(\);/);
});
