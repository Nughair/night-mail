// Night Mail's campaign: six named routes flown in order — five city districts of rising
// quota, wind and rooftop density, then the Dawn Run, a storm flight against a hard sunrise
// timer. Between routes the player drafts one upgrade of three; every upgrade is a real
// change to the flight, listed in UPGRADES with the module that applies it. This file is
// data and layout only: the world simulates it, the renderer draws it, the shell routes
// the player's pick back into the world.

/**
 * The routes, in the order they are flown. `speed` is added to the base scroll speed,
 * `wind` multiplies gust strength and (past 1) gust frequency, `density` scales how tight
 * the skyline is packed, and `seconds` is the moon's budget before dawn ends the run.
 * The last route is the finale: clear its quota before its short timer and the campaign
 * is won; let the timer die and the run ends like any dawn.
 */
export const ROUTES = [
  { name: 'Harbour Row', quota: 4, seconds: 56, speed: 0, wind: 0.7, density: 0.88, blurb: 'Calm air over the sleeping docks' },
  { name: 'Old Town', quota: 5, seconds: 54, speed: 26, wind: 1.0, density: 1.0, blurb: 'Chimneys and close rooftops' },
  { name: 'Mill District', quota: 6, seconds: 54, speed: 50, wind: 1.15, density: 1.1, blurb: 'Tall stacks, restless air' },
  { name: 'The Heights', quota: 7, seconds: 52, speed: 74, wind: 1.32, density: 1.2, blurb: 'High roofs and hard gusts' },
  { name: 'Storm Quarter', quota: 8, seconds: 52, speed: 98, wind: 1.45, density: 1.3, blurb: 'The storm gathers over the rooftops' },
  { name: 'Dawn Run', quota: 6, seconds: 42, speed: 124, wind: 1.8, density: 1.34, finale: true, blurb: 'Outrun the sunrise with the last letters' },
];

/** The route a run ends on: finishing it wins the campaign. */
export const FINAL_ROUTE = ROUTES.length - 1;

/**
 * The upgrade pool. After each route but the last, the draft offers three of the upgrades
 * the player does not own yet; the pick is permanent for the run. Each one changes the
 * flight in a way the player can feel:
 * - tailwind: climb power up, gusts shove less (world.js flight forces).
 * - widebag: the delivery reach grows, so windows count from farther away (world.js).
 * - longcombo: the combo window stretches from 6.5 to 10 seconds (world.js combo timer).
 * - sturdy: the first rooftop clip of each route is survived — a bounce, not a crash.
 * - lampoil: every route's moon budget grows by 10 seconds.
 * - goldpost: every delivery pays half again its points.
 */
export const UPGRADES = [
  { id: 'tailwind', name: 'Tailwind Charm', desc: 'Climb a fifth harder, and gusts shove a third less.' },
  { id: 'widebag', name: 'Bigger Mailbag', desc: 'A wider bag: a window counts as delivered from farther away.' },
  { id: 'longcombo', name: 'Patient Postmark', desc: 'Combos stay alive for 10 seconds instead of 6.5.' },
  { id: 'sturdy', name: 'Reinforced Wings', desc: 'Once per route, a rooftop clip bounces you off instead of ending the run.' },
  { id: 'lampoil', name: 'Lantern Oil', desc: 'The moon flies slower: every route lasts 10 seconds longer.' },
  { id: 'goldpost', name: 'Golden Postage', desc: 'Every delivery pays half again its points.' },
];

/** Look one upgrade up by id; the world and the renderer both read them from here. */
export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) ?? null;
}

/** The draft screen's three card rectangles on the 1280x720 stage, shared by the renderer
 *  (which draws them) and the shell (which hit-tests clicks against them). */
export const DRAFT_CARDS = [0, 1, 2].map((i) => ({ x: 106 + i * 364, y: 318, w: 340, h: 224 }));

/** Which draft card, if any, a stage point falls in: 0, 1, 2 or -1. */
export function draftCardAt(x, y) {
  for (let i = 0; i < DRAFT_CARDS.length; i += 1) {
    const c = DRAFT_CARDS[i];
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i;
  }
  return -1;
}
