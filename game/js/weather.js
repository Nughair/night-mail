// Night Mail's weather: fronts that drift across a route and change the flying while
// the plane is inside them. A fog bank (the Canal District) hides the city — lit windows
// and the target's glow fade with the fog's thickness, and nothing else changes: the
// lane is flown by memory and by the rooftops' silhouettes. A rain band (the Storm
// Quarter) is a wall of weather with a push in it: crossing one shoves the plane up or
// down for as long as it lasts, the way a gust does but tied to a place, not a moment.
// Fronts are places in the world, not screen effects: they spawn ahead of the camera,
// drift slowly against the scroll, and are gone once the city has passed them. The
// world steps this system and reads its two questions — how thick is the fog here, how
// hard does the rain push here — and the renderer draws what it finds.

import { VIEW } from './config.js';

/** How hard a rain band pushes at its core, in px/s^2, before the route's own scaling. */
const RAIN_PUSH = 300;
/** A fog bank's peak thickness: at 1 the target's glow is nearly gone (see render.js). */
const FOG_PEAK = 0.9;

export function createWeather(rng) {
  /** The live fronts: { kind, x, w, dir, seed } — x/w in world coordinates. */
  const fronts = [];
  let kind = null; // the current route's weather: 'fog' | 'rain' | null
  let nextSpawnX = 0;

  function makeFront(x) {
    if (kind === 'fog') {
      return { kind, x, w: rng.range(520, 860), dir: 0, drift: rng.range(14, 30), seed: rng.range(0, 100) };
    }
    return { kind, x, w: rng.range(360, 560), dir: rng.chance(0.5) ? 1 : -1, drift: rng.range(-22, -8), seed: rng.range(0, 100) };
  }

  /**
   * Begin a route's weather: clear the sky, then seed two fronts ahead of the camera
   * so the district's character is met early, with more following on a loose schedule.
   */
  function beginRoute(route, cameraX) {
    fronts.length = 0;
    kind = route.weather ?? null;
    if (!kind) return;
    fronts.push(makeFront(cameraX + VIEW.width * 0.55));
    fronts.push(makeFront(cameraX + VIEW.width * 1.7));
    nextSpawnX = cameraX + VIEW.width * 2.6;
  }

  /** Advance every front and keep the sky ahead stocked while the route has weather. */
  function update(dt, cameraX) {
    if (!kind) return;
    for (const front of fronts) front.x += front.drift * dt;
    while (fronts.length > 0 && fronts[0].x + fronts[0].w < cameraX - 260) fronts.shift();
    if (cameraX + VIEW.width + 700 > nextSpawnX) {
      fronts.push(makeFront(nextSpawnX + rng.range(0, 320)));
      nextSpawnX += rng.range(1150, 1750);
    }
  }

  /** One front's coverage of a world x: 0 outside, rising to 1 at its core. */
  function coverage(front, worldX) {
    if (worldX < front.x || worldX > front.x + front.w) return 0;
    const frac = (worldX - front.x) / front.w;
    return Math.sin(Math.PI * frac) ** 1.4;
  }

  /** How thick the fog is at a world x, 0..FOG_PEAK: the renderer's dimming factor. */
  function fogAt(worldX) {
    let total = 0;
    for (const front of fronts) {
      if (front.kind === 'fog') total = Math.max(total, coverage(front, worldX));
    }
    return total * FOG_PEAK;
  }

  /** The rain's vertical push at a world x, in px/s^2 (signed; 0 outside every band). */
  function pushAt(worldX) {
    let push = 0;
    for (const front of fronts) {
      if (front.kind === 'rain') push += front.dir * RAIN_PUSH * coverage(front, worldX);
    }
    return push;
  }

  return { fronts, beginRoute, update, fogAt, pushAt };
}
