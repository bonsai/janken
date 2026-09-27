const EN2JA = {
  rock: "グー",
  scissors: "チョキ",
  paper: "パー",
  win: "勝ち",
  lose: "負け",
  draw: "あいこ",
  profile_reward: "プロフィール報酬",
  rounds: "回",
  remaining: "残り",
  balance: "残高",
  start: "ゲーム開始",
  continue: "もう10回遊ぶ",
  profile: "プロフィール",
  age_group: "年齢",
  gender: "性別",
  region: "地域",
  handedness: "利き手",
  occupation: "職業",
  experience: "経験"
};

function en2ja(value) {
  return EN2JA[value] ?? value;
}

if (typeof globalThis !== "undefined") {
  globalThis.EN2JA = EN2JA;
  globalThis.en2ja = en2ja;
}
