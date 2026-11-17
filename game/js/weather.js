// Night Mail's weather: fronts that drift across a route and change the flying while
// the plane is inside them. A fog bank (the Canal District) hides the city — lit windows
// and the target's glow fade with the fog's thickness, and nothing else changes: the
// lane is flown by memory and by the rooftops' silhouettes. A rain band (the Storm
// Quarter, and the Warden's night) is a wall of weather with a push in it: crossing
// one shoves the plane up or down for as long as it lasts, the way a gust does but tied
// to a place, not a moment. A thermal (the Market District) is a column of warm air
// over the stalls that only ever lifts, narrow enough to ride on purpose. And the
// Lighthouse Coast's beam is a rotating wedge of light from a tower on the shore: the
// plane caught in it is pressed down toward the roofs, so the coast is crossed in the
// dark between sweeps. Fronts are places in the world, not screen effects: they spawn
// ahead of the camera, drift slowly against the scroll, and are gone once the city has
// passed them. The world steps this system and reads its three questions — how thick
// is the fog here, how hard does the air push here, where does the beam point — and
// the renderer draws what it finds.

import { VIEW } from './config.js';

/** How hard a rain band pushes at its core, in px/s^2, before the route's own scaling. */
const RAIN_PUSH = 300;
/** How hard a thermal lifts at its core, in px/s^2: stronger than rain, always up. */
const THERMAL_PUSH = 430;
/** How hard the beam presses down on a plane it catches, in px/s^2. */
const BEAM_PUSH = 330;
/** A fog bank's peak thickness: at 1 the target's glow is nearly gone (see render.js). */
const FOG_PEAK = 0.9;
/** The beam's sweep: one full turn of the light, in seconds, and its half-width in radians. */
const BEAM_PERIOD = 6.8;
const BEAM_HALF_ANGLE = 0.30;
/** The height of the lighthouse lamp above the stage floor line it stands on. */
const BEAM_ORIGIN_Y = 318;

export function createWeather(rng) {
  /** The live fronts: { kind, x, w, dir, push, drift, seed, lx } — x/w in world coordinates. */
  const fronts = [];
  let kind = null; // the current route's weather: 'fog' | 'rain' | 'thermal' | 'beam' | null
  let nextSpawnX = 0;

  function makeFront(x) {
    if (kind === 'fog') {
      return { kind, x, w: rng.range(520, 860), dir: 0, push: 0, drift: rng.range(14, 30), seed: rng.range(0, 100), lx: 0 };
    }
    if (kind === 'thermal') {
      // A thermal is a narrow column: something to aim for, not a wall to endure.
      return { kind, x, w: rng.range(210, 330), dir: -1, push: THERMAL_PUSH, drift: rng.range(-6, 6), seed: rng.range(0, 100), lx: 0 };
    }
    if (kind === 'beam') {
      // A beam front is a stretch of coast with one lighthouse standing in it; the
      // tower never drifts, and the light turns on its own clock from its seed.
      const w = rng.range(1700, 2200);
      return { kind, x, w, dir: 0, push: BEAM_PUSH, drift: 0, seed: rng.range(0, Math.PI * 2), lx: x + w * rng.range(0.38, 0.62) };
    }
    return { kind, x, w: rng.range(360, 560), dir: rng.chance(0.5) ? 1 : -1, push: RAIN_PUSH, drift: rng.range(-22, -8), seed: rng.range(0, 100), lx: 0 };
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
    nextSpawnX = cameraX + VIEW.width * (kind === 'beam' ? 3.4 : 2.6);
  }

  /** Advance every front and keep the sky ahead stocked while the route has weather. */
  function update(dt, cameraX) {
    if (!kind) return;
    for (const front of fronts) front.x += front.drift * dt;
    while (fronts.length > 0 && fronts[0].x + fronts[0].w < cameraX - 260) fronts.shift();
    if (cameraX + VIEW.width + 700 > nextSpawnX) {
      fronts.push(makeFront(nextSpawnX + rng.range(0, 320)));
      nextSpawnX += kind === 'beam' ? rng.range(1750, 2250) : kind === 'thermal' ? rng.range(620, 980) : rng.range(1150, 1750);
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

  /**
   * Where a beam front's light points at time t: its tower's world x, the lamp's
   * height, and the wedge's centre angle (the beam is double-ended, so the wedge
   * covers this angle and the one opposite it). The world reads the same numbers
   * to press on a caught plane that the renderer draws — one source of truth.
   */
  function beamInfo(front, t) {
    return { lx: front.lx, oy: BEAM_ORIGIN_Y, angle: front.seed + (t * Math.PI * 2) / BEAM_PERIOD };
  }

  /** Is the point (worldX, y) inside the beam's lit wedge at time t? */
  function beamCovers(front, worldX, y, t) {
    const { lx, oy, angle } = beamInfo(front, t);
    const dx = worldX - lx;
    const dy = y - oy;
    if (dx * dx + dy * dy < 60 * 60) return false; // the tower's own shadow: too close to catch
    const bearing = Math.atan2(dy, dx);
    let off = Math.abs(bearing - angle) % Math.PI; // double-ended: fold the far wedge onto this one
    if (off > Math.PI / 2) off = Math.PI - off;
    return off < BEAM_HALF_ANGLE;
  }

  /**
   * The air's vertical push at a point, in px/s^2 (signed; 0 in still air): rain
   * bands shove their own way, thermals only lift, and the beam presses down on
   * whatever its wedge covers at this moment.
   */
  function pushAt(worldX, y = 300, t = 0) {
    let push = 0;
    for (const front of fronts) {
      if (front.kind === 'rain' || front.kind === 'thermal') {
        push += front.dir * front.push * coverage(front, worldX);
      } else if (front.kind === 'beam' && beamCovers(front, worldX, y, t)) {
        push += front.push;
      }
    }
    return push;
  }

  return { fronts, beginRoute, update, fogAt, pushAt, beamInfo, beamCovers };
}
