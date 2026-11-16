// Everything Night Mail draws: the night sky and its moon, two skyline layers, the lit
// windows, the paper plane and its trail, particles, the HUD, and the title, pause and results
// screens. It only reads the world state; it never changes it.

import { COLORS, COMBO_WINDOW, NIGHT_SECONDS, PLANE_X, VIEW } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const stars = makeStars();
  const far = makeFarSkyline();

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
    if (state.phase === 'over' && state.overReason === 'dawn') {
      const dawn = ctx.createLinearGradient(0, H * 0.45, 0, H);
      dawn.addColorStop(0, 'rgba(255,150,80,0)');
      dawn.addColorStop(1, 'rgba(255,150,80,0.28)');
      ctx.fillStyle = dawn;
      ctx.fillRect(0, H * 0.45, W, H * 0.55);
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
    if (state.phase === 'playing') progress = 1 - state.nightTime / NIGHT_SECONDS;
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
          const flicker = 0.82 + 0.18 * Math.sin(state.time * 0.6 + win.flicker);
          ctx.globalAlpha = flicker;
          ctx.fillStyle = win.warm ? COLORS.windowLit : '#bcd2ff';
          ctx.fillRect(wx, rect.y, rect.w, rect.h);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = COLORS.windowDark;
          ctx.fillRect(wx, rect.y, rect.w, rect.h);
        }
      }
    }
  }

  function drawTarget(state) {
    const target = state.target;
    if (!target || state.phase !== 'playing') return;
    const x = target.x - state.cameraX;
    if (x < -60 || x > W + 60) return;
    const y = target.y;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 5.2);
    // A soft beam of lamplight rising from the window, so the eye finds it at speed.
    const beam = ctx.createLinearGradient(0, y - 190, 0, y);
    beam.addColorStop(0, 'rgba(255,207,107,0)');
    beam.addColorStop(1, 'rgba(255,207,107,0.20)');
    ctx.fillStyle = beam;
    ctx.fillRect(x - 15, y - 190, 30, 190);
    ctx.fillStyle = COLORS.goldBright;
    ctx.fillRect(x - 8, y - 10, 16, 20);
    ctx.strokeStyle = COLORS.gold;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, 21 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawEnvelope(x, y - 46 - Math.sin(state.time * 2.6) * 5, 26, 18, COLORS.gold);
  }

  function drawPlane(state) {
    const plane = state.plane;
    // The paper trail: a fading dotted wake behind the plane.
    for (const point of plane.trail) {
      const x = point.x - state.cameraX;
      if (x < -20 || x > W + 20) continue;
      ctx.globalAlpha = Math.max(0, point.life) * 0.4;
      ctx.fillStyle = '#cfd6f5';
      ctx.fillRect(x - 1.6, point.y - 1.6, 3.2, 3.2);
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

    panel(W / 2 - 118, 16, 236, 64);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 21px Georgia, serif';
    ctx.fillText(`Night ${state.night}`, W / 2, 44);
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`${state.nightDelivered} of ${state.quota} letters delivered`, W / 2, 66);

    panel(W - 218, 16, 200, 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('BEST', W - 34, 40);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillText(String(Math.max(best, state.score)), W - 34, 68);

    if (state.combo >= 2) {
      const frac = Math.max(0, state.comboTimer / COMBO_WINDOW);
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
      ctx.fillText(`~ wind gust, ${arrow} ~`, W / 2, 108);
    }

    // The night clock: a slim bar along the bottom that empties as the moon sets.
    ctx.fillStyle = 'rgba(10,14,40,0.7)';
    ctx.fillRect(0, H - 12, W, 12);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(0, H - 12, W * Math.max(0, state.nightTime / NIGHT_SECONDS), 12);
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

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(5,7,20,0.34)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    drawEnvelope(W / 2, 128, 54, 38, COLORS.gold);
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 92px Georgia, "Times New Roman", serif';
    ctx.fillText('NIGHT MAIL', W / 2, 248);
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'italic 23px Georgia, serif';
    ctx.fillText('a paper plane over a sleeping city', W / 2, 288);

    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('Hold  SPACE,  ↑  or the MOUSE  to climb — release to glide down', W / 2, 356);
    ctx.fillText('Slip a letter through each window that glows gold. Chain deliveries for combos.', W / 2, 388);
    ctx.fillText('Mind the rooftops, ride the gusts, and finish the round before the moon sets.', W / 2, 420);

    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3.4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText('Press ENTER or click to take off', W / 2, 486);
    ctx.globalAlpha = 1;
    if (best > 0) {
      ctx.fillStyle = COLORS.inkDim;
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.fillText(`Best score so far: ${best}`, W / 2, 524);
    }
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText('P pauses · M mutes', W / 2, 688);
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

  function drawOver(state, best, isNewBest) {
    ctx.fillStyle = 'rgba(5,7,20,0.45)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 262, 148, 524, 396);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.goldBright;
    ctx.font = '700 45px Georgia, serif';
    ctx.fillText(state.overReason === 'dawn' ? 'Dawn Breaks' : 'Down in the Streets', W / 2, 216);
    ctx.fillStyle = COLORS.inkDim;
    ctx.font = 'italic 18px Georgia, serif';
    ctx.fillText(
      state.overReason === 'dawn' ? 'The moon set on the last letter.' : 'A rooftop ended the round.',
      W / 2, 248,
    );
    const rows = [
      ['Score', String(state.score)],
      ['Letters delivered', String(state.letters)],
      ['Best combo', `x${Math.max(1, state.bestCombo)}`],
      ['Nights flown', String(state.night)],
    ];
    ctx.font = '600 20px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = 302 + i * 40;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.inkDim;
      ctx.fillText(label, W / 2 - 190, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(value, W / 2 + 190, y);
    });
    if (isNewBest) {
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.gold;
      ctx.font = '700 19px system-ui, sans-serif';
      ctx.fillText('★ NEW BEST ★', W / 2, 302 + rows.length * 40 + 6);
    }
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 3.4);
    ctx.globalAlpha = pulse;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.gold;
    ctx.font = '700 23px system-ui, sans-serif';
    ctx.fillText('Press ENTER or click to fly again', W / 2, 516);
    ctx.globalAlpha = 1;
  }

  /** Draw one frame. `screen` is the shell's screen; best/isNewBest describe the saved record. */
  function draw(state, city, screen, best, isNewBest) {
    drawSky(state);
    drawStars(state);
    drawMoon(state);
    drawFarSkyline(state);
    drawBuildings(state, city);
    drawTarget(state);
    drawWindStreaks(state);
    drawPlane(state);
    drawParticles(state);
    drawTexts(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, best);
    if (screen === SCREEN_PLAY) drawBanner(state);
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,90,70,${(state.flash * 0.32).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best, isNewBest);
    // A soft vignette to close the frame.
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    vig.addColorStop(0, 'rgba(0,0,10,0)');
    vig.addColorStop(1, 'rgba(0,0,10,0.36)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  return { draw };
}
