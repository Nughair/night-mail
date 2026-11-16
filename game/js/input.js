// Keyboard and mouse input. Flight is read as held state every frame (is the climb key down
// right now?), while menus use one-shot actions that queue up until the game takes them.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CLIMB_CODES = new Set(['ArrowUp', 'KeyW', 'Space']);
const DIVE_CODES = new Set(['ArrowDown', 'KeyS']);

export function createInput(canvas) {
  const held = new Set();
  let pointerHeld = false;
  let queued = 0;

  function onKeyDown(event) {
    if (CLIMB_CODES.has(event.code) || DIVE_CODES.has(event.code) || event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
    }
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') queued |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') queued |= ACTION_PAUSE;
    if (event.code === 'KeyM') queued |= ACTION_MUTE;
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onPointerDown(event) {
    event.preventDefault();
    pointerHeld = true;
    queued |= ACTION_CONFIRM;
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
