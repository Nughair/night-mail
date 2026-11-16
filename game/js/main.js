// Night Mail's shell: it owns the canvas, the screen the player is on (title, play, paused,
// results), the fixed-step loop, the saved best score, and turning world events into sounds
// and announcements. The world simulates, the renderer draws, this file conducts.
//
// ?seed=N fixes the city. ?shot=title|play|late|over (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EV_CRASH, EV_DELIVER, EV_GUST, EV_NEAR_MISS, EV_NIGHT, EV_OVER } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const BEST_KEY = 'night-mail-best-score';
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be unavailable (private windows): the best then lasts this visit only.
  }
}

if (shotName) {
  const scene = stageShot(shotName, seed);
  let painted = 0;
  const paint = () => {
    renderer.draw(scene.world.state, scene.world.city, scene.screen, scene.best, scene.isNewBest);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  const world = createWorld(createRandom(seed));
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let isNewBest = false;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    audio.unlock();
    audio.click();
    audio.startMelody();
    world.startRun();
    isNewBest = false;
    screen = SCREEN_PLAY;
    announce(`Night 1. Deliver ${world.state.quota} letters before the moon sets.`);
  }

  function endRun() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      isNewBest = true;
      saveBest(best);
    }
    announce(`Run over. Score ${world.state.score}. ${world.state.letters} letters delivered.`);
  }

  function react(events) {
    const state = world.state;
    if (events & EV_DELIVER) audio.chime(state.combo);
    if (events & EV_NEAR_MISS) audio.whoosh();
    if (events & EV_NIGHT) {
      audio.fanfare();
      announce(`Night ${state.night}. Deliver ${state.quota} letters.`);
    }
    if (events & EV_GUST) announce(state.gust.dir > 0 ? 'A gust is pushing down.' : 'A gust is lifting you up.');
    if (events & EV_CRASH) audio.thud();
    if (events & EV_OVER) endRun();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startRun();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying again.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying again.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen !== SCREEN_PAUSED) {
      while (accumulator >= STEP) {
        const control = { climb: input.climb(), dive: input.dive() };
        react(world.step(STEP, control));
        accumulator -= STEP;
        if (screen === SCREEN_OVER) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, world.city, screen, best, isNewBest);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Night Mail. Press Enter or click to take off.');
  requestAnimationFrame(frame);
}
