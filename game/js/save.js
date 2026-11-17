// Night Mail's save: the player's whole standing, kept in the browser across visits.
// One versioned document under one key — the best score, and the campaign record from
// medals.js: per-route bests and medals, campaigns won, the Night Owl's unlock, the
// frontier a new run may start from, every upgrade ever collected into the postbag,
// and the checkpoint of a campaign still in progress, resumable where it left off.
//
// A save written by an older Night Mail is not thrown away: the two keys the game
// used before (a bare best score, a bare campaign record) are read once, folded in,
// and the result stored in the new shape. Everything read back is validated field by
// field — a corrupt or hand-edited save folds into a fresh one rather than breaking
// the title screen, and a route list that has grown since the save was written just
// leaves the new routes unflown. Storage itself may be unavailable (private windows,
// blocked cookies): every access is guarded, and the game simply plays unsaved then.

import { FINAL_ROUTE, ROUTES, UPGRADES } from './campaign.js';
import { MEDALS, createCampaignRecord } from './medals.js';

/** The one key the whole save lives under, and the two it migrates from. */
export const SAVE_KEY = 'night-mail-save-v4';
const LEGACY_BEST_KEY = 'night-mail-best-score';
const LEGACY_RECORD_KEY = 'night-mail-campaign-record';
const SAVE_VERSION = 4;

const UPGRADE_IDS = new Set(UPGRADES.map((u) => u.id));

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readKey(key) {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** A fresh save: nothing flown, nothing held, no campaign in progress. */
export function emptySave() {
  return { version: SAVE_VERSION, best: 0, record: createCampaignRecord(ROUTES.length) };
}

function cleanScore(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cleanMedal(value) {
  return MEDALS.includes(value) ? value : null;
}

function cleanUpgradeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => UPGRADE_IDS.has(id)))];
}

/**
 * One route result of a checkpoint, cleaned: a real route, a real score, a real
 * medal or none. Anything else about the entry is dropped, not trusted.
 */
function cleanRouteResult(value) {
  if (!value || !Number.isInteger(value.route) || value.route < 0 || value.route > FINAL_ROUTE) return null;
  return { route: value.route, score: cleanScore(value.score), medal: cleanMedal(value.medal) };
}

/**
 * A checkpoint, cleaned into world.resumeRun's shape, or null when what was stored
 * is not one: the route it resumes at, the score and letters banked by then, the
 * upgrades aboard, and the results of the routes already flown in that run.
 */
function cleanCheckpoint(value) {
  if (!value || !Number.isInteger(value.route) || value.route < 0 || value.route > FINAL_ROUTE) return null;
  return {
    route: value.route,
    score: cleanScore(value.score),
    letters: cleanScore(value.letters),
    upgrades: cleanUpgradeList(value.upgrades),
    routeResults: Array.isArray(value.routeResults)
      ? value.routeResults.map(cleanRouteResult).filter(Boolean)
      : [],
  };
}

/**
 * Fold an untrusted parsed record into a fresh one, field by field. The frontier is
 * never trusted past what the medals and results support — it is rebuilt from the
 * flown routes, so a save cannot unlock the Warden by being edited — and never
 * behind the checkpoint's own route, which its run reached honestly.
 */
function cleanRecord(parsed) {
  const record = createCampaignRecord(ROUTES.length);
  if (!parsed || typeof parsed !== 'object') return record;
  if (Array.isArray(parsed.routes)) {
    parsed.routes.slice(0, ROUTES.length).forEach((slot, i) => {
      if (!slot) return;
      record.routes[i].best = cleanScore(slot.best);
      record.routes[i].medal = cleanMedal(slot.medal);
    });
  }
  record.wins = cleanScore(parsed.wins);
  record.owlUnlocked = Boolean(parsed.owlUnlocked) || record.wins > 0;
  record.collected = cleanUpgradeList(parsed.collected);
  record.checkpoint = cleanCheckpoint(parsed.checkpoint);
  let frontier = 0;
  record.routes.forEach((slot, i) => {
    if (slot.best > 0 || slot.medal) frontier = Math.max(frontier, Math.min(FINAL_ROUTE, i + 1));
  });
  if (record.checkpoint) {
    frontier = Math.max(frontier, record.checkpoint.route);
    for (const result of record.checkpoint.routeResults) {
      frontier = Math.max(frontier, Math.min(FINAL_ROUTE, result.route + 1));
    }
  }
  if (record.owlUnlocked) frontier = FINAL_ROUTE;
  record.frontier = frontier;
  return record;
}

/**
 * Load the save: the current key first; failing that, the two legacy keys folded
 * together (the migration a returning pilot from an older Night Mail is owed);
 * failing everything, a fresh save. Never throws.
 */
export function loadSave() {
  const save = emptySave();
  try {
    const parsed = JSON.parse(readKey(SAVE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      save.best = cleanScore(parsed.best);
      save.record = cleanRecord(parsed.record);
      return save;
    }
  } catch {
    // A corrupt current save falls through to the legacy keys, then to fresh.
  }
  save.best = cleanScore(Number.parseInt(readKey(LEGACY_BEST_KEY) ?? '0', 10));
  try {
    save.record = cleanRecord(JSON.parse(readKey(LEGACY_RECORD_KEY) ?? 'null'));
  } catch {
    save.record = createCampaignRecord(ROUTES.length);
  }
  return save;
}

/** Store the save. Unavailable storage is not an error: the visit just goes unsaved. */
export function storeSave(save) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Full or blocked storage: the game plays on; the save lasts this visit only.
  }
}

/** Erase the save and both legacy keys, and hand back the fresh save that replaces it. */
export function eraseSave() {
  const store = storage();
  if (store) {
    try {
      store.removeItem(SAVE_KEY);
      store.removeItem(LEGACY_BEST_KEY);
      store.removeItem(LEGACY_RECORD_KEY);
    } catch {
      // Nothing to erase from storage that cannot be reached.
    }
  }
  return emptySave();
}
