import type { InputState } from "./types";

/**
 * Shared input singleton. Keyboard listeners and the on-screen TouchControls
 * component both write into the same state object that Engine reads each frame.
 */
class InputManager {
  state: InputState = {
    moveX: 0,
    moveY: 0,
    sprint: false,
    jumpVault: false,
    handbrake: false,
    nitro: false,
    webSwing: false,
    drift: false,
    vehicleAction: false,
    cameraCycle: false,
    trailer: false,
    pause: false,
  };

  // Edge-triggered flags that should fire once per press. Consumers call
  // `consume(name)` after reacting so the same press isn't re-processed.
  private edges = new Set<keyof InputState>();
  private keyboardMove = { x: 0, y: 0 };
  private joystickMove = { x: 0, y: 0 };
  private touchThrottle = 0; // Gas/Brake buttons, combined with the joystick's y-axis
  private keysDown = new Set<string>();

  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("blur", this.onBlur);
  }

  stop() {
    this.started = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("blur", this.onBlur);
  }

  private onBlur = () => {
    this.keysDown.clear();
    this.keyboardMove = { x: 0, y: 0 };
    this.recomputeMove();
    this.state.sprint = false;
    this.state.handbrake = false;
    this.state.nitro = false;
    this.state.webSwing = false;
    this.state.drift = false;
  };

  private onContextMenu = (e: MouseEvent) => e.preventDefault();

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 2) {
      this.state.webSwing = true;
      this.edges.add("webSwing");
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.keysDown.has(e.code)) return;
    this.keysDown.add(e.code);
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        this.keyboardMove.y = 1;
        break;
      case "KeyS":
      case "ArrowDown":
        this.keyboardMove.y = -1;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.keyboardMove.x = -1;
        break;
      case "KeyD":
      case "ArrowRight":
        this.keyboardMove.x = 1;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.state.sprint = true;
        this.state.nitro = true;
        break;
      case "Space":
        this.state.jumpVault = true;
        this.state.handbrake = true;
        this.edges.add("jumpVault");
        break;
      case "KeyE":
        this.state.drift = true;
        this.edges.add("drift");
        break;
      case "KeyQ":
        this.state.webSwing = true;
        this.edges.add("webSwing");
        break;
      case "KeyF":
        this.state.vehicleAction = true;
        this.edges.add("vehicleAction");
        break;
      case "KeyC":
        this.state.cameraCycle = true;
        this.edges.add("cameraCycle");
        break;
      case "KeyV":
        this.state.trailer = true;
        this.edges.add("trailer");
        break;
      case "Escape":
      case "KeyP":
        this.state.pause = true;
        this.edges.add("pause");
        break;
    }
    this.recomputeMove();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        if (this.keyboardMove.y > 0) this.keyboardMove.y = 0;
        break;
      case "KeyS":
      case "ArrowDown":
        if (this.keyboardMove.y < 0) this.keyboardMove.y = 0;
        break;
      case "KeyA":
      case "ArrowLeft":
        if (this.keyboardMove.x < 0) this.keyboardMove.x = 0;
        break;
      case "KeyD":
      case "ArrowRight":
        if (this.keyboardMove.x > 0) this.keyboardMove.x = 0;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.state.sprint = false;
        this.state.nitro = false;
        break;
      case "Space":
        this.state.jumpVault = false;
        this.state.handbrake = false;
        break;
      case "KeyE":
        this.state.drift = false;
        break;
      case "KeyQ":
        this.state.webSwing = false;
        break;
    }
    this.recomputeMove();
  };

  private recomputeMove() {
    // Keyboard takes priority when active, otherwise use touch joystick.
    if (this.keyboardMove.x !== 0 || this.keyboardMove.y !== 0) {
      this.state.moveX = this.keyboardMove.x;
      this.state.moveY = this.keyboardMove.y;
    } else {
      this.state.moveX = this.joystickMove.x;
      this.state.moveY = Math.abs(this.joystickMove.y) > 0.05 ? this.joystickMove.y : this.touchThrottle;
    }
  }

  // --- Touch API (called by TouchControls.tsx) ---

  setJoystick(x: number, y: number) {
    // Invert X axis to fix inverted joystick movement (left/right was reversed)
    this.joystickMove.x = -x;
    this.joystickMove.y = y;
    this.recomputeMove();
  }

  /** Gas/Brake touch buttons: v = 1 (throttle), -1 (brake/reverse), 0 (released). */
  setThrottle(v: number) {
    this.touchThrottle = v;
    this.recomputeMove();
  }

  setButton(name: keyof InputState, pressed: boolean) {
    (this.state as any)[name] = pressed;
    if (pressed) this.edges.add(name);
  }

  pressEdge(name: keyof InputState) {
    (this.state as any)[name] = true;
    this.edges.add(name);
  }

  wasPressed(name: keyof InputState): boolean {
    return this.edges.has(name);
  }

  /** Marks an edge-triggered press as handled so it isn't processed again this frame. */
  consume(name: keyof InputState) {
    this.edges.delete(name);
  }

  /** Call once per frame after Engine has processed edge flags. */
  endFrame() {
    this.edges.clear();
  }
}

export const input = new InputManager();
