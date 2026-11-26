// Keyboard and pointer input. Held keys and the pointer give two steering axes and a boost;
// one-shot presses (start or restart, pause) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const BOOST = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let pointer = null; // {x, y} in 0..1 page fractions while the pointer is down or moving

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (
      LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) ||
      DOWN.has(event.code) || BOOST.has(event.code)
    ) {
      held.add(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    pointer = null;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    pointer = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
  });
  window.addEventListener('pointermove', (event) => {
    if (pointer !== null || event.pointerType === 'mouse') {
      pointer = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
    }
  });
  window.addEventListener('pointerup', () => {
    pointer = null;
  });

  const any = (set) => {
    for (const code of set) if (held.has(code)) return true;
    return false;
  };

  return {
    /**
     * Steering axes in -1..1: x is -1 left / 1 right, y is -1 dive / 1 climb. Keys win when
     * held; otherwise the pointer steers toward where it sits on the screen.
     */
    axes() {
      let x = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0);
      let y = (any(UP) ? 1 : 0) - (any(DOWN) ? 1 : 0);
      if (x === 0 && y === 0 && pointer !== null) {
        x = Math.max(-1, Math.min(1, (pointer.x - 0.5) * 2.6));
        y = Math.max(-1, Math.min(1, (0.5 - pointer.y) * 2.6));
        if (Math.abs(x) < 0.08) x = 0;
        if (Math.abs(y) < 0.08) y = 0;
      }
      return { x, y };
    },
    boost() {
      return any(BOOST);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
