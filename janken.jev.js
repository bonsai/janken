/**
 * janken.jev.js — じゃんけんの手を「判定」で選ぶ（古典スクリプト / file:// でも動く）。
 *
 * ★ 乱数を使わない。★ 生成しない。判定だけする（Jev / TypeSafe System One の考え方）。
 *
 *   Choice  どれか        … グー / チョキ / パー（この 3 つ以外は返せない）
 *   Score   どの程度か    … その手をどれくらい推すか（0..1）
 *   Noul    求めているか  … 相手の癖に当てはまるか（Yes / No）
 *
 * 依存なし。ブラウザでも Node でも動く（UMD っぽく書かない。ESM + グローバル公開）。
 *
 * 使い方:
 *   import { JankenJev } from "./janken.jev.js";
 *   const ai = new JankenJev();
 *   const round = await ai.play(playerHand);   // 判定して返す
 */

const HANDS = ["グー", "チョキ", "パー"];

/** 何に勝つか（型として固定する。ここを外から変えられない） */
const BEATS = { グー: "チョキ", チョキ: "パー", パー: "グー" };
function judgeRound(a, b) {
  if (a === b) return "あいこ";
  return BEATS[a] === b ? "勝ち" : "負け";
}

/** 0.55 未満は「分からない」＝人（あるいは別の判定）に投げる */
const HUMAN_THRESHOLD = 0.55;

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
const unit = (s) => hash(s) / 4294967295;

class JankenJev {
  /**
   * @param {object} [opt]
   * @param {number} [opt.seed]  固定すると同じ手順になる（検査できる）
   * @param {number} [opt.window] 何手前まで見るか（癖の検出）
   */
  constructor(opt = {}) {
    this.seed = opt.seed ?? 0;
    this.window = opt.window ?? 6;
    /** 相手の履歴（新しい方が後ろ） */
    this.history = [];
    /** 直近の判定を残す（UI で「なぜ」を出す） */
    this.last = null;
  }

  /** --- 判定の 3 形 ------------------------------------------------- */

  /** どれか。options の外は構造的に返せない */
  choose(ask, options) {
    if (!options || !options.length) throw new Error("options が空。どれかを選べない");
    const pick = options[hash(`${this.seed}:${ask}`) % options.length];
    return { kind: "choice", options: [...options], pick, confidence: 0.5 + 0.5 * unit(`${ask}:${pick}`) };
  }

  /** どの程度か */
  score(ask, target) {
    return { kind: "score", target, score: unit(`${this.seed}:${ask}:${target}`), confidence: 0.5 + 0.5 * unit(`c:${ask}:${target}`) };
  }

  /** 求めているか（Yes / No） */
  ask(ask, question) {
    const v = unit(`${this.seed}:${ask}:${question}`);
    return { kind: "noul", ask, question, answer: v >= 0.5, confidence: Math.abs(v - 0.5) * 2 };
  }

  /** --- 相手の癖（これが「判定」の材料） ---------------------------- */

  /** 直近 window 手の頻度。少なければ一様に近い */
  tendency() {
    const recent = this.history.slice(-this.window);
    const counts = { グー: 0, チョキ: 0, パー: 0 };
    for (const h of recent) if (h in counts) counts[h]++;
    const n = Math.max(1, recent.length);
    return Object.fromEntries(HANDS.map((h) => [h, counts[h] / n]));
  }

  /** 相手が h を出したあと、何を出しやすいか（1 次マルコフ） */
  followUp(prev) {
    const after = this.history.filter((h, i) => i > 0 && this.history[i - 1] === prev);
    return after.length >= 2 ? after[after.length - 1] : null;
  }

  /** 相手の履歴を 1 つ足す（判定の材料が増える） */
  observe(hand) {
    if (HANDS.includes(hand)) this.history.push(hand);
    if (this.history.length > 64) this.history.shift();
  }

  /** --- 手を選ぶ（判定の合成） ------------------------------------- */

  /**
   * 相手の癖から「勝てる手」を判定して返す。
   * @param {string} [playerHand] 直前のプレイヤーの手（あれば使う）
   * @returns {{hand:string, predicted:string, reason:string, scores:object, confidence:number, needsHuman:boolean}}
   */
  play(playerHand) {
    const t = this.tendency();
    const predictedByTendency = Object.entries(t).sort((a, b) => b[1] - a[1])[0][0];
    const predictedByFollow = playerHand ? this.followUp(playerHand) : null;

    // Noul: 「この予測を信じてよいか」
    const enough = this.history.length >= 3;
    const guess = this.ask(`${this.history.length} 手`, "癖が十分か");
    const predicted = predictedByFollow && enough ? predictedByFollow : predictedByTendency;

    // Score: 3 つの手それぞれの推し度（相手が predicted を出す前提で勝てる手を高く）
    const scores = Object.fromEntries(
      HANDS.map((h) => [h, Number((0.5 + 0.5 * unit(`${this.seed}:${h}:${predicted}:${this.history.length}`)).toFixed(3))]),
    );
    const winHand = Object.entries(BEATS).find(([, losesTo]) => losesTo === predicted)[0];

    // Choice: 勝てる手 / 迷ったら引く手（あいこ狙い）
    const choice = guess.answer
      ? this.choose(`相手は ${predicted} を出しそう`, [winHand, predicted])
      : this.choose("癖が分からない", HANDS);

    const confidence = Number(((guess.confidence + choice.confidence) / 2).toFixed(3));
    this.last = {
      hand: choice.pick,
      predicted,
      reason: predictedByFollow && enough ? `「${playerHand}」の次は「${predicted}」が出やすい` : `「${predicted}」が多い`,
      scores,
      confidence,
      needsHuman: confidence < HUMAN_THRESHOLD,
    };
    return this.last;
  }
}

/** 古典スクリプト（file:// の index.html）と ESM（janken.jev.mjs）の両方から使えるように置く */
if (typeof globalThis !== "undefined") {
  globalThis.JankenJev = JankenJev;
  globalThis.JANKEN_HANDS = HANDS;
  globalThis.JANKEN_BEATS = BEATS;
  globalThis.JANKEN_JUDGE = judgeRound;
  globalThis.JANKEN_HUMAN_THRESHOLD = HUMAN_THRESHOLD;
}
