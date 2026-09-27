/**
 * janken.jev.mjs — Node / バンドラから使う入口（ESM）。
 * 本体は janken.jev.js（古典スクリプト。file:// の index.html から読めるようにしてある）。
 */
import "./janken.jev.js";
export const JankenJev = globalThis.JankenJev;
export const HANDS = globalThis.JANKEN_HANDS;
export const BEATS = globalThis.JANKEN_BEATS;
export const judgeRound = globalThis.JANKEN_JUDGE;
export const HUMAN_THRESHOLD = globalThis.JANKEN_HUMAN_THRESHOLD;
export default globalThis.JankenJev;
