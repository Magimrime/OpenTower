// ===== INPUT MANAGER =====
import { Vec2 } from './utils/math.js';

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.keyJustPressed = {};
        this.mouse = new Vec2();
        this.mouseWorld = new Vec2();
        this.mouseOverUI = false;
        this.mouseDown = { left: false, middle: false, right: false };
        this.mouseJustDown = { left: false, middle: false, right: false };
        this.mouseJustUp = { left: false, middle: false, right: false };
        this.scroll = 0;
        this.dragStart = null;
        this.dragCurrent = null;
        this.isDragging = false;
        this.middleDragStart = null;
        this.middleDragDelta = new Vec2();
        this.boxSelect = null;

        this._bindEvents();
    }

    _bindEvents() {
        window.addEventListener('keydown', (e) => {
            // keep Tab/Space from stealing focus or scrolling while playing
            if ((e.code === 'Tab' || e.code === 'Space') && e.target === document.body) {
                e.preventDefault();
            }
            if (!this.keys[e.code]) this.keyJustPressed[e.code] = true;
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        window.addEventListener('blur', () => {
            this.keys = {};
        });

        // move/up on window so drags survive crossing UI panels
        window.addEventListener('mousemove', (e) => {
            this.mouse.set(e.clientX, e.clientY);
            this.mouseOverUI = e.target !== this.canvas;
            if (this.mouseDown.left && this.dragStart) {
                this.dragCurrent = this.mouse.clone();
                if (this.dragStart.distanceTo(this.dragCurrent) > 5) this.isDragging = true;
            }
            if (this.mouseDown.middle && this.middleDragStart) {
                this.middleDragDelta.set(
                    e.clientX - this.middleDragStart.x,
                    e.clientY - this.middleDragStart.y
                );
                this.middleDragStart.set(e.clientX, e.clientY);
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (e.button === 0) {
                this.mouseDown.left = true;
                this.mouseJustDown.left = true;
                this.dragStart = this.mouse.clone();
                this.dragCurrent = this.mouse.clone();
                this.isDragging = false;
            } else if (e.button === 1) {
                this.mouseDown.middle = true;
                this.mouseJustDown.middle = true;
                this.middleDragStart = this.mouse.clone();
            } else if (e.button === 2) {
                this.mouseDown.right = true;
                this.mouseJustDown.right = true;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                if (this.mouseDown.left) {
                    this.mouseJustUp.left = true;
                    if (this.isDragging) {
                        this.boxSelect = {
                            x1: Math.min(this.dragStart.x, this.dragCurrent.x),
                            y1: Math.min(this.dragStart.y, this.dragCurrent.y),
                            x2: Math.max(this.dragStart.x, this.dragCurrent.x),
                            y2: Math.max(this.dragStart.y, this.dragCurrent.y)
                        };
                    }
                }
                this.mouseDown.left = false;
                this.dragStart = null;
                this.dragCurrent = null;
                this.isDragging = false;
            } else if (e.button === 1) {
                this.mouseDown.middle = false;
                this.mouseJustUp.middle = true;
                this.middleDragStart = null;
                this.middleDragDelta.set(0, 0);
            } else if (e.button === 2) {
                if (this.mouseDown.right) this.mouseJustUp.right = true;
                this.mouseDown.right = false;
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.scroll = -Math.sign(e.deltaY);
        }, { passive: false });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    isKey(code) { return !!this.keys[code]; }
    isKeyJust(code) { return !!this.keyJustPressed[code]; }
    isCtrl() { return this.keys['ControlLeft'] || this.keys['ControlRight']; }
    isShift() { return this.keys['ShiftLeft'] || this.keys['ShiftRight']; }

    getBoxSelect() {
        const bs = this.boxSelect;
        this.boxSelect = null;
        return bs;
    }

    endFrame() {
        this.keyJustPressed = {};
        this.mouseJustDown = { left: false, middle: false, right: false };
        this.mouseJustUp = { left: false, middle: false, right: false };
        this.scroll = 0;
    }

    updateMouseWorld(camera) {
        this.mouseWorld.set(
            (this.mouse.x - this.canvas.width / 2) / camera.zoom + camera.x,
            (this.mouse.y - this.canvas.height / 2) / camera.zoom + camera.y
        );
    }
}
