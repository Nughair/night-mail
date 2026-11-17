// Night Mail's medals and campaign record: every route flown in the campaign is scored
// on its own — the points earned between its banner and its draft — and that score
// earns a medal: bronze for a clean crossing, silver for a fluent one, gold for a run
// of chained combos. The thresholds scale with the route's quota, so a long district
// asks proportionally more than a short one. The record this module keeps is the
// player's standing across visits: the best score and best medal per route, campaigns
// won, and whether the Night Owl has been unlocked. The world computes a run's medals
// from these rules; the shell owns the record and saves it; the renderer draws both.

/** The medal names in ascending order; a medal's index in this list is its rank. */
export const MEDALS = ['bronze', 'silver', 'gold'];

/** The draw colour of each medal, shared by the campaign and results screens. */
export const MEDAL_COLORS = { bronze: '#d08a4e', silver: '#cfd6ea', gold: '#ffcf6b' };

/**
 * The score a route asks for each medal. Par is per route, not per letter flat: a
 * short route cannot build the combos a long one can, and a late route starts with
 * a combo already warm from the one before, so the asking rate climbs down the
 * campaign. The medals sit at a half, three quarters and the whole of par. Tuned
 * against the autopilot's crossings (shots.js): a careful pilot golds the routes it
 * flies cleanly, silvers the scrappy ones, and a poor crossing earns nothing.
 */
const PAR_PER_LETTER_BY_ROUTE = [300, 380, 430, 460, 480, 520, 580, 620, 640, 660, 700, 620];
const MEDAL_FRACTIONS = { bronze: 0.5, silver: 0.75, gold: 1.0 };

/** The medal a route score earns on a route, or null when it earns none. */
export function medalForRoute(routeScore, route, routeIndex) {
  const rate = PAR_PER_LETTER_BY_ROUTE[routeIndex] ?? 400;
  const par = route.quota * rate;
  if (routeScore >= par * MEDAL_FRACTIONS.gold) return 'gold';
  if (routeScore >= par * MEDAL_FRACTIONS.silver) return 'silver';
  if (routeScore >= par * MEDAL_FRACTIONS.bronze) return 'bronze';
  return null;
}

/** A fresh campaign record: no route flown, no campaign won, the Owl still locked. */
export function createCampaignRecord(routeCount) {
  return {
    routes: Array.from({ length: routeCount }, () => ({ best: 0, medal: null })),
    wins: 0,
    owlUnlocked: false,
  };
}

/**
 * Fold one finished route into the record: keep the better score and the better
 * medal of the two. Returns the medal the score earned (the record keeps the best).
 */
export function recordRouteResult(record, routeIndex, routeScore, route) {
  const medal = medalForRoute(routeScore, route, routeIndex);
  const slot = record.routes[routeIndex];
  if (slot) {
    if (routeScore > slot.best) slot.best = routeScore;
    if (medal && (!slot.medal || MEDALS.indexOf(medal) > MEDALS.indexOf(slot.medal))) slot.medal = medal;
  }
  return medal;
}

/** Count medals in a list of { medal } entries: { gold, silver, bronze } tallies. */
export function medalCounts(entries) {
  const counts = { gold: 0, silver: 0, bronze: 0 };
  for (const entry of entries) {
    if (entry && entry.medal) counts[entry.medal] += 1;
  }
  return counts;
}
