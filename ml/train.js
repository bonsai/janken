/**
 * ml/train.js — 戦績（JSONL）から Jev の判定を強くする。依存なし。
 *
 *   node ml/train.js data/scores.jsonl data/model.json
 *   node ml/train.js data/scores.jsonl --cross           # 精度だけ見る
 *
 * やっていること: 「プレイヤーの次の手」を当てる 3 クラス分類（softmax + 勾配降下）。
 * 当たれば、その手に勝つ手を選ぶだけ。**生成ではなく判定**（Jev と同じ立場）。
 *
 * 特徴（12 次元）:
 *   直前の手 one-hot(3) + 2 手前 one-hot(3) + 直近の頻度(3) + 連続同手(1)
 *   + 直前の「あいこ」フラグ(1) + 全体の頻度(1) … 計 12
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const HANDS = ["グー", "チョキ", "パー"];

export function loadJsonl(path) {
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    try {
      const r = JSON.parse(s);
      if (HANDS.includes(r.you)) out.push(r);
    } catch {
      /* 壊れた行は飛ばす（追記型なので途中で壊れうる） */
    }
  }
  return out;
}

/** 履歴（プレイヤーの手の配列）から特徴を作る */
export function features(hist) {
  const f = new Array(12).fill(0);
  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  if (last) f[HANDS.indexOf(last)] = 1;
  if (prev) f[3 + HANDS.indexOf(prev)] = 1;
  const recent = hist.slice(-6);
  const counts = [0, 0, 0];
  for (const h of recent) counts[HANDS.indexOf(h)]++;
  for (let i = 0; i < 3; i++) f[6 + i] = counts[i] / Math.max(1, recent.length);
  let streak = 0;
  for (let i = hist.length - 1; i > 0 && hist[i] === hist[i - 1]; i--) streak++;
  f[9] = Math.min(1, streak / 5);
  f[10] = last && prev && last === prev ? 1 : 0;
  const i = HANDS.indexOf(last);
  f[11] = i >= 0 ? 1 : 0;
  return f;
}

function softmax(z) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

/** 学習。決定的（seed 付きの乱数ではなく 0 初期化） */
export function train(rows, opt = {}) {
  const epochs = opt.epochs ?? 400;
  const lr = opt.lr ?? 0.35;
  const l2 = opt.l2 ?? 0.001;
  const N = 12;
  const W = [Array(N).fill(0), Array(N).fill(0), Array(N).fill(0)];
  const b = [0, 0, 0];

  const samples = [];
  const hist = [];
  for (const r of rows) {
    if (hist.length >= 1) samples.push({ x: features(hist), y: HANDS.indexOf(r.you) });
    hist.push(r.you);
  }
  if (!samples.length) return { W, b, samples: 0, acc: 0, baseline: 0 };

  for (let ep = 0; ep < epochs; ep++) {
    for (const { x, y } of samples) {
      const z = W.map((w, k) => w.reduce((s, wk, i) => s + wk * x[i], 0) + b[k]);
      const p = softmax(z);
      for (let k = 0; k < 3; k++) {
        const g = p[k] - (k === y ? 1 : 0);
        for (let i = 0; i < N; i++) W[k][i] -= lr * (g * x[i] + l2 * W[k][i]);
        b[k] -= lr * g;
      }
    }
  }

  // 精度（学習データ）と、最も多い手を常に答えた場合の比較
  let hit = 0;
  const cnt = [0, 0, 0];
  for (const { x, y } of samples) {
    const p = softmax(W.map((w, k) => w.reduce((s, wk, i) => s + wk * x[i], 0) + b[k]));
    if (p.indexOf(Math.max(...p)) === y) hit++;
    cnt[y]++;
  }
  return { W, b, samples: samples.length, acc: hit / samples.length, baseline: Math.max(...cnt) / samples.length };
}

export function saveModel(path, m) {
  const model = {
    version: 1,
    kind: "softmax-next-hand",
    trained_at: new Date().toISOString(),
    hands: HANDS,
    features: ["last3", "prev3", "recent_freq3", "streak", "same_as_prev", "has_last"],
    W: m.W,
    b: m.b,
    samples: m.samples,
    acc: Number(m.acc.toFixed(4)),
    baseline: Number(m.baseline.toFixed(4)),
    note: "同じ履歴なら同じ判定（決定的）。生成はしない",
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(model, null, 2) + "\n");
  return model;
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node ml/train.js <scores.jsonl> [model.json|--cross]");
    return 2;
  }
  const rows = loadJsonl(input);
  if (rows.length < 20) {
    console.error(`戦績が ${rows.length} 件。20 件未満では判定を学習しない（偶然を学習する）`);
    return 1;
  }
  const m = train(rows);
  console.log(`samples=${m.samples} acc=${(m.acc * 100).toFixed(1)}% baseline=${(m.baseline * 100).toFixed(1)}%`);
  if (output === "--cross" || !output) return 0;
  const model = saveModel(output, m);
  console.log(`OK -> ${output} (acc ${model.acc}, baseline ${model.baseline})`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
