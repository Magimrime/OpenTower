// ===== CAMERA SYSTEM =====
import { CAMERA_SPEED, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX, CAMERA_ZOOM_STEP, CAMERA_LERP } from './config.js';
import { clamp, lerp } from './utils/math.js';

export class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.zoom = 1;
        this.targetZoom = 1;
        this.shakeAmount = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeEnabled = true;
    }

    update(dt, input, canvasW, canvasH) {
        // keyboard pan
        let dx = 0, dy = 0;
        if (input.isKey('KeyW') || input.isKey('ArrowUp')) dy -= 1;
        if (input.isKey('KeyS') || input.isKey('ArrowDown')) dy += 1;
        if (input.isKey('KeyA') || input.isKey('ArrowLeft')) dx -= 1;
        if (input.isKey('KeyD') || input.isKey('ArrowRight')) dx += 1;
        const speed = CAMERA_SPEED / this.zoom;
        this.targetX += dx * speed * dt;
        this.targetY += dy * speed * dt;

        // middle mouse drag
        if (input.middleDragDelta.x !== 0 || input.middleDragDelta.y !== 0) {
            this.targetX -= input.middleDragDelta.x / this.zoom;
            this.targetY -= input.middleDragDelta.y / this.zoom;
            input.middleDragDelta.set(0, 0);
        }

        // scroll zoom anchored on the cursor
        if (input.scroll !== 0 && canvasW) {
            const factor = 1 + input.scroll * CAMERA_ZOOM_STEP;
            const newZoom = clamp(this.targetZoom * factor, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
            const mx = input.mouse.x, my = input.mouse.y;
            // keep the world point under the cursor fixed
            const wxBefore = (mx - canvasW / 2) / this.targetZoom + this.targetX;
            const wyBefore = (my - canvasH / 2) / this.targetZoom + this.targetY;
            const wxAfter = (mx - canvasW / 2) / newZoom + this.targetX;
            const wyAfter = (my - canvasH / 2) / newZoom + this.targetY;
            this.targetX += wxBefore - wxAfter;
            this.targetY += wyBefore - wyAfter;
            this.targetZoom = newZoom;
        }

        // smoothing
        this.x = lerp(this.x, this.targetX, CAMERA_LERP);
        this.y = lerp(this.y, this.targetY, CAMERA_LERP);
        this.zoom = lerp(this.zoom, this.targetZoom, CAMERA_LERP);

        // screen shake decay
        if (this.shakeAmount > 0.05) {
            this.shakeAmount *= Math.pow(0.0001, dt); // fast exponential decay
            const a = Math.random() * Math.PI * 2;
            this.shakeX = Math.cos(a) * this.shakeAmount;
            this.shakeY = Math.sin(a) * this.shakeAmount;
        } else {
            this.shakeAmount = 0;
            this.shakeX = 0;
            this.shakeY = 0;
        }
    }

    shake(intensity) {
        if (!this.shakeEnabled) return;
        this.shakeAmount = Math.min(16, this.shakeAmount + intensity);
    }

    focusOn(wx, wy) {
        this.targetX = wx;
        this.targetY = wy;
    }

    snapTo(wx, wy) {
        this.targetX = this.x = wx;
        this.targetY = this.y = wy;
    }

    screenToWorld(sx, sy, canvasW, canvasH) {
        return {
            x: (sx - canvasW / 2) / this.zoom + this.x,
            y: (sy - canvasH / 2) / this.zoom + this.y
        };
    }

    worldToScreen(wx, wy, canvasW, canvasH) {
        return {
            x: (wx - this.x) * this.zoom + canvasW / 2,
            y: (wy - this.y) * this.zoom + canvasH / 2
        };
    }

    applyTransform(ctx, canvasW, canvasH) {
        ctx.save();
        ctx.translate(canvasW / 2 + this.shakeX, canvasH / 2 + this.shakeY);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }

    getViewBounds(canvasW, canvasH) {
        const hw = canvasW / 2 / this.zoom;
        const hh = canvasH / 2 / this.zoom;
        return {
            left: this.x - hw,
            right: this.x + hw,
            top: this.y - hh,
            bottom: this.y + hh
        };
    }
}
