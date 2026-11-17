// The sleeping city: an endless procedurally generated skyline. Each building gets a seeded
// grid of windows (about a third of them warm and lit), and some get a chimney or a water
// tower on the roof. The city also chooses which lit window is the next delivery target.

import { PORCH_DEPTH, VIEW } from './config.js';

const BODY_COLORS = ['#131a3d', '#171f47', '#101636'];
const WINDOW_STEP_X = 26;
const WINDOW_STEP_Y = 34;
const WINDOW_W = 13;
const WINDOW_H = 17;

export function createCity(rng) {
  const buildings = [];
  let nextX = -240;
  // How tightly the skyline is packed, set per campaign route: past 1 the gaps between
  // buildings shrink and the roofs creep up, so later districts crowd the plane's lane.
  let density = 1;

  function makeBuilding(x) {
    const w = rng.range(98, 178);
    const topY = rng.range(390, 586) - (density - 1) * 55;
    const cols = Math.max(2, Math.floor((w - 30) / WINDOW_STEP_X));
    const rows = Math.max(2, Math.floor((VIEW.height - topY - 44) / WINDOW_STEP_Y));
    const windows = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        windows.push({
          col,
          row,
          // The top row is lit more often: those are the windows letters are delivered to.
          lit: rng.chance(row === 0 ? 0.55 : 0.32),
          warm: rng.chance(0.78),
          flicker: rng.range(0, Math.PI * 2),
          target: false,
        });
      }
    }
    const chimney = rng.chance(0.55)
      ? { dx: rng.range(10, Math.max(12, w - 36)), w: rng.range(13, 19), h: rng.range(20, 46) }
      : null;
    const tower = !chimney && rng.chance(0.24)
      ? { dx: rng.range(16, Math.max(18, w - 56)), w: 34, h: rng.range(32, 52) }
      : null;
    return { x, w, topY, color: rng.pick(BODY_COLORS), windows, chimney, tower };
  }

  /** The rectangle of one window of a building, in world coordinates. */
  function windowRect(building, win) {
    return {
      x: building.x + 16 + win.col * WINDOW_STEP_X,
      y: building.topY + 16 + win.row * WINDOW_STEP_Y,
      w: WINDOW_W,
      h: WINDOW_H,
    };
  }

  /**
   * The solid rectangles of a building: its body below the top-floor porch band (see
   * PORCH_DEPTH) and whatever stands on its roof.
   */
  function solidRects(building) {
    const bodyTop = building.topY + PORCH_DEPTH;
    const rects = [{ x: building.x, y: bodyTop, w: building.w, h: VIEW.height - bodyTop }];
    if (building.chimney) {
      const c = building.chimney;
      rects.push({ x: building.x + c.dx, y: building.topY - c.h, w: c.w, h: c.h });
    }
    if (building.tower) {
      const t = building.tower;
      rects.push({ x: building.x + t.dx, y: building.topY - t.h, w: t.w, h: t.h });
    }
    return rects;
  }

  /** Grow the skyline until it covers the view ahead of cameraX; drop what is far behind. */
  function ensure(cameraX) {
    while (nextX < cameraX + VIEW.width + 480) {
      const building = makeBuilding(nextX);
      buildings.push(building);
      nextX += building.w + rng.range(14, 54) / density;
    }
    while (buildings.length > 0 && buildings[0].x + buildings[0].w < cameraX - 300) {
      buildings.shift();
    }
  }

  /**
   * Choose the next delivery target: a lit top-floor window on a building ahead of minWorldX,
   * picked from the first few candidates so deliveries come at a steady rhythm. Marks the
   * window as the target and returns its centre in world coordinates, or null when no window
   * qualifies yet.
   */
  function chooseTarget(minWorldX) {
    const candidates = [];
    for (const building of buildings) {
      if (building.x + building.w < minWorldX) continue;
      for (const win of building.windows) {
        if (!win.lit || win.row !== 0) continue;
        const rect = windowRect(building, win);
        if (rect.x < minWorldX) continue;
        candidates.push({ building, win, rect });
        if (candidates.length >= 5) break;
      }
      if (candidates.length >= 5) break;
    }
    if (candidates.length === 0) return null;
    const chosen = candidates[rng.int(0, candidates.length - 1)];
    chosen.win.target = true;
    clearApproach(chosen.building, chosen.rect);
    return {
      building: chosen.building,
      win: chosen.win,
      x: chosen.rect.x + chosen.rect.w / 2,
      y: chosen.rect.y + chosen.rect.h / 2,
    };
  }

  /**
   * The delivery lane: a plane dives at the target window across its own building's roof and
   * leaves at about the window's height, so a chimney or water tower standing between the
   * roof's left edge and a short stretch past that window would be an unfair wall. Move any
   * such structure to just past the lane, or away entirely when the roof has no room for it.
   */
  function clearApproach(building, rect) {
    const windowLeft = rect.x - building.x;
    const laneEnd = windowLeft + rect.w + 90;
    for (const key of ['chimney', 'tower']) {
      const structure = building[key];
      if (!structure) continue;
      if (structure.dx >= laneEnd) continue; // already past the lane: harmless
      const movedDx = laneEnd + 10;
      if (movedDx + structure.w <= building.w - 4) structure.dx = movedDx;
      else building[key] = null;
    }
  }

  /** Clear a target's mark once it has been delivered or has slipped past. */
  function clearTarget(target) {
    if (target && target.win) target.win.target = false;
  }

  function reset() {
    buildings.length = 0;
    nextX = -240;
    ensure(0);
  }

  /** Set how tightly the skyline packs itself from the next building on (see ROUTES). */
  function setDensity(value) {
    density = value;
  }

  reset();

  return { buildings, ensure, reset, setDensity, windowRect, solidRects, chooseTarget, clearTarget };
}
