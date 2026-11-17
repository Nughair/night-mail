// Night Mail's shell: it owns the canvas, the screen the player is on (title, campaign,
// play, paused, results), the fixed-step loop, the save (save.js: the best score, the
// campaign record, and the checkpoint a campaign in progress resumes from), and turning
// world events into sounds and announcements. The world simulates, the renderer draws,
// this file conducts.
//
// ?seed=N fixes the city. ?shot=title|campaign|boss|draft|over (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EV_CLIP, EV_CRASH, EV_DELIVER, EV_DOVE, EV_DRAFT, EV_FRAGILE, EV_GUST,
  EV_LATE, EV_NEAR_MISS, EV_OVER,
} from './world.js';
import {
  ACTION_CAMPAIGN, ACTION_CONFIRM, ACTION_DOWN, ACTION_ERASE, ACTION_MUTE, ACTION_OWL,
  ACTION_PAUSE, ACTION_UP, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_CAMPAIGN, SCREEN_DRAFT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE,
} from './render.js';
import { FINAL_ROUTE, ROUTES, campaignRowAt, draftCardAt, upgradeById } from './campaign.js';
import { recordRouteResult } from './medals.js';
import { eraseSave, loadSave, storeSave } from './save.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

if (shotName) {
  const scene = stageShot(shotName, seed);
  let painted = 0;
  const paint = () => {
    renderer.draw(scene.world.state, scene.world.city, scene.screen, scene.best, scene.isNewBest, { record: scene.record ?? null });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  const world = createWorld(createRandom(seed));
  const input = createInput(canvas);
  const audio = createAudio();
  let save = loadSave();
  let record = save.record;
  let best = save.best;
  let screen = SCREEN_TITLE;
  let isNewBest = false;
  let lastMode = 'campaign';
  let mapCursor = record.checkpoint ? record.checkpoint.route : record.frontier;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  /** Write the save back: the record and the best score, as they now stand. */
  function persist() {
    save.best = best;
    save.record = record;
    storeSave(save);
  }

  /**
   * Fold the world's present standing into the record and save it: the frontier
   * every cleared route has earned, the postbag every drafted upgrade joins, and —
   * while a campaign is in progress — its checkpoint. Called whenever a route
   * begins, so the save never claims more than the run has truly flown.
   */
  function saveCheckpoint() {
    const snap = world.snapshot();
    if (!snap) return;
    record.checkpoint = snap;
    for (const id of snap.upgrades) {
      if (!record.collected.includes(id)) record.collected.push(id);
    }
    for (const result of snap.routeResults) {
      record.frontier = Math.max(record.frontier, Math.min(FINAL_ROUTE, result.route + 1));
    }
    persist();
  }

  function startRun() {
    audio.unlock();
    audio.click();
    audio.startMelody();
    world.startRun();
    lastMode = 'campaign';
    isNewBest = false;
    screen = SCREEN_PLAY;
    saveCheckpoint();
    announce(`Night 1, ${ROUTES[0].name}. Deliver ${world.state.quota} letters before the moon sets.`);
  }

  /** Begin (or resume) the campaign the save holds: the checkpoint, if there is one. */
  function continueCampaign() {
    const checkpoint = record.checkpoint;
    if (!checkpoint) {
      startRun();
      return;
    }
    audio.unlock();
    audio.click();
    audio.startMelody();
    world.resumeRun(checkpoint);
    lastMode = 'campaign';
    isNewBest = false;
    screen = SCREEN_PLAY;
    announce(`Welcome back. Night ${checkpoint.route + 1}, ${ROUTES[checkpoint.route].name}: the campaign resumes at ${checkpoint.score} points.`);
  }

  /** Fly the campaign from the map's picked night: a fresh run, starting there. */
  function startRunAt(index) {
    audio.unlock();
    audio.click();
    audio.startMelody();
    world.startRunAt(index);
    lastMode = 'campaign';
    isNewBest = false;
    screen = SCREEN_PLAY;
    saveCheckpoint();
    announce(`Night ${index + 1}, ${ROUTES[index].name}. Deliver ${world.state.quota} letters before the moon sets.`);
  }

  function startOwlRun() {
    audio.unlock();
    audio.click();
    audio.startMelody();
    world.startOwlRun();
    lastMode = 'owl';
    isNewBest = false;
    screen = SCREEN_PLAY;
    announce('The Night Owl: the endless night. Fly until dawn or a rooftop says otherwise.');
  }

  /**
   * Fold a finished run into the saved campaign record: medals and bests per route,
   * the frontier they earn, the postbag, the win and the Owl. The run is over, so
   * its checkpoint goes with it — the next campaign starts from the map, not here.
   */
  function foldRecord() {
    const state = world.state;
    if (state.mode !== 'campaign') return;
    for (const result of state.routeResults) {
      recordRouteResult(record, result.route, result.score, ROUTES[result.route]);
      record.frontier = Math.max(record.frontier, Math.min(FINAL_ROUTE, result.route + 1));
    }
    for (const id of state.upgrades) {
      if (!record.collected.includes(id)) record.collected.push(id);
    }
    if (state.won) {
      record.wins += 1;
      record.owlUnlocked = true;
      record.frontier = FINAL_ROUTE;
    }
    record.checkpoint = null;
    persist();
  }

  function endRun() {
    screen = SCREEN_OVER;
    foldRecord();
    if (world.state.score > best) {
      best = world.state.score;
      isNewBest = true;
      persist();
    }
    if (world.state.won) {
      audio.fanfare();
      announce(`Campaign complete! Score ${world.state.score}. Every route flown, the Storm Warden beaten — the Night Owl is unlocked.`);
    } else {
      announce(`Run over. Score ${world.state.score}. ${world.state.letters} letters delivered.`);
    }
  }

  function react(events) {
    const state = world.state;
    if (events & EV_DELIVER) audio.chime(state.combo);
    if (events & EV_NEAR_MISS) audio.whoosh();
    if (events & EV_CLIP) {
      audio.whoosh();
      announce('Clipped a rooftop — the reinforced wings hold.');
    }
    if (events & EV_DOVE) {
      audio.whoosh();
      announce('Doves! The flock scattered the plane and broke the combo.');
    }
    if (events & EV_DRAFT) {
      audio.fanfare();
      screen = SCREEN_DRAFT;
      saveCheckpoint();
      const names = state.draft.choices.map((id) => upgradeById(id)?.name ?? id).join(', ');
      announce(`Route flown. Choose one upgrade: ${names}. Press 1, 2 or 3, or click a card.`);
    }
    if (events & EV_GUST) announce(state.gust.dir > 0 ? 'A gust is pushing down.' : 'A gust is lifting you up.');
    if (events & EV_LATE) {
      audio.late();
      announce('Too late — the express letter was withdrawn.');
    }
    if (events & EV_FRAGILE) {
      audio.crack();
      announce('The fragile letter broke on the rooftop.');
    }
    if (events & EV_CRASH) audio.thud();
    if (events & EV_OVER) endRun();
  }

  /** Take one of the draft's cards (by index) and fly on to the next route. */
  function takeDraftPick(index) {
    const state = world.state;
    if (!state.draft || index < 0 || index >= state.draft.choices.length) return;
    const id = state.draft.choices[index];
    audio.unlock();
    if (world.pickUpgrade(id)) {
      audio.click();
      screen = SCREEN_PLAY;
      saveCheckpoint();
      const route = ROUTES[state.route];
      announce(`${upgradeById(id)?.name ?? id} aboard. ${route.boss ? 'The Storm Warden' : `Night ${state.night}, ${route.name}`}: deliver ${state.quota} letters.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_DRAFT) {
      // The draft answers to its own controls: number keys, or a click on a card.
      for (const pick of input.takePicks()) takeDraftPick(pick);
      const click = input.takeClick();
      if (click && screen === SCREEN_DRAFT) takeDraftPick(draftCardAt(click.x, click.y));
      return;
    }
    input.takePicks();
    const click = input.takeClick();
    if (screen === SCREEN_CAMPAIGN) {
      // The campaign map: the cursor picks a start night among the unlocked routes,
      // Enter (or a click on the picked row) flies from there, X erases the save,
      // and C, P or Esc returns to the title.
      if (actions & ACTION_UP) {
        mapCursor = Math.max(0, mapCursor - 1);
        audio.click();
      }
      if (actions & ACTION_DOWN) {
        mapCursor = Math.min(record.frontier, mapCursor + 1);
        audio.click();
      }
      if (click) {
        const row = campaignRowAt(click.x, click.y);
        if (row >= 0 && row <= record.frontier) {
          if (row === mapCursor) {
            startRunAt(mapCursor);
            return;
          }
          mapCursor = row;
          audio.click();
        }
      }
      if (actions & ACTION_ERASE) {
        save = eraseSave();
        record = save.record;
        best = save.best;
        mapCursor = 0;
        audio.click();
        announce('Save erased. No medals, no postbag, no campaign in progress — a fresh first night.');
        return;
      }
      if (actions & ACTION_CONFIRM) {
        startRunAt(mapCursor);
        return;
      }
      if (actions & (ACTION_CAMPAIGN | ACTION_PAUSE)) {
        screen = SCREEN_TITLE;
        announce('Night Mail. Press Enter or click to take off.');
      }
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CAMPAIGN) {
        audio.unlock();
        audio.click();
        mapCursor = record.checkpoint ? record.checkpoint.route : record.frontier;
        screen = SCREEN_CAMPAIGN;
        announce('The campaign map: twelve routes, a medal on every one, your save in full. Choose a start night and press Enter.');
        return;
      }
      if ((actions & ACTION_OWL) && record.owlUnlocked) {
        startOwlRun();
        return;
      }
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        if (record.checkpoint) continueCampaign();
        else startRun();
      } else if (screen === SCREEN_OVER) {
        if (lastMode === 'owl') startOwlRun();
        else startRun();
      } else if (screen === SCREEN_PAUSED) {
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
    // A click on the title or results screen confirms, like Enter does.
    if (click && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      if (screen === SCREEN_TITLE) {
        if (record.checkpoint) continueCampaign();
        else startRun();
      } else if (lastMode === 'owl') startOwlRun();
      else startRun();
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
    renderer.draw(world.state, world.city, screen, best, isNewBest, { record, cursor: mapCursor });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce(record.checkpoint
    ? `Night Mail. A campaign is in progress — Enter continues Night ${record.checkpoint.route + 1}, C opens the campaign map.`
    : 'Night Mail. Press Enter or click to take off, C for the campaign and its medals.');
  requestAnimationFrame(frame);
}
