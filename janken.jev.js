const HANDS = ["グー", "チョキ", "パー"];
const BEATS = { グー: "チョキ", チョキ: "パー", パー: "グー" };
const HUMAN_THRESHOLD = 0.55;

function judgeRound(a, b) {
  if (a === b) return "あいこ";
  return BEATS[a] === b ? "勝ち" : "負け";
}

class JankenJev {
  constructor(opt = {}) {
    this.window = opt.window ?? 6;
    this.history = [];
    this.last = null;
  }

  tendency() {
    const recent = this.history.slice(-this.window);
    const c = { グー: 0, チョキ: 0, パー: 0 };
    for (const h of recent) if (HANDS.includes(h)) c[h]++;
    const n = Math.max(1, recent.length);
    return Object.fromEntries(HANDS.map((h) => [h, c[h] / n]));
  }

  followDistribution(prev) {
    const c = { グー: 1, チョキ: 1, パー: 1 };
    let n = 0;
    for (let i = 1; i < this.history.length; i++) {
      if (this.history[i - 1] === prev) {
        c[this.history[i]]++;
        n++;
      }
    }
    if (!n) return null;
    const total = c.グー + c.チョキ + c.パー;
    return Object.fromEntries(HANDS.map((h) => [h, c[h] / total]));
  }

  predict() {
    const freq = this.tendency();
    const last = this.history[this.history.length - 1];
    const follow = last ? this.followDistribution(last) : null;
    const n = this.history.length;
    const w = follow && n >= 4 ? Math.min(0.6, n / 10) : 0;
    const scores = Object.fromEntries(HANDS.map((h) => [
      h, Number(((1 - w) * freq[h] + w * (follow ? follow[h] : freq[h])).toFixed(3))
    ]));
    const predicted = HANDS.slice().sort((a, b) => scores[b] - scores[a])[0];
    const peak = scores[predicted];
    const confidence = Number((Math.min(1, n / 8) * Math.max(0, (peak - 1 / 3) / (2 / 3))).toFixed(3));
    return {
      predicted,
      scores,
      confidence,
      needsHuman: confidence < HUMAN_THRESHOLD,
      reason: follow && n >= 4 ? "直近の手から次の傾向を推定" : "直近の頻度から推定",
    };
  }

  play() {
    const d = this.predict();
    const winHand = Object.entries(BEATS).find(([, losesTo]) => losesTo === d.predicted)[0];
    const hand = d.needsHuman ? d.predicted : winHand;
    this.last = {
      hand,
      predicted: d.predicted,
      reason: d.reason,
      scores: d.scores,
      confidence: d.confidence,
      needsHuman: d.needsHuman,
      kind: "choice",
      options: HANDS.slice(),
    };
    return this.last;
  }

  observe(hand) {
    if (HANDS.includes(hand)) this.history.push(hand);
    if (this.history.length > 64) this.history.shift();
  }
}

globalThis.JankenJev = JankenJev;
globalThis.JANKEN_HANDS = HANDS;
globalThis.JANKEN_BEATS = BEATS;
globalThis.JANKEN_JUDGE = judgeRound;
globalThis.JANKEN_HUMAN_THRESHOLD = HUMAN_THRESHOLD;