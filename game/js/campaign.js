// Night Mail's campaign: twelve named routes flown in order — eleven districts of
// rising quota, wind and rooftop density, then the Storm Warden, a boss who keeps the
// last window moving while his gusts grow with every letter delivered. Four districts
// carry weather fronts (weather.js): fog banks drift the Canal District's lane, rain
// bands shove across the Storm Quarter, the Lighthouse Coast's rotating beam presses
// on anything it catches, and warm thermals rise over the Market District's stalls.
// The Rooftop Gardens loose their doves at the plane, and the Narrows fly under a low
// cloud deck that forbids climbing out. Between routes the player drafts one upgrade
// of three; every upgrade is a real change to the flight, listed in UPGRADES with the
// module that applies it. Win the campaign and the endless Night Owl mode opens on
// the title screen. This file is data and layout only: the world simulates it, the
// renderer draws it, the shell routes the player's pick back into the world.

/**
 * The routes, in the order they are flown. `speed` is added to the base scroll speed,
 * `wind` multiplies gust strength and (past 1) gust frequency, `density` scales how
 * tight the skyline is packed, and `seconds` is the moon's budget before dawn ends the
 * run. `weather` names the front system a district carries ('fog', 'rain', 'beam' or
 * 'thermal', see weather.js), `festival` marks the one night of fireworks, `mechanic`
 * names a district's own hazard ('doves'), and `ceiling` caps how high the plane may
 * climb, in stage pixels from the top. The last route is the boss: `boss` marks the
 * Storm Warden, whose window moves and whose gusts escalate (world.js flies him).
 */
export const ROUTES = [
  { name: 'Harbour Row', quota: 4, seconds: 56, speed: 0, wind: 0.7, density: 0.88, blurb: 'Calm air over the sleeping docks' },
  { name: 'Old Town', quota: 5, seconds: 54, speed: 26, wind: 1.0, density: 1.0, blurb: 'Chimneys and close rooftops' },
  { name: 'Canal District', quota: 5, seconds: 54, speed: 38, wind: 0.85, density: 1.02, weather: 'fog', blurb: 'Fog banks drift the delivery lane' },
  { name: 'Mill District', quota: 6, seconds: 54, speed: 50, wind: 1.15, density: 1.1, blurb: 'Tall stacks, restless air' },
  { name: 'Festival Quarter', quota: 7, seconds: 54, speed: 62, wind: 1.1, density: 1.14, festival: true, blurb: 'Fireworks over the fair, letters below' },
  { name: 'The Heights', quota: 7, seconds: 52, speed: 80, wind: 1.32, density: 1.2, blurb: 'High roofs and hard gusts' },
  { name: 'Storm Quarter', quota: 8, seconds: 52, speed: 98, wind: 1.45, density: 1.3, weather: 'rain', blurb: 'Rain bands sweep the rooftops' },
  { name: 'Lighthouse Coast', quota: 7, seconds: 54, speed: 108, wind: 1.2, density: 1.24, weather: 'beam', blurb: 'The great beam sweeps the coast road' },
  { name: 'Market District', quota: 8, seconds: 54, speed: 118, wind: 1.25, density: 1.36, weather: 'thermal', blurb: 'Warm air rises over the market stalls' },
  { name: 'Rooftop Gardens', quota: 8, seconds: 52, speed: 128, wind: 1.35, density: 1.3, mechanic: 'doves', blurb: 'Gardens on the roofs — and doves in the lane' },
  { name: 'The Narrows', quota: 8, seconds: 52, speed: 138, wind: 1.4, density: 1.42, ceiling: 168, blurb: 'A low cloud deck over a tight street' },
  { name: 'The Storm Warden', quota: 7, seconds: 48, speed: 150, wind: 1.6, density: 1.27, weather: 'rain', finale: true, boss: true, blurb: 'His window moves, his gusts grow, dawn is coming' },
];

/** The route a campaign run ends on: finishing it wins the campaign. */
export const FINAL_ROUTE = ROUTES.length - 1;

/**
 * The Night Owl: the endless mode the title screen offers once the campaign is won.
 * The same twelve districts cycle without end — quota and pace creeping up each loop —
 * with the draft after every route, until a rooftop or a dawn ends the flight. There
 * is no winning it; the score and the night count are the whole point.
 */
export const NIGHT_OWL = {
  name: 'Night Owl',
  blurb: 'The endless night — every district again, faster, until dawn or a rooftop',
  quotaPerLoop: 1,
  speedPerLoop: 8,
};

/** The one-line hazard warning a route's intro banner carries, or '' in plain air. */
export function routeWeatherNote(route) {
  if (route.weather === 'fog') return 'Fog banks ahead — a window only glows when you are close.';
  if (route.weather === 'rain' && !route.boss) return 'Rain bands ahead — each one shoves the plane as you cross.';
  if (route.weather === 'beam') return 'The beam presses down on whatever it catches — cross between its sweeps.';
  if (route.weather === 'thermal') return 'Thermals ahead — warm columns that lift the plane over the stalls.';
  if (route.mechanic === 'doves') return 'Doves ahead — a flock in the lane scatters the plane and breaks the combo.';
  if (route.ceiling) return 'A low cloud deck — there is no climbing out; thread the porch lanes.';
  if (route.boss) return 'The Warden’s window moves, and every letter you land makes his gusts stronger.';
  if (route.festival) return 'Fireworks tonight — keep your eyes on the gold windows.';
  return '';
}

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

/**
 * The campaign map's route rows: twelve routes in two columns of six on the 1280x720
 * stage. The renderer draws each route into its rectangle and the shell hit-tests
 * clicks against the same rectangles, so what is drawn is exactly what can be picked.
 */
export function campaignRowRect(index) {
  const col = index < 6 ? 0 : 1;
  const row = index % 6;
  return { x: 64 + col * 600, y: 196 + row * 62, w: 552, h: 56 };
}

/** Which route row, if any, a stage point falls in: a route index or -1. */
export function campaignRowAt(x, y) {
  for (let i = 0; i < ROUTES.length; i += 1) {
    const r = campaignRowRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
