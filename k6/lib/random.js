/** Inclusive random integer in [min, max]. Replaces deprecated k6/utils (removed in k6 v2). */
export function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
