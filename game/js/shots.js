// The screenshot scenes behind ?shot=title|play|late|over (with &seed=N). Each scene builds a
// real world from the seed and plays it forward with a simple autopilot — steer at the target
// window, stay clear of the rooftops — so the frame is what an actual short game looks like,
// and the same seed always produces the same frame. Nothing here draws anything itself.

import {
  DIVE, GRAVITY, LIFT, MAX_FALL, MAX_RISE, PLANE_X, STEP, gustStrength, nightQuota,
} from './config.js';
import { createRandom } from './random.js';
import { createWorld, EV_DELIVER, EV_OVER } from './world.js';

/**
 * The autopilot's control for one step: aim at the target window, but never plan to sink
 * below the porch line of a nearer building that is not the target's — cross it high, then
 * dip to the window once it is the building in front of the plane.
 */
/**
 * The altitude the pilot aims for: the target window's height, held back by the rooftops in
 * between — cross each intervening building either above its rooftop clutter (when the
 * window is high) or through its porch lane (when the window is low), and never plan to sink
 * past a porch floor.
 */
function planWant(state, city) {
  const planeX = state.cameraX + PLANE_X;
  let want = 235;
  const target = state.target;
  const buildings = city.buildings;
  if (target) {
    want = target.y;
    for (const b of buildings) {
      if (b === target.building) break;
      if (b.x + b.w <= planeX - 10) continue;
      want = Math.min(want, ceilingOver(b, planeX, target.y));
    }
  } else {
    let seen = 0;
    for (const b of buildings) {
      if (b.x + b.w <= planeX - 10) continue;
      want = Math.min(want, ceilingOver(b, planeX, null));
      seen += 1;
      if (seen >= 2) break;
    }
  }
  return Math.max(64, want);
}

/** The lowest y at which the pilot may cross one building, given where the window is. */
function ceilingOver(building, planeX, targetY) {
  let ceiling = building.topY + 48;
  const structure = building.chimney || building.tower;
  if (!structure) return ceiling;
  const structureRight = building.x + structure.dx + structure.w;
  if (structureRight <= planeX - 10) return ceiling; // the clutter is already behind the plane
  if (targetY !== null && targetY > building.topY + 20) return ceiling; // pass under it, in the porch lane
  return Math.min(ceiling, building.topY - structure.h - 16); // stay above it
}

/** One proportional steering decision toward the planned altitude, shifted by wantBias. */
function pdControl(state, city, wantBias) {
  const want = planWant(state, city) + wantBias;
  const y = state.plane.y;
  const vy = state.plane.vy;
  const predicted = y + vy * 0.5;
  return {
    climb: predicted > want + 2 || y > want + 8,
    dive: (predicted < want - 14 && y < want - 8) || y < want - 64,
  };
}

/**
 * Replay the pilot's own steering (with an altitude bias) over a copy of the flight for the
 * next `steps` steps; true when that replay ends in a rooftop. Because the replay steers the
 * same way the pilot does, a dive that the pilot would pull out of in time is not vetoed —
 * only a dive it would ride into the buildings is.
 */
function policyHits(world, wantBias, steps) {
  const s = world.state;
  const sim = {
    cameraX: s.cameraX,
    speed: s.speed,
    night: s.night,
    plane: { y: s.plane.y, vy: s.plane.vy },
    gust: s.gust,
    target: s.target,
  };
  for (let i = 0; i < steps; i += 1) {
    const control = pdControl(sim, world.city, wantBias);
    sim.cameraX += sim.speed * STEP;
    sim.plane.vy += GRAVITY * STEP;
    if (control.climb) sim.plane.vy -= LIFT * STEP;
    if (control.dive) sim.plane.vy += DIVE * STEP;
    if (sim.gust.active) sim.plane.vy += sim.gust.dir * gustStrength(sim.night) * STEP;
    sim.plane.vy = Math.max(MAX_RISE, Math.min(MAX_FALL, sim.plane.vy));
    sim.plane.y += sim.plane.vy * STEP;
    if (sim.plane.y < 30) {
      sim.plane.y = 30;
      sim.plane.vy = Math.max(sim.plane.vy, 0);
    }
    const planeX = sim.cameraX + PLANE_X;
    for (const building of world.city.buildings) {
      if (building.x + building.w < planeX - 20 || building.x > planeX + 20) continue;
      for (const rect of world.city.solidRects(building)) {
        const nx = Math.max(rect.x, Math.min(planeX, rect.x + rect.w));
        const ny = Math.max(rect.y, Math.min(sim.plane.y, rect.y + rect.h));
        if ((planeX - nx) ** 2 + (sim.plane.y - ny) ** 2 < 11 * 11) return true;
      }
    }
  }
  return false;
}

/**
 * The autopilot: fly the plan; when the plan's own replay says it ends in a rooftop, fly the
 * same plan biased high (climb away) or, failing that, biased low (duck through a porch).
 */
export function autopilotControl(world) {
  if (!policyHits(world, 0, 48)) return pdControl(world.state, world.city, 0);
  if (!policyHits(world, -130, 48)) return pdControl(world.state, world.city, -130);
  if (!policyHits(world, 130, 48)) return pdControl(world.state, world.city, 130);
  return pdControl(world.state, world.city, -130);
}

/** Step the world under a control function until stopWhen says stop or the budget runs out. */
function playForward(world, controlFor, stopWhen, maxSeconds) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, controlFor(world));
    if (stopWhen && stopWhen(world, events)) return true;
  }
  return false;
}

function stageTitle(seed) {
  const world = createWorld(createRandom(seed));
  playForward(world, () => ({ climb: false, dive: false }), null, 4.5);
  return { world, screen: 'title', best: 0, isNewBest: false };
}

function stagePlay(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  let sinceDelivery = Infinity;
  playForward(
    world,
    autopilotControl,
    (w, events) => {
      if (events & EV_DELIVER) sinceDelivery = 0;
      else sinceDelivery += STEP;
      return w.state.letters >= 2 && sinceDelivery > 0.14 && sinceDelivery < 0.6;
    },
    45,
  );
  return { world, screen: 'play', best: 0, isNewBest: false };
}

function stageLate(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  // A run already two nights deep: the score and letters are staged, the flying is real.
  const state = world.state;
  state.night = 3;
  state.quota = nightQuota(3);
  state.nightDelivered = 2;
  state.letters = 11;
  state.score = 1875;
  state.bestCombo = 4;
  state.nightTime = 27;
  playForward(
    world,
    autopilotControl,
    (w) => w.state.gust.active && w.state.target && w.state.target.x - w.state.cameraX > 420,
    24,
  );
  return { world, screen: 'play', best: 0, isNewBest: false };
}

function stageOver(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  // Fly well for a while, then tire: hold a dive until a rooftop settles it.
  playForward(world, autopilotControl, (w) => w.state.letters >= 3, 40);
  playForward(world, () => ({ climb: false, dive: true }), (w, events) => (events & EV_OVER) !== 0, 20);
  // Let the moment settle, as it does for a player reading the results: the crash flash
  // fades, the last score texts drift away, the wreck's paper settles.
  playForward(world, () => ({ climb: false, dive: false }), null, 1.6);
  const score = world.state.score;
  return { world, screen: 'over', best: score, isNewBest: score > 0 };
}

/** Stage the named scene ('title' unless it is play, late or over) and return what to draw. */
export function stageShot(name, seed) {
  if (name === 'play') return stagePlay(seed);
  if (name === 'late') return stageLate(seed);
  if (name === 'over') return stageOver(seed);
  return stageTitle(seed);
}
