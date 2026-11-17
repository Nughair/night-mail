// Everything Night Mail draws: the night sky and its moon, three parallax skyline
// layers, the lit windows in their lamp hues, weather fronts (fog banks, rain bands),
// festival fireworks, the paper plane and its paper-trail ribbon, particles, the HUD
// with its campaign pips, upgrade row and special-delivery chip, and the title,
// campaign, pause, upgrade-draft and results screens. It only reads the world state;
// it never changes it.

import { COLORS, COMBO_WINDOW, PLANE_X, VIEW } from './config.js';
import { DRAFT_CARDS, ROUTES, upgradeById } from './campaign.js';
import { EXPRESS_SECONDS, SPECIAL_LABELS } from './deliveries.js';
import { MEDAL_COLORS, medalCounts } from './medals.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_OVER = 'over';
export const SCREEN_CAMPAIGN = 'campaign';

/** The lamp hues of city.js, as draw colours: amber and gold warm, rose rare, cool rarer. */
const HUE_COLORS = {
  warm: COLORS.windowLit,
  gold: COLORS.windowWarm,
  rose: '#ffab91',
  cool: '#bcd2ff',
};

const W = VIEW.width;
const H = VIEW.height;

/** The far skyline and the stars are fixed decorations: one seed, the same every visit. */
function makeStars() {
  const rng = createRandom(20261115);
  const stars = [];
  for (let i = 0; i < 150; i += 1) {
    stars.push({ x: rng.range(0, W), y: rng.range(0, 430), r: rng.range(0.6, 1.9), phase: rng.range(0, 6.28) });
  }
  return stars;
}

function makeFarSkyline() {
  const rng = createRandom(77003);
  const blocks = [];
  let x = 0;
  while (x < 2600) {
    const w = rng.range(60, 150);
    blocks.push({ x, w, top: rng.range(430, 590) });
    x += w + rng.range(4, 26);
  }
  return { blocks, span: x };
}

/**
 * The middle skyline: nearer and taller than the far one, a touch lighter, with a few
 * windows of its own still lit. It sits between the far blocks and the flown city, so
 * the night has three depths and the plane's lane reads against all of them.
 */
function makeMidSkyline() {
  const rng = createRandom(41517);
  const blocks = [];
  let x = 0;
  while (x < 3000) {
    const w = rng.range(90, 190);
    const top = rng.range(360, 520);
    const windows = [];
    const cols = Math.floor(w / 34);
    const rows = Math.floor((VIEW.height - top) / 52);
    for (let i = 0; i < cols * rows; i += 1) {
      if (rng.chance(0.16)) {
        windows.push({ dx: 12 + (i % cols) * 34, dy: 18 + Math.floor(i / cols) * 52, hue: rng.pick(['warm', 'gold', 'cool']) });
      }
    }
    blocks.push({ x, w, top, windows });
    x += w + rng.range(10, 44);
  }
  return { blocks, span: x };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = makeStars();
  const far = makeFarSkyline();
  const mid = makeMidSkyline();

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSky(state) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, COLORS.skyTop);
    grad.addColorStop(0.55, COLORS.skyMid);
    grad.addColorStop(1, COLORS.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // The sunrise itself: it breaks the run at dawn, and on the Dawn Run it is the
    // storm's backdrop, rising as the finale's timer runs down — a warm wash over the
    // rooftops and the sun's own disc climbing out of the streets behind them.
    let dawnStrength = 0;
    if (state.phase === 'over' && state.overReason === 'dawn') dawnStrength = 0.5;
    else if (state.phase === 'over' && state.overReason === 'win') dawnStrength = 0.62;
    else if (state.phase === 'playing' && ROUTES[state.route].finale) {
      dawnStrength = 0.55 * (1 - state.nightTime / state.nightDuration);
    }
    if (dawnStrength > 0) {
      const dawn = ctx.createLinearGradient(0, H * 0.38, 0, H);
      dawn.addColorStop(0, 'rgba(255,120,70,0)');
      dawn.addColorStop(0.62, `rgba(255,140,75,${(dawnStrength * 0.55).toFixed(3)})`);
      dawn.addColorStop(1, `rgba(255,170,90,${dawnStrength.toFixed(3)})`);
      ctx.fillStyle = dawn;
      ctx.fillRect(0, H * 0.38, W, H * 0.62);
      // The disc: it breaks the horizon as the strength grows, low and wide and hot.
      const sunY = H + 26 - dawnStrength * 120;
      const sun = ctx.createRadialGradient(W * 0.68, sunY, 8, W * 0.68, sunY, 190);
      sun.addColorStop(0, `rgba(255,214,150,${(0.75 * dawnStrength + 0.12).toFixed(3)})`);
      sun.addColorStop(0.35, `rgba(255,160,90,${(0.5 * dawnStrength).toFixed(3)})`);
      sun.addColorStop(1, 'rgba(255,140,80,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(W * 0.68 - 200, sunY - 200, 400, 400);
      ctx.fillStyle = `rgba(255,226,170,${(0.85 * dawnStrength).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(W * 0.68, sunY, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStars(state) {
    const drift = (state.cameraX * 0.08) % W;
    for (const star of stars) {
      const x = (star.x - drift + W) % W;
      const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(state.time * 0.7 + star.phase));
      ctx.globalAlpha = twinkle * 0.85;
      ctx.fillStyle = '#dfe6ff';
      ctx.fillRect(x, star.y, star.r, star.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawMoon(state) {
    let progress = 0.32;
    if (state.phase === 'playing' || state.phase === 'draft') progress = 1 - state.nightTime / state.nightDuration;
    else if (state.phase === 'over') progress = state.overReason === 'dawn' ? 1 : 0.85;
    const x = 170 + progress * (W - 340);
    const y = 128 - Math.sin(progress * Math.PI) * 44;
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 130);
    glow.addColorStop(0, 'rgba(240,238,210,0.35)');
    glow.addColorStop(1, 'rgba(240,238,210,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 140, y - 140, 280, 280);
    ctx.fillStyle = '#f2eed8';
    ctx.beginPath();
    ctx.arc(x, y, 37, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,186,160,0.5)';
    for (const [dx, dy, r] of [[-12, -8, 7], [10, 12, 5], [14, -14, 4], [-4, 16, 3]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFarSkyline(state) {
    const offset = (state.cameraX * 0.32) % far.span;
    ctx.fillStyle = COLORS.farRoof;
    for (let base = -offset; base < W; base += far.span) {
      for (const block of far.blocks) {
        ctx.fillRect(base + block.x, block.top, block.w, H - block.top);
      }
    }
  }

  function drawMidSkyline(state) {
    const offset = (state.cameraX * 0.55) % mid.span;
    for (let base = -offset; base < W; base += mid.span) {
      for (const block of mid.blocks) {
        ctx.fillStyle = '#0d1233';
        ctx.fillRect(base + block.x, block.top, block.w, H - block.top);
        for (const win of block.windows) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = HUE_COLORS[win.hue];
          ctx.fillRect(base + block.x + win.dx, block.top + win.dy, 7, 10);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function drawEnvelope(x, y, w, h, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(70,50,10,0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(0, h * 0.08);
    ctx.lineTo(w / 2, -h / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBuildings(state, city) {
    for (const building of city.buildings) {
      const bx = building.x - state.cameraX;
      if (bx + building.w < -80 || bx > W + 80) continue;
      ctx.fillStyle = building.color;
      ctx.fillRect(bx, building.topY, building.w, H - building.topY);
      ctx.fillStyle = COLORS.roofEdge;
      ctx.fillRect(bx - 3, building.topY - 4, building.w + 6, 5);

      if (building.chimney) {
        const c = building.chimney;
        ctx.fillStyle = building.color;
        ctx.fillRect(bx + c.dx, building.topY - c.h, c.w, c.h);
        ctx.fillStyle = 'rgba(200,205,230,0.16)';
        for (let i = 0; i < 3; i += 1) {
          const rise = (state.time * 11 + building.x * 0.13 + i * 13) % 39;
          ctx.beginPath();
          ctx.arc(bx + c.dx + c.w / 2 + Math.sin(state.time + i * 2.1) * 3, building.topY - c.h - 5 - rise, 3.4 + rise * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (building.tower) {
        const t = building.tower;
        ctx.strokeStyle = COLORS.roofEdge;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx + t.dx + 4, building.topY);
        ctx.lineTo(bx + t.dx + t.w / 2, building.topY - t.h + 12);
        ctx.lineTo(bx + t.dx + t.w - 4, building.topY);
        ctx.stroke();
        ctx.fillStyle = '#1b2450';
        ctx.beginPath();
        ctx.ellipse(bx + t.dx + t.w / 2, building.topY - t.h + 8, t.w / 2, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const win of building.windows) {
        const rect = city.windowRect(building, win);
        const wx = rect.x - state.cameraX;
        if (wx < -30 || wx > W + 30) continue;
        if (win.target) continue; // the target window is drawn with its glow, below
        if (win.lit) {
          // Fog thins every lamp behind it: a window deep in a bank is a smudge.
          const fog = state.weather ? state.weather.fogAt(rect.x + rect.w / 2) : 0;
          const flicker = 0.82 + 0.18 * Math.sin(state.time * 0.6 + win.flicker);
          const color = HUE_COLORS[win.hue] ?? COLORS.windowLit;
          if (win.halo) {
            ctx.globalAlpha = 0.13 * flicker * (1 - fog * 0.7);
            ctx.fillStyle = color;
            ctx.fillRect(wx - 4, rect.y - 4, rect.w + 8, rect.h + 8);
          }
          ctx.globalAlpha = flicker * (1 - fog * 0.62);
          ctx.fillStyle = color;
          ctx.fillRect(wx, rect.y, rect.w, rect.h);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = COLORS.windowDark;
          ctx.fillRect(wx, rect.y, rect.w, rect.h);
        }
      }
    }
  }

  /**
   * The weather fronts, drawn where the world keeps them: a fog bank is a low wall of
   * soft, overlapping breaths that the rooftops poke out of; a rain band is a darker
   * column of sky with its own dense slant of rain, visibly a place, not a mood; a
   * thermal is a warm column of rising sparks over the market stalls; and the beam
   * is the lighthouse itself, its rotating wedge of light drawn from the same
   * beamInfo the world presses with, so what catches the plane is what is seen.
   */
  function drawWeatherFronts(state) {
    const weather = state.weather;
    if (!weather) return;
    for (const front of weather.fronts) {
      const fx = front.x - state.cameraX;
      if (fx + front.w < -80 || fx > W + 80) continue;
      if (front.kind === 'beam') {
        drawLighthouse(state, front);
        continue;
      }
      if (front.kind === 'thermal') {
        // A warm column: a soft amber wash, a brighter core, and sparks on the rise.
        const grad = ctx.createLinearGradient(0, 250, 0, H);
        grad.addColorStop(0, 'rgba(255,170,90,0)');
        grad.addColorStop(0.55, 'rgba(255,170,90,0.10)');
        grad.addColorStop(1, 'rgba(255,180,100,0.20)');
        ctx.fillStyle = grad;
        ctx.fillRect(fx, 250, front.w, H - 250);
        ctx.fillStyle = 'rgba(255,190,110,0.13)';
        ctx.fillRect(fx + front.w * 0.32, 300, front.w * 0.36, H - 300);
        ctx.fillStyle = '#ffd9a0';
        for (let i = 0; i < 11; i += 1) {
          const rise = (state.time * 95 + i * 113 + front.seed * 61) % 370;
          const sx = fx + front.w * (0.16 + 0.68 * ((i * 37 + front.seed * 13) % 10) / 10) + Math.sin(state.time * 1.8 + i * 2.4) * 7;
          ctx.globalAlpha = Math.max(0, 0.75 - rise / 520);
          ctx.fillRect(sx, 660 - rise, 3.2, 3.2);
        }
        ctx.globalAlpha = 1;
        continue;
      }
      if (front.kind === 'fog') {
        const blobs = 7;
        for (let i = 0; i < blobs; i += 1) {
          const bx = fx + (front.w * (i + 0.5)) / blobs + Math.sin(state.time * 0.22 + front.seed + i * 1.7) * 16;
          const by = 468 + Math.sin(state.time * 0.16 + front.seed * 2 + i * 2.3) * 26;
          const r = front.w / blobs + 90;
          const fog = ctx.createRadialGradient(bx, by, 10, bx, by, r);
          fog.addColorStop(0, 'rgba(196,208,238,0.34)');
          fog.addColorStop(0.7, 'rgba(180,194,232,0.16)');
          fog.addColorStop(1, 'rgba(180,194,232,0)');
          ctx.fillStyle = fog;
          ctx.fillRect(bx - r, by - r, r * 2, r * 2);
        }
        ctx.fillStyle = 'rgba(190,202,235,0.10)';
        ctx.fillRect(fx, 300, front.w, H - 300);
      } else {
        ctx.fillStyle = 'rgba(16,22,54,0.30)';
        ctx.fillRect(fx, 0, front.w, H);
        ctx.strokeStyle = 'rgba(170,195,255,0.34)';
        ctx.lineWidth = 1.5;
        const drift = (state.time * 940) % 130;
        const fall = (state.time * 1350) % 170;
        for (let row = 0; row < 5; row += 1) {
          for (let x = -60; x < front.w + 60; x += 130) {
            const sx = fx + x + drift + row * 29;
            const sy = -30 + row * 170 + fall;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - 11, sy + 38);
            ctx.stroke();
          }
        }
      }
    }
  }

  /**
   * One lighthouse of the Coast: a striped tower standing in its stretch of shore,
   * and its beam — two wedges of light, opposite each other, turning on the clock
   * weather.js keeps. The wedge is drawn from beamInfo, the very numbers the world
   * uses to press on a caught plane, so the light the player sees is the light
   * that pushes.
   */
  function drawLighthouse(state, front) {
    const weather = state.weather;
    const { lx, oy, angle } = weather.beamInfo(front, state.time);
    const x = lx - state.cameraX;
    if (x < -1600 || x > W + 1600) return;
    // The wedges first, under everything the light passes over.
    for (const dirAngle of [angle, angle + Math.PI]) {
      const grad = ctx.createLinearGradient(x, oy, x + Math.cos(dirAngle) * 460, oy + Math.sin(dirAngle) * 460);
      grad.addColorStop(0, 'rgba(255,242,190,0.20)');
      grad.addColorStop(1, 'rgba(255,242,190,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, oy);
      ctx.lineTo(x + Math.cos(dirAngle - 0.3) * 1500, oy + Math.sin(dirAngle - 0.3) * 1500);
      ctx.lineTo(x + Math.cos(dirAngle + 0.3) * 1500, oy + Math.sin(dirAngle + 0.3) * 1500);
      ctx.closePath();
      ctx.fill();
    }
    if (x < -90 || x > W + 90) return;
    // The tower: a tapered stack of lit and dark bands, the lamp room on top.
    const baseY = 596;
    ctx.fillStyle = '#1a2148';
    ctx.beginPath();
    ctx.moveTo(x - 21, baseY);
    ctx.lineTo(x - 12, oy + 16);
    ctx.lineTo(x + 12, oy + 16);
    ctx.lineTo(x + 21, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(232,168,62,0.75)';
    for (let i = 0; i < 3; i += 1) {
      const yTop = oy + 52 + i * 74;
      ctx.beginPath();
      ctx.moveTo(x - 19 + i * 2.4, yTop + 34);
      ctx.lineTo(x - 17 + i * 2.4, yTop);
      ctx.lineTo(x + 17 - i * 2.4, yTop);
      ctx.lineTo(x + 19 - i * 2.4, yTop + 34);
      ctx.closePath();
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(x, oy, 4, x, oy, 74);
    glow.addColorStop(0, 'rgba(255,240,190,0.55)');
    glow.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 78, oy - 78, 156, 156);
    ctx.fillStyle = '#fff3cf';
    ctx.fillRect(x - 8, oy - 11, 16, 22);
    ctx.fillStyle = '#232c5e';
    ctx.fillRect(x - 11, oy - 17, 22, 6);
  }

  /**
   * The Rooftop Gardens' doves, drawn where the world flies them: each bird a small
   * gull-curve whose wings beat on the same clock world.js collides with, so the
   * bird that is seen is the bird that scatters.
   */
  function drawDoves(state) {
    if (!state.doves || state.doves.length === 0) return;
    ctx.strokeStyle = '#dfe6ff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const flock of state.doves) {
      for (const bird of flock.birds) {
        const bx = flock.x + bird.dx - state.cameraX;
        const by = flock.y + bird.dy + Math.sin(state.time * 9 + flock.seed + bird.dx) * 3;
        if (bx < -30 || bx > W + 30) continue;
        const flap = Math.sin(state.time * 13 + flock.seed + bird.dx * 0.7) * 4.5;
        ctx.beginPath();
        ctx.moveTo(bx - 8, by + flap);
        ctx.quadraticCurveTo(bx - 2.5, by - 4.5 - flap * 0.4, bx, by);
        ctx.quadraticCurveTo(bx + 2.5, by - 4.5 - flap * 0.4, bx + 8, by + flap);
        ctx.stroke();
        ctx.fillStyle = '#eef1ff';
        ctx.fillRect(bx - 1.6, by - 1.6, 3.2, 3.2);
      }
    }
  }

  /**
   * The Narrows' cloud deck: a low ceiling of cloud the plane rides beneath, drawn
   * as a soft band with a scalloped underside at exactly the height world.js clamps
   * the plane to — the lid the player sees is the lid that holds.
   */
  function drawCeiling(state) {
    const ceiling = ROUTES[state.route].ceiling;
    if (!ceiling || (state.phase !== 'playing' && state.phase !== 'draft')) return;
    const grad = ctx.createLinearGradient(0, 0, 0, ceiling);
    grad.addColorStop(0, 'rgba(168,182,228,0.42)');
    grad.addColorStop(1, 'rgba(168,182,228,0.13)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, ceiling);
    ctx.fillStyle = 'rgba(196,206,240,0.30)';
    const drift = (state.cameraX * 0.85) % 190;
    for (let x = -drift - 95; x < W + 95; x += 95) {
      ctx.beginPath();
      ctx.arc(x + 47, ceiling - 4 + Math.sin(state.time * 0.5 + x * 0.05) * 3, 47, 0, Math.PI);
      ctx.fill();
    }
  }

  /** The Festival Quarter's fireworks: a fixed seeded show, a pure function of the clock. */
  const FIREWORKS = (() => {
    const rng = createRandom(90210);
    const bursts = [];
    for (let i = 0; i < 9; i += 1) {
      bursts.push({
        at: i * 6.4 + rng.range(0, 2.2),
        x: rng.range(120, 1160),
        y: rng.range(110, 300),
        color: rng.pick(['#ffcf6b', '#ffab91', '#bcd2ff', '#ffd7f0', '#a8ffc9']),
        seed: rng.range(0, 6.28),
      });
    }
    return bursts;
  })();

  function drawFireworks(state) {
    if (!ROUTES[state.route].festival || state.phase === 'over') return;
    const cycle = 62;
    const t = state.time % cycle;
    for (const burst of FIREWORKS) {
      const age = t - burst.at;
      if (age < 0 || age > 2.6) continue;
      if (age < 0.85) {
        // The shell climbing: a small bright head with a short tail of sparks.
        const frac = age / 0.85;
        const y = 560 - (560 - burst.y) * frac;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(burst.x - 2, y - 2, 4, 4);
        ctx.globalAlpha = 0.4;
        ctx.fillRect(burst.x - 1.4, y + 7, 2.8, 9);
        ctx.globalAlpha = 1;
      } else {
        const burstAge = age - 0.85;
        const frac = burstAge / 1.75;
        const radius = 12 + frac * 95;
        const alpha = Math.max(0, 1 - frac) * 0.9;
        ctx.fillStyle = burst.color;
        for (let i = 0; i < 14; i += 1) {
          const angle = burst.seed + (i / 14) * Math.PI * 2;
          const sx = burst.x + Math.cos(angle) * radius;
          const sy = burst.y + Math.sin(angle) * radius + frac * frac * 34;
          ctx.globalAlpha = alpha;
          ctx.fillRect(sx - 2, sy - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawTarget(state) {
    const target = state.target;
    if (!target || state.phase !== 'playing') return;
    const x = target.x - state.cameraX;
    if (x < -60 || x > W + 60) return;
    const y = target.y;
    const special = state.special;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 5.2);
    // Fog is the special deliveries' quiet enemy: deep in a bank, even the target's
    // beam and ring fade to a hint, and the window is found by flying closer.
    const fog = state.weather ? state.weather.fogAt(target.x) : 0;
    const dim = 1 - fog * 0.66;
    // A soft beam of lamplight rising from the window, so the eye finds it at speed.
    const beam = ctx.createLinearGradient(0, y - 190, 0, y);
    beam.addColorStop(0, 'rgba(255,207,107,0)');
    beam.addColorStop(1, `rgba(255,207,107,${(0.2 * dim).toFixed(3)})`);
    ctx.fillStyle = beam;
    ctx.fillRect(x - 15, y - 190, 30, 190);
    if (ROUTES[state.route].boss && state.boss) {
      // The Warden's lantern: a great crowned lamp swinging on its chain, drawn at
      // the moving point the world delivers to — bigger than any window, named, and
      // ringed twice, so the boss's target reads as a boss's target at a glance.
      const sway = Math.sin(state.time * 1.3) * 3;
      ctx.strokeStyle = 'rgba(200,205,230,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + sway * 2, y - 190);
      ctx.lineTo(x, y - 26);
      ctx.stroke();
      const lampGlow = ctx.createRadialGradient(x, y, 6, x, y, 92);
      lampGlow.addColorStop(0, `rgba(255,214,130,${(0.5 * dim).toFixed(3)})`);
      lampGlow.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = lampGlow;
      ctx.fillRect(x - 96, y - 96, 192, 192);
      ctx.fillStyle = '#2a2140';
      ctx.fillRect(x - 15, y - 21, 30, 42);
      ctx.fillStyle = COLORS.goldBright;
      ctx.fillRect(x - 10, y - 15, 20, 30);
      ctx.fillStyle = '#ffb59d';
      for (let s = -1; s <= 1; s += 1) {
        ctx.beginPath();
        ctx.moveTo(x + s * 11 - 4, y - 21);
        ctx.lineTo(x + s * 11, y - 31 - (s === 0 ? 4 : 0));
        ctx.lineTo(x + s * 11 + 4, y - 21);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#ff9d5c';
      ctx.globalAlpha = (0.5 + 0.5 * pulse) * dim;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(x, y, 36 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffb59d';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('THE WARDEN', x, y + 58);
    } else {
      ctx.globalAlpha = dim;
      ctx.fillStyle = COLORS.goldBright;
      ctx.fillRect(x - 8, y - 10, 16, 20);
      ctx.globalAlpha = 1;
    }
    if (special && special.kind === 'express') {
      // The express ring is a clock: a hot orange arc that burns down with the timer,
      // over a thin full circle, so the dash left is readable at a glance.
      const frac = Math.max(0, special.t / EXPRESS_SECONDS);
      ctx.strokeStyle = 'rgba(255,157,92,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 27, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = special.t < 3 && Math.sin(state.time * 10) > 0 ? '#ff7a6b' : '#ff9d5c';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.arc(x, y, 27, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      // A small lightning bolt above the window: express at icon size.
      ctx.fillStyle = '#ffb59d';
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 52);
      ctx.lineTo(x - 6, y - 34);
      ctx.lineTo(x - 0.5, y - 34);
      ctx.lineTo(x - 3, y - 18);
      ctx.lineTo(x + 7, y - 38);
      ctx.lineTo(x + 1.5, y - 38);
      ctx.closePath();
      ctx.fill();
    } else if (special && special.kind === 'fragile') {
      // The fragile ring is pale and steady, and its envelope wears the crack it
      // cannot survive: a thin zigzag across the paper.
      ctx.strokeStyle = '#a8d8ff';
      ctx.globalAlpha = 0.65 + 0.3 * pulse;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, 25 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawEnvelope(x, y - 46 - Math.sin(state.time * 2.6) * 5, 26, 18, '#dceaff');
      ctx.strokeStyle = 'rgba(70,90,140,0.8)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 56 - Math.sin(state.time * 2.6) * 5);
      ctx.lineTo(x - 1, y - 48 - Math.sin(state.time * 2.6) * 5);
      ctx.lineTo(x - 4, y - 43 - Math.sin(state.time * 2.6) * 5);
      ctx.lineTo(x + 3, y - 36 - Math.sin(state.time * 2.6) * 5);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = COLORS.gold;
    ctx.globalAlpha = (0.55 + 0.45 * pulse) * dim;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, 21 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawEnvelope(x, y - 46 - Math.sin(state.time * 2.6) * 5, 26, 18, COLORS.gold);
  }

  function drawPlane(state) {
    const plane = state.plane;
    // The paper trail: a ribbon of wake behind the plane, drawn as one tapering
    // stroke per segment — thick and bright at the tail, hair-thin where it fades.
    ctx.strokeStyle = '#cfd6f5';
    ctx.lineCap = 'round';
    for (let i = 1; i < plane.trail.length; i += 1) {
      const a = plane.trail[i - 1];
      const b = plane.trail[i];
      const ax = a.x - state.cameraX;
      const bx = b.x - state.cameraX;
      if (bx < -20 || ax > W + 20) continue;
      const life = Math.max(0, b.life);
      ctx.globalAlpha = life * 0.42;
      ctx.lineWidth = 0.8 + life * 3.4;
      ctx.beginPath();
      ctx.moveTo(ax, a.y);
      ctx.lineTo(bx, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (plane.dead) return;
    ctx.save();
    ctx.translate(PLANE_X, plane.y);
    ctx.rotate(plane.angle);
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(-17, -12);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-17, 12);
    ctx.closePath();
    ctx.fillStyle = COLORS.paper;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-17, 12);
    ctx.closePath();
    ctx.fillStyle = COLORS.paperShade;
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      const x = p.x - state.cameraX;
      if (x < -20 || x > W + 20) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts(state) {
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      const x = t.x - state.cameraX;
      if (x < -80 || x > W + 80) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life / (t.maxLife * 0.6)));
      ctx.font = `700 ${t.size}px system-ui, sans-serif`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawWindStreaks(state) {
    if (!state.gust.active || state.phase !== 'playing') return;
    ctx.strokeStyle = 'rgba(200,214,255,0.28)';
    ctx.lineWidth = 2;
    const drift = (state.time * 620) % 190;
    for (let row = 0; row < 5; row += 1) {
      const y = 90 + row * 120 + Math.sin(state.time * 3 + row) * 9;
      for (let x = -drift; x < W; x += 190) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 64, y + state.gust.dir * 13);
        ctx.stroke();
      }
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(7,10,30,0.66)';
    roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,155,230,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** The campaign's progress: one pip per route, gold for flown, ringed for current. */
  function drawRoutePips(state) {
    const total = ROUTES.length;
    const x0 = W / 2 - ((total - 1) * 24) / 2;
    for (let i = 0; i < total; i += 1) {
      const x = x0 + i * 24;
      ctx.beginPath();
      ctx.arc(x, 100, 6, 0, Math.PI * 2);
      if (i < state.route || state.won || (i === state.route && state.phase === 'draft')) {
        ctx.fillStyle = COLORS.gold;
        ctx.fill();
      } else if (i === state.route && state.phase === 'playing') {
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(154,163,214,0.4)';
        ctx.fill();
      }
    }
  }

  /** The upgrades aboard, named along the bottom: what the drafts have made of the plane. */
  function drawUpgradeRow(state) {
    if (state.upgrades.length === 0) return;
    const names = state.upgrades.map((id) => {
      const up = upgradeById(id);
      let name = up ? up.name : id;
      if (id === 'sturdy') name += state.clipReady ? ' (ready)' : ' (spent)';
      return name;
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,207,107,0.85)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(names.join('  ·  '), 20, H - 24);
  }

  function drawHud(state, best) {
    ctx.textBaseline = 'alphabetic';
    panel(18, 16, 252, 64);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('SCORE', 34, 40);
    ctx.fillText('LETTERS', 150, 40);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillText(String(state.score), 34, 68);
    ctx.fillText(String(state.letters), 150, 68);
    drawEnvelope(138, 60, 17, 12, COLORS.gold);

    const route = ROUTES[state.route];
    panel(W / 2 - 168, 16, 336, 64);
    ctx.textAlign = 'center';
    ctx.fillStyle = route.finale ? '#ffb59d' : COLORS.gold;
    ctx.font = '700 21px Georgia, serif';
    ctx.fillText(route.boss ? `Night ${state.night} · The Storm Warden` : `Night ${state.night} · ${route.name}`, W / 2, 44);
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '600 13px system-ui, sans-serif';
    const clock = route.finale ? ` — sunrise in ${Math.max(0, Math.ceil(state.nightTime))}s` : '';
    const weatherTag = route.boss ? ' · his gusts rise with every letter'
      : route.weather === 'fog' ? ' · fog banks'
      : route.weather === 'rain' ? ' · rain bands'
      : route.weather === 'beam' ? ' · the beam sweeps'
      : route.weather === 'thermal' ? ' · thermals rising'
      : route.mechanic === 'doves' ? ' · doves in the lane'
      : route.ceiling ? ' · low cloud deck'
      : route.festival ? ' · fireworks' : '';
    ctx.fillText(`${state.nightDelivered} of ${state.quota} letters delivered${clock}${weatherTag}`, W / 2, 66);
    drawRoutePips(state);

    panel(W - 218, 16, 200, 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('BEST', W - 34, 40);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillText(String(Math.max(best, state.score)), W - 34, 68);

    if (state.combo >= 2) {
      const windowSeconds = state.upgrades.includes('longcombo') ? 10 : COMBO_WINDOW;
      const frac = Math.max(0, state.comboTimer / windowSeconds);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.gold;
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillText(`COMBO x${state.combo}`, PLANE_X, 118);
      ctx.fillStyle = 'rgba(255,207,107,0.3)';
      ctx.fillRect(PLANE_X - 52, 128, 104, 5);
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(PLANE_X - 52, 128, 104 * frac, 5);
    }

    if (state.gust.active) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bcd2ff';
      ctx.font = '700 17px system-ui, sans-serif';
      const arrow = state.gust.dir > 0 ? 'pushing down' : 'lifting up';
      ctx.fillText(`~ wind gust, ${arrow} ~`, W / 2, 126);
    }

    // The special delivery aboard, named with its rule and — for an express — its
    // clock, counting down in the open where the dash can be planned around it.
    if (state.special) {
      const special = state.special;
      ctx.textAlign = 'center';
      if (special.kind === 'express') {
        const urgent = special.t < 3;
        ctx.fillStyle = urgent && Math.sin(state.time * 10) > 0 ? '#ff7a6b' : '#ff9d5c';
        ctx.font = '700 18px system-ui, sans-serif';
        ctx.fillText(`⚡ ${SPECIAL_LABELS.express} — ${Math.max(0, special.t).toFixed(1)}s`, W / 2, 152);
      } else {
        ctx.fillStyle = '#a8d8ff';
        ctx.font = '700 18px system-ui, sans-serif';
        ctx.fillText(`✉ ${SPECIAL_LABELS.fragile}`, W / 2, 152);
      }
    }

    drawUpgradeRow(state);

    // The night clock: a slim bar along the bottom that empties as the moon sets.
    ctx.fillStyle = 'rgba(10,14,40,0.7)';
    ctx.fillRect(0, H - 12, W, 12);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(0, H - 12, W * Math.max(0, state.nightTime / state.nightDuration), 12);
  }

  /** The Dawn Run's weather: slanted rain over the rooftops while the finale lasts. */
  function drawStorm(state) {
    if (state.phase !== 'playing' || !ROUTES[state.route].finale) return;
    ctx.strokeStyle = 'rgba(170,195,255,0.30)';
    ctx.lineWidth = 1.6;
    const drift = (state.time * 880) % 150;
    const fall = (state.time * 1250) % 190;
    for (let row = 0; row < 5; row += 1) {
      for (let x = -160; x < W + 160; x += 150) {
        const sx = x + drift + row * 37;
        const sy = -40 + row * 190 + fall;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 13, sy + 44);
        ctx.stroke();
      }
    }
  }

  function drawBanner(state) {
    const banner = state.banner;
    if (!banner) return;
    const fadeIn = Math.min(1, banner.t / 0.3);
    const fadeOut = Math.min(1, (banner.dur - banner.t) / 0.5);
    ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 44px Georgia, serif';
    ctx.fillText(banner.text, W / 2, 168);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText(banner.sub, W / 2, 200);
    ctx.globalAlpha = 1;
  }

  function drawTitle(state, best, record) {
    ctx.fillStyle = 'rgba(5,7,20,0.34)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    drawEnvelope(W / 2, 118, 54, 38, COLORS.gold);
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 92px Georgia, "Times New Roman", serif';
    ctx.fillText('NIGHT MAIL', W / 2, 232);
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'italic 23px Georgia, serif';
    ctx.fillText('a paper plane over a sleeping city', W / 2, 270);

    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('Hold  SPACE,  ↑  or the MOUSE  to climb — release to glide down', W / 2, 330);
    ctx.fillText('Slip a letter through each window that glows gold. Chain deliveries for combos.', W / 2, 362);
    ctx.fillText('Mind the rooftops, the fog and the rain, and finish each route before the moon sets.', W / 2, 394);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('Eight routes before dawn — seven districts, then the Dawn Run. Draft an upgrade after every route.', W / 2, 428);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('Express letters pay double against the clock; fragile ones break on a single clip.', W / 2, 458);
    ctx.fillStyle = COLORS.inkDim;
    ctx.fillText('Every route is scored for a medal — bronze, silver, gold.', W / 2, 488);

    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3.4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText('Press ENTER or click to take off', W / 2, 534);
    ctx.globalAlpha = 1;

    let footY = 566;
    if (record && record.owlUnlocked) {
      ctx.fillStyle = '#a8d8ff';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText('N — Night Owl: the endless night is yours', W / 2, footY);
      footY += 26;
    }
    if (record) {
      const counts = medalCounts(record.routes);
      const total = counts.gold + counts.silver + counts.bronze;
      if (total > 0) {
        ctx.fillStyle = COLORS.inkDim;
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.fillText(`Campaign medals: ${counts.gold} gold · ${counts.silver} silver · ${counts.bronze} bronze`, W / 2, footY);
        footY += 24;
      }
    }
    if (best > 0) {
      ctx.fillStyle = COLORS.inkDim;
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText(`Best score so far: ${best}`, W / 2, footY);
    }
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText('C campaign & medals · P pauses · M mutes', W / 2, 688);
  }

  /** One medal disc: filled in its colour when earned, a hollow ring when not. */
  function drawMedalDisc(x, y, medal, r = 11) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (medal) {
      ctx.fillStyle = MEDAL_COLORS[medal];
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,12,30,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r - 3.4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(154,163,214,0.45)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  /**
   * The campaign screen: every route with its best score and the medal that score
   * holds, the campaign's totals, and the Night Owl's lock or key. It is the map of
   * the whole game on one screen — what there is, what it asks, and what is left.
   */
  function drawCampaign(state, record) {
    ctx.fillStyle = 'rgba(5,7,20,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    drawEnvelope(W / 2, 74, 44, 31, COLORS.gold);
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 46px Georgia, serif';
    ctx.fillText('THE CAMPAIGN', W / 2, 138);
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText('eight routes to dawn — fly them in order, draft after each, medal on every one', W / 2, 168);

    const rec = record ?? { routes: [], wins: 0, owlUnlocked: false };
    ROUTES.forEach((route, i) => {
      const y = 216 + i * 47;
      const slot = rec.routes[i] ?? { best: 0, medal: null };
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(19,26,61,0.5)';
        ctx.fillRect(W / 2 - 430, y - 26, 860, 42);
      }
      drawMedalDisc(W / 2 - 396, y - 5, slot.medal);
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = '700 19px system-ui, sans-serif';
      const tag = route.finale ? ' — the finale' : route.weather === 'fog' ? ' — fog' : route.weather === 'rain' ? ' — rain' : route.festival ? ' — fireworks' : '';
      ctx.fillText(`${i + 1}. ${route.name}${tag}`, W / 2 - 372, y);
      ctx.fillStyle = COLORS.inkDim;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(`${route.quota} letters`, W / 2 + 96, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = slot.best > 0 ? COLORS.ink : 'rgba(154,163,214,0.55)';
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.fillText(slot.best > 0 ? `best ${slot.best}` : 'not flown', W / 2 + 330, y);
      ctx.fillStyle = slot.medal ? MEDAL_COLORS[slot.medal] : 'rgba(154,163,214,0.55)';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(slot.medal ? slot.medal.toUpperCase() : '—', W / 2 + 408, y);
      ctx.textAlign = 'center';
    });

    const counts = medalCounts(rec.routes);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText(
      `Medals held: ${counts.gold} gold · ${counts.silver} silver · ${counts.bronze} bronze   ·   Campaigns won: ${rec.wins}`,
      W / 2, 612,
    );
    ctx.fillStyle = rec.owlUnlocked ? '#a8d8ff' : COLORS.inkDim;
    ctx.font = rec.owlUnlocked ? '700 17px system-ui, sans-serif' : '600 17px system-ui, sans-serif';
    ctx.fillText(
      rec.owlUnlocked
        ? 'Night Owl unlocked — press N on the title screen for the endless night'
        : 'Win the campaign to unlock the Night Owl, the endless night',
      W / 2, 642,
    );
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText('ENTER fly the campaign · C or ESC back to the title', W / 2, 688);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(5,7,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 46px Georgia, serif';
    ctx.fillText('PAUSED', W / 2, 340);
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillStyle = COLORS.inkDim;
    ctx.fillText('Press P or ENTER to keep flying', W / 2, 380);
  }

  /** Wrap a line of card text to a width, by words, for the draft cards. */
  function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = trial;
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * The between-route draft: the route just flown, its bonus, and the three upgrade
   * cards on offer. The card rectangles are campaign.js's DRAFT_CARDS — the same ones
   * the shell hit-tests — so what is drawn is exactly what can be clicked.
   */
  function drawDraft(state) {
    ctx.fillStyle = 'rgba(5,7,20,0.52)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    const flown = ROUTES[state.route];
    const next = ROUTES[(state.route + 1) % ROUTES.length];
    drawEnvelope(W / 2, 132, 40, 28, COLORS.gold);
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 42px Georgia, serif';
    ctx.fillText(`${flown.name} — route flown`, W / 2, 186);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText(`Route bonus +${state.draft.bonus}. Choose one upgrade for the rest of the ${state.mode === 'owl' ? 'night' : 'campaign'}.`, W / 2, 224);
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = 'italic 17px Georgia, serif';
    const nextLabel = next.finale && state.mode === 'campaign' ? 'the Dawn Run' : `Night ${state.night + 1} · ${next.name}`;
    ctx.fillText(`Next: ${nextLabel} — ${next.blurb.toLowerCase()}`, W / 2, 254);

    state.draft.choices.forEach((id, i) => {
      const card = DRAFT_CARDS[i];
      const up = upgradeById(id);
      if (!up) return;
      panel(card.x, card.y, card.w, card.h);
      ctx.strokeStyle = 'rgba(255,207,107,0.55)';
      ctx.lineWidth = 1.4;
      roundRect(card.x, card.y, card.w, card.h, 12);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.gold;
      ctx.font = '700 24px Georgia, serif';
      ctx.fillText(up.name, card.x + card.w / 2, card.y + 52);
      ctx.fillStyle = COLORS.ink;
      ctx.font = '500 16.5px system-ui, sans-serif';
      const lines = wrapText(up.desc, card.w - 48);
      lines.forEach((line, j) => ctx.fillText(line, card.x + card.w / 2, card.y + 92 + j * 23));
      ctx.fillStyle = COLORS.inkDim;
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(`press ${i + 1}  ·  or click`, card.x + card.w / 2, card.y + card.h - 20);
    });

    if (state.upgrades.length > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.inkDim;
      ctx.font = '600 15px system-ui, sans-serif';
      const names = state.upgrades.map((id) => upgradeById(id)?.name ?? id).join('  ·  ');
      ctx.fillText(`Aboard already: ${names}`, W / 2, 592);
    }
  }

  function drawOver(state, best, isNewBest, record) {
    ctx.fillStyle = 'rgba(5,7,20,0.45)';
    ctx.fillRect(0, 0, W, H);
    const won = state.overReason === 'win';
    const owl = state.mode === 'owl';
    const rows = [
      ['Score', String(state.score)],
      ['Letters delivered', String(state.letters)],
      ['Best combo', `x${Math.max(1, state.bestCombo)}`],
    ];
    if (owl) rows.push(['Nights flown', String(state.night)]);
    else rows.push(['Routes flown', `${won ? ROUTES.length : state.route} of ${ROUTES.length}`]);
    if (!won) rows.push(['Fell on', `Night ${state.night} · ${ROUTES[state.route].name}`]);
    const showMedals = !owl && state.routeResults.length > 0;
    const showOwlLine = won && record && record.owlUnlocked;
    const panelH = 218 + rows.length * 40
      + (showMedals ? 58 : 0)
      + (showOwlLine ? 28 : 0)
      + (state.upgrades.length > 0 ? 30 : 0)
      + (isNewBest ? 30 : 0);
    const top = 330 - panelH / 2;
    panel(W / 2 - 262, top, 524, panelH);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 45px Georgia, serif';
    ctx.fillText(won ? 'The City Wakes' : state.overReason === 'dawn' ? 'Dawn Breaks' : 'Down in the Streets', W / 2, top + 68);
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText(
      won
        ? 'Every route flown, the Dawn Run beaten — the mail is through.'
        : owl
          ? 'The endless night closes over the plane.'
          : state.overReason === 'dawn'
            ? 'The moon set on the last letter.'
            : 'A rooftop ended the round.',
      W / 2, top + 100,
    );
    ctx.font = '600 20px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = top + 154 + i * 40;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.inkDim;
      ctx.fillText(label, W / 2 - 190, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(value, W / 2 + 190, y);
    });
    let cursor = top + 154 + rows.length * 40;
    if (showMedals) {
      // This run's route medals, one disc per route in flight order, with the tally.
      const results = state.routeResults;
      const x0 = W / 2 - ((results.length - 1) * 34) / 2;
      results.forEach((result, i) => drawMedalDisc(x0 + i * 34, cursor + 2, result.medal, 10));
      const counts = medalCounts(results);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.inkDim;
      ctx.font = '600 14.5px system-ui, sans-serif';
      ctx.fillText(`Route medals: ${counts.gold} gold · ${counts.silver} silver · ${counts.bronze} bronze`, W / 2, cursor + 30);
      cursor += 58;
    }
    if (showOwlLine) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a8d8ff';
      ctx.font = '700 15.5px system-ui, sans-serif';
      ctx.fillText('★ Night Owl unlocked — N on the title screen flies the endless night ★', W / 2, cursor + 4);
      cursor += 28;
    }
    if (state.upgrades.length > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,207,107,0.9)';
      ctx.font = '600 14.5px system-ui, sans-serif';
      const names = state.upgrades.map((id) => upgradeById(id)?.name ?? id).join('  ·  ');
      ctx.fillText(names, W / 2, cursor + 4);
      cursor += 30;
    }
    if (isNewBest) {
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.gold;
      ctx.font = '700 19px system-ui, sans-serif';
      ctx.fillText('★ NEW BEST ★', W / 2, cursor + 6);
      cursor += 30;
    }
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3.4);
    ctx.globalAlpha = pulse;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 23px system-ui, sans-serif';
    ctx.fillText('Press ENTER or click to fly again', W / 2, top + panelH - 24);
    ctx.globalAlpha = 1;
  }

  /**
   * Draw one frame. `screen` is the shell's screen; best/isNewBest describe the saved
   * best score, and meta.record is the campaign record (medals, wins, the Owl's lock)
   * the title, campaign and results screens read.
   */
  function draw(state, city, screen, best, isNewBest, meta = {}) {
    const record = meta.record ?? null;
    drawSky(state);
    drawStars(state);
    drawMoon(state);
    drawFarSkyline(state);
    drawMidSkyline(state);
    drawFireworks(state);
    drawBuildings(state, city);
    drawWeatherFronts(state);
    drawCeiling(state);
    drawDoves(state);
    drawTarget(state);
    drawWindStreaks(state);
    drawStorm(state);
    drawPlane(state);
    drawParticles(state);
    drawTexts(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_DRAFT) drawHud(state, best);
    if (screen === SCREEN_PLAY) drawBanner(state);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,90,70,${(state.flash * 0.32).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best, record);
    else if (screen === SCREEN_CAMPAIGN) drawCampaign(state, record);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_DRAFT) drawDraft(state);
    else if (screen === SCREEN_OVER) drawOver(state, best, isNewBest, record);
    // A soft vignette to close the frame.
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    vig.addColorStop(0, 'rgba(0,0,10,0)');
    vig.addColorStop(1, 'rgba(0,0,10,0.36)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  return { draw };
}
