// Keyboard and mouse input. Flight is read as held state every frame (is the climb key down
// right now?), while menus use one-shot actions that queue up until the game takes them.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CLIMB_CODES = new Set(['ArrowUp', 'KeyW', 'Space']);
const DIVE_CODES = new Set(['ArrowDown', 'KeyS']);

const PICK_CODES = new Map([['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Numpad1', 0], ['Numpad2', 1], ['Numpad3', 2]]);

export function createInput(canvas) {
  const held = new Set();
  let pointerHeld = false;
  let queued = 0;
  const picks = [];
  let click = null;

  function onKeyDown(event) {
    if (CLIMB_CODES.has(event.code) || DIVE_CODES.has(event.code) || event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
    }
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') queued |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') queued |= ACTION_PAUSE;
    if (event.code === 'KeyM') queued |= ACTION_MUTE;
    if (PICK_CODES.has(event.code)) picks.push(PICK_CODES.get(event.code));
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onPointerDown(event) {
    event.preventDefault();
    pointerHeld = true;
    queued |= ACTION_CONFIRM;
    // Where on the stage the click fell, in the canvas's own 1280x720 coordinates:
    // the draft screen hit-tests its cards against this.
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      click = {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      };
    }
  }

  function onPointerUp() {
    pointerHeld = false;
  }

  function onBlur() {
    held.clear();
    pointerHeld = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  return {
    /** True while any climb control is held: Up, W, Space, or the mouse button. */
    climb() {
      if (pointerHeld) return true;
      for (const code of CLIMB_CODES) if (held.has(code)) return true;
      return false;
    },
    /** True while any dive control is held: Down or S. */
    dive() {
      for (const code of DIVE_CODES) if (held.has(code)) return true;
      return false;
    },
    /** Take the queued one-shot actions, clearing the queue. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    /** Take the queued draft picks (card indices from the number keys), clearing them. */
    takePicks() {
      const taken = picks.slice();
      picks.length = 0;
      return taken;
    },
    /** Take the last click's stage coordinates, or null when there was none. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
