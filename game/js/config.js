// Night Mail's tuning: the stage size, the paper plane's physics, the shape of a night and how
// each new night gets harder. Everything the other modules need to agree on lives here.

/** The logical stage every module draws and simulates in; the canvas is exactly this size. */
export const VIEW = { width: 1280, height: 720 };

/** The fixed simulation step: the world advances in sixtieths of a second, never in frame time. */
export const STEP = 1 / 60;

/** The plane never moves sideways on screen; the city scrolls past it at this x. */
export const PLANE_X = 300;

/** The plane's collision circle and the reach that counts as slipping a letter through a window. */
export const PLANE_RADIUS = 13;
export const DELIVERY_REACH = 38;

/**
 * How far below a roofline the solid part of a building starts. The band above it — the top
 * floor, where the delivery windows are — is flown in front of, not into: skimming it is the
 * whole game, sinking below it is a crash.
 */
export const PORCH_DEPTH = 64;

/** Vertical physics, in pixels and seconds: a gentle sink, a strong hold-to-climb, a capped fall. */
export const GRAVITY = 430;
export const LIFT = 1250;
export const DIVE = 700;
export const MAX_RISE = -300;
export const MAX_FALL = 265;

/** The scroll speed of the first night and what each later night adds, in pixels a second. */
export const BASE_SPEED = 275;
export const SPEED_PER_NIGHT = 48;

/** A night lasts this long; the moon crossing the sky is its clock. */
export const NIGHT_SECONDS = 52;

/** Deliveries that complete a night: the quota grows by one each night. */
export function nightQuota(night) {
  return 3 + night;
}

/** Points: a delivery pays the base times the combo multiplier; the rest are flat bonuses. */
export const DELIVERY_BASE = 100;
export const COMBO_WINDOW = 6.5;
export const COMBO_MAX = 8;
export const NEAR_MISS_POINTS = 25;
export const NIGHT_BONUS = 250;

/** Wind gusts: how often they may come, how long they blow and how hard, by night. */
export const GUST_EVERY_MIN = 7;
export const GUST_EVERY_MAX = 13;
export const GUST_SECONDS = 2.6;
export function gustStrength(night) {
  return 240 + 60 * night;
}

/** The deep-night palette with warm gold windows, shared by every drawing routine. */
export const COLORS = {
  skyTop: '#070b26',
  skyMid: '#0d1440',
  skyLow: '#1b2358',
  farRoof: '#0a0e2a',
  buildingA: '#131a3d',
  buildingB: '#171f47',
  buildingC: '#101636',
  roofEdge: '#232c5e',
  windowDark: '#0b1030',
  windowLit: '#e8a83e',
  windowWarm: '#ffc95e',
  gold: '#ffcf6b',
  goldBright: '#ffe9a8',
  paper: '#f5f1e6',
  paperShade: '#c9c2ae',
  ink: '#e9ecff',
  inkDim: '#9aa3d6',
  danger: '#ff7a6b',
};
