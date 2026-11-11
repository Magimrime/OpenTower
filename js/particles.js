// ===== PARTICLES & FLOATING TEXT =====
import { randomRange } from './utils/math.js';
import { getGlowSprite } from './utils/sprites.js';

const MAX_PARTICLES = 800;

// kinds: 'dot' (flat square, cheap), 'glow' (additive soft circle),
// 'smoke' (growing fading puff), 'ring' (expanding shockwave),
// 'spark' (streak with gravity), 'shard' (spinning rect debris)
class Particle {
    constructor() { this.dead = true; }

    init(kind, x, y, opts) {
        this.kind = kind;
        this.x = x; this.y = y;
        this.vx = opts.vx || 0;
        this.vy = opts.vy || 0;
        this.life = opts.life || 0.6;
        this.maxLife = this.life;
        this.color = opts.color || '#ffaa00';
        this.size = opts.size || 3;
        this.endSize = opts.endSize !== undefined ? opts.endSize : this.size;
        this.gravity = opts.gravity || 0;
        this.drag = opts.drag !== undefined ? opts.drag : 1;
        this.rot = opts.rot || 0;
        this.rotSpeed = opts.rotSpeed || 0;
        this.dead = false;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        if (this.drag !== 1) {
            const d = Math.pow(this.drag, dt * 60);
            this.vx *= d; this.vy *= d;
        }
        this.rot += this.rotSpeed * dt;
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }
}

export class ParticleSystem {
    constructor() {
        this.pool = [];
        this.active = [];
    }

    _spawn(kind, x, y, opts) {
        if (this.active.length >= MAX_PARTICLES) {
            // recycle the oldest
            const oldest = this.active.shift();
            oldest.init(kind, x, y, opts);
            this.active.push(oldest);
            return;
        }
        const p = this.pool.pop() || new Particle();
        p.init(kind, x, y, opts);
        this.active.push(p);
    }

    update(dt) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i];
            p.update(dt);
            if (p.dead) {
                this.pool.push(p);
                const last = this.active.pop();
                if (i < this.active.length) this.active[i] = last;
            }
        }
    }

    draw(ctx) {
        // pass 1: normal blending (smoke, dots, shards)
        for (const p of this.active) {
            const t = p.life / p.maxLife;
            if (p.kind === 'smoke') {
                const size = p.size + (p.endSize - p.size) * (1 - t);
                ctx.globalAlpha = t * 0.45;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.kind === 'dot') {
                ctx.globalAlpha = t;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            } else if (p.kind === 'shard') {
                ctx.globalAlpha = t;
                ctx.fillStyle = p.color;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                ctx.restore();
            }
        }
        // pass 2: additive (glow, sparks, rings)
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.active) {
            const t = p.life / p.maxLife;
            if (p.kind === 'glow') {
                const size = p.size + (p.endSize - p.size) * (1 - t);
                ctx.globalAlpha = t * 0.85;
                const sprite = getGlowSprite(p.color, 32);
                ctx.drawImage(sprite, p.x - size, p.y - size, size * 2, size * 2);
            } else if (p.kind === 'spark') {
                ctx.globalAlpha = t;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(0.8, p.size * t);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
                ctx.stroke();
            } else if (p.kind === 'ring') {
                const size = p.size + (p.endSize - p.size) * (1 - t);
                ctx.globalAlpha = t * 0.7;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2.5 * t + 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    // ---------- emitters ----------
    burst(x, y, count, kind, optsFn) {
        for (let i = 0; i < count; i++) this._spawn(kind, x, y, optsFn(i));
    }

    explosion(x, y, scale = 1) {
        const colors = ['#ff5522', '#ff8833', '#ffcc44', '#ffe88a'];
        this.burst(x, y, Math.round(10 * scale), 'glow', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(20, 130) * scale;
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.3, 0.7),
                color: colors[Math.random() * colors.length | 0],
                size: randomRange(4, 9) * scale, endSize: 1, drag: 0.9
            };
        });
        this.burst(x, y, Math.round(8 * scale), 'spark', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(90, 260) * scale;
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.25, 0.5),
                color: '#ffdd88', size: 2, gravity: 300, drag: 0.96
            };
        });
        this.burst(x, y, Math.round(4 * scale), 'smoke', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(10, 40);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s - 15,
                life: randomRange(0.8, 1.4),
                color: '#3a3632', size: 4 * scale, endSize: 14 * scale, drag: 0.94
            };
        });
        this._spawn('ring', x, y, {
            life: 0.35, color: '#ffcc88', size: 4 * scale, endSize: 34 * scale
        });
    }

    enemyDeath(x, y, color, scale = 1) {
        this.burst(x, y, Math.round(8 * scale), 'shard', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(40, 150) * scale;
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.4, 0.8),
                color, size: randomRange(3, 6) * scale,
                gravity: 240, drag: 0.94,
                rot: Math.random() * Math.PI, rotSpeed: randomRange(-9, 9)
            };
        });
        this.burst(x, y, 5, 'glow', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(15, 70) * scale;
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: 0.4, color: '#ffffff', size: 4 * scale, endSize: 1, drag: 0.9
            };
        });
    }

    hitSpark(x, y, color = '#ffee99') {
        this.burst(x, y, 5, 'spark', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(50, 160);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.12, 0.3),
                color, size: 1.6, gravity: 200, drag: 0.95
            };
        });
    }

    buildHit(x, y) {
        this.burst(x, y, 4, 'dot', () => {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
            const s = randomRange(25, 70);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.3, 0.55),
                color: ['#c8a068', '#a88a58', '#e0c088'][Math.random() * 3 | 0],
                size: randomRange(1.6, 3), gravity: 320
            };
        });
    }

    constructionDust(x, y, size = 1) {
        this.burst(x, y, 10, 'smoke', () => {
            const a = Math.random() * Math.PI * 2;
            const s = randomRange(20, 60) * size;
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 10,
                life: randomRange(0.5, 1),
                color: '#8a7a5e', size: 3 * size, endSize: 10 * size, drag: 0.92
            };
        });
        this._spawn('ring', x, y, { life: 0.4, color: '#d8c8a0', size: 6, endSize: 26 * size });
    }

    resourceGather(x, y, color) {
        this.burst(x, y, 3, 'dot', () => {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
            const s = randomRange(20, 55);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.3, 0.5), color, size: randomRange(1.8, 3), gravity: 240
            };
        });
    }

    deposit(x, y, color) {
        this.burst(x, y, 6, 'glow', () => {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
            const s = randomRange(25, 60);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.3, 0.6), color, size: 3, endSize: 0.5, drag: 0.93
            };
        });
    }

    muzzle(x, y, angle, color = '#ffdd66') {
        this.burst(x, y, 3, 'spark', () => {
            const a = angle + (Math.random() - 0.5) * 0.6;
            const s = randomRange(80, 200);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.08, 0.18), color, size: 1.6, drag: 0.9
            };
        });
    }

    smokeTrail(x, y) {
        this._spawn('smoke', x, y, {
            vx: randomRange(-8, 8), vy: randomRange(-8, 8),
            life: randomRange(0.35, 0.7),
            color: '#5a564e', size: 2.4, endSize: 7, drag: 0.95
        });
    }

    laserImpact(x, y, color) {
        this.burst(x, y, 2, 'glow', () => ({
            vx: randomRange(-30, 30), vy: randomRange(-30, 30),
            life: 0.2, color, size: 4, endSize: 1
        }));
    }

    teleportEffect(x, y) {
        this.burst(x, y, 22, 'glow', () => {
            const a = Math.random() * Math.PI * 2;
            const r = randomRange(4, 40);
            return {
                vx: Math.cos(a) * -r * 2.2, vy: Math.sin(a) * -r * 2.2,
                life: randomRange(0.4, 0.9),
                color: ['#cc44ff', '#8822cc', '#ff88ff'][Math.random() * 3 | 0],
                size: randomRange(2, 5), endSize: 0.5
            };
        });
        this._spawn('ring', x, y, { life: 0.5, color: '#cc66ff', size: 6, endSize: 46 });
    }

    upgradeEffect(x, y) {
        this.burst(x, y, 14, 'glow', () => {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2;
            const s = randomRange(30, 110);
            return {
                vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                life: randomRange(0.4, 0.8),
                color: ['#ffd700', '#ffee88', '#ffffff'][Math.random() * 3 | 0],
                size: 3, endSize: 0.5, gravity: -40, drag: 0.95
            };
        });
        this._spawn('ring', x, y, { life: 0.45, color: '#ffd700', size: 8, endSize: 38 });
    }
}

// ---------- FLOATING TEXT ----------
class FloatingText {
    constructor() { this.dead = true; }
    init(x, y, text, opts) {
        this.x = x; this.y = y;
        this.text = text;
        this.color = opts.color || '#ffffff';
        this.life = opts.life || 0.9;
        this.maxLife = this.life;
        this.vy = opts.vy !== undefined ? opts.vy : -34;
        this.size = opts.size || 12;
        this.stroke = opts.stroke !== undefined ? opts.stroke : true;
        this.dead = false;
    }
    update(dt) {
        this.y += this.vy * dt;
        this.vy *= Math.pow(0.92, dt * 60);
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
    }
}

export class FloatingTextSystem {
    constructor() {
        this.pool = [];
        this.active = [];
        this.enabled = true;
    }

    add(x, y, text, opts = {}) {
        if (!this.enabled) return;
        if (this.active.length > 60) this.active.shift();
        const ft = this.pool.pop() || new FloatingText();
        ft.init(x, y, text, opts);
        this.active.push(ft);
    }

    update(dt) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const ft = this.active[i];
            ft.update(dt);
            if (ft.dead) {
                this.pool.push(ft);
                const last = this.active.pop();
                if (i < this.active.length) this.active[i] = last;
            }
        }
    }

    draw(ctx, zoom) {
        if (this.active.length === 0) return;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const ft of this.active) {
            const t = ft.life / ft.maxLife;
            ctx.globalAlpha = Math.min(1, t * 2);
            // keep text readable regardless of zoom
            const px = Math.max(9, ft.size / Math.max(0.5, Math.sqrt(zoom)));
            ctx.font = `700 ${px}px Rajdhani, sans-serif`;
            if (ft.stroke) {
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.strokeText(ft.text, ft.x, ft.y);
            }
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1;
    }
}
