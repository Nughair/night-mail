// Night Mail's special deliveries: from the second route on, some letters are more than
// letters, and the target window wears the difference where the player can see it.
//
// - EXPRESS: a letter against the clock. It pays double, but only while its timer
//   lasts; let the timer die and the letter is withdrawn — the window goes dark, the
//   combo breaks, and another address takes its place. The timer starts when the
//   window is chosen, so the dash is always the same length: across the rooftops to a
//   window already in sight.
// - FRAGILE: a letter that cannot survive a knock. Fly it clean and it pays like any
//   other; clip a rooftop on the way — even the clip Reinforced Wings would forgive —
//   and the letter breaks: no score, no quota, the combo gone. A crash ends the run
//   either way, fragile or not.
//
// This module owns the policy — which targets turn special, the express clock, the
// scoring factors — and nothing else: the world asks it, applies the answers, and the
// renderer reads the same constants to badge the window and the HUD.

/** The express clock, in seconds, from the moment its window is chosen. */
export const EXPRESS_SECONDS = 9;
/** What an on-time express delivery pays, as a multiple of the letter's points. */
export const EXPRESS_FACTOR = 2;
/** The first route index that carries special deliveries (Old Town onwards). */
export const SPECIALS_FROM_ROUTE = 1;

const EXPRESS_CHANCE = 0.22;
const FRAGILE_CHANCE = 0.18;

/**
 * Decide whether the target the world is about to offer is special, and how. The
 * first letter of a run and the whole of Harbour Row stay plain, so a new player meets
 * the specials once the flying itself is familiar. Returns a fresh
 * { kind: 'express'|'fragile', t } or null for an ordinary letter; `t` is the express
 * clock, unused for fragile.
 */
export function assignSpecial(rng, routeIndex, lettersDelivered) {
  if (routeIndex < SPECIALS_FROM_ROUTE || lettersDelivered === 0) return null;
  const roll = rng.next();
  if (roll < EXPRESS_CHANCE) return { kind: 'express', t: EXPRESS_SECONDS };
  if (roll < EXPRESS_CHANCE + FRAGILE_CHANCE) return { kind: 'fragile', t: 0 };
  return null;
}

/** The points multiplier a delivered letter earns for its kind (1 for plain/fragile). */
export function specialFactor(special) {
  return special && special.kind === 'express' ? EXPRESS_FACTOR : 1;
}

/** The HUD's name for a special kind, with its rule in the same breath. */
export const SPECIAL_LABELS = {
  express: 'EXPRESS — double points while the clock lasts',
  fragile: 'FRAGILE — one rooftop clip voids this letter',
};
