// ===== PROJECTILE SYSTEM =====
import { GRID_SIZE } from './config.js';
import { getGlowSprite } from './utils/sprites.js';
import { angleLerp } from './utils/math.js';
import { audio } from './audio.js';

export class ProjectileManager {
    constructor() {
        this.projectiles = [];
    }

    spawn(type, opts) {
        const p = {
            type,
            x: opts.x, y: opts.y,
            target: opts.target || null,
            tx: opts.target ? opts.target.worldX : (opts.tx || 0),
            ty: opts.target ? opts.target.worldY : (opts.ty || 0),
            speed: opts.speed || 8 * GRID_SIZE,
            damage: opts.damage || 10,
            splash: opts.splash || 0,
            color: opts.color || '#ffaa00',
            angle: opts.angle !== undefined ? opts.angle : 0,
            age: 0,
            trailTimer: 0,
            startX: opts.x, startY: opts.y
        };
        if (type === 'bullet' || type === 'shell') {
            p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
        }
        this.projectiles.push(p);
    }

    // legacy hook kept so nothing breaks if old code pushes raw objects
    push(p) { this.projectiles.push(p); }

    update(dt, game) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.age += dt;
            let done = false;

            if (p.type === 'bullet') {
                done = this._updateDirect(p, dt, game, false);
            } else if (p.type === 'shell') {
                p.trailTimer += dt;
                if (p.trailTimer > 0.03) {
                    p.trailTimer = 0;
                    game.particles.smokeTrail(p.x, p.y - this._arcHeight(p));
                }
                done = this._updateDirect(p, dt, game, true);
            } else if (p.type === 'missile') {
                done = this._updateMissile(p, dt, game);
            } else if (p.type === 'beam') {
                p.life = (p.life ?? 0.1) - dt;
                done = p.life <= 0;
            }

            if (done) this.projectiles.splice(i, 1);
        }
    }

    _updateDirect(p, dt, game, isShell) {
        // track a live target's position; dead targets keep last position
        if (p.target && !p.target.dead) {
            p.tx = p.target.worldX;
            p.ty = p.target.worldY;
        }
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const move = p.speed * dt;
        p.angle = Math.atan2(dy, dx);
        if (dist <= move) {
            this._impact(p, game, isShell);
            return true;
        }
        p.x += (dx / dist) * move;
        p.y += (dy / dist) * move;
        return false;
    }

    _updateMissile(p, dt, game) {
        if (p.target && !p.target.dead) {
            p.tx = p.target.worldX;
            p.ty = p.target.worldY;
        }
        const desired = Math.atan2(p.ty - p.y, p.tx - p.x);
        // accelerating launch with limited turn rate
        const turnRate = 5 + p.age * 6;
        p.angle = angleLerp(p.angle, desired, Math.min(1, turnRate * dt));
        const speed = p.speed * Math.min(1, 0.35 + p.age * 1.4);
        p.x += Math.cos(p.angle) * speed * dt;
        p.y += Math.sin(p.angle) * speed * dt;

        p.trailTimer += dt;
        if (p.trailTimer > 0.025) {
            p.trailTimer = 0;
            game.particles.smokeTrail(p.x - Math.cos(p.angle) * 6, p.y - Math.sin(p.angle) * 6);
        }

        const dist = Math.hypot(p.tx - p.x, p.ty - p.y);
        if (dist < p.speed * dt * 1.2 || p.age > 6) {
            this._impact(p, game, true);
            return true;
        }
        return false;
    }

    _impact(p, game, explode) {
        if (p.splash > 0) {
            game.enemyMgr.queryCircle(p.tx, p.ty, p.splash, (e) => {
                if (e.dead) return;
                const d = Math.hypot(e.worldX - p.tx, e.worldY - p.ty);
                if (d <= p.splash) {
                    e.takeDamage(p.damage * (1 - (d / p.splash) * 0.5));
                }
            });
            game.particles.explosion(p.tx, p.ty, p.splash / (2.2 * GRID_SIZE) + 0.6);
            game.camera.shake(2.5);
            audio.play('explosion_small');
        } else if (p.target && !p.target.dead) {
            p.target.takeDamage(p.damage);
            game.particles.hitSpark(p.tx, p.ty, p.color);
            audio.play('hit');
        } else {
            game.particles.hitSpark(p.tx, p.ty, '#999999');
        }
    }

    _arcHeight(p) {
        // visual parabola for shells
        const total = Math.hypot(p.tx - p.startX, p.ty - p.startY) || 1;
        const traveled = Math.hypot(p.x - p.startX, p.y - p.startY);
        const t = Math.max(0, Math.min(1, traveled / total));
        return Math.sin(t * Math.PI) * total * 0.14;
    }

    draw(ctx) {
        for (const p of this.projectiles) {
            if (p.type === 'bullet') {
                // glowing tracer
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2.2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - Math.cos(p.angle) * 11, p.y - Math.sin(p.angle) * 11);
                ctx.stroke();
                ctx.drawImage(getGlowSprite(p.color, 32), p.x - 5, p.y - 5, 10, 10);
                ctx.restore();
            } else if (p.type === 'shell') {
                const arc = this._arcHeight(p);
                const y = p.y - arc;
                // ball with highlight
                ctx.fillStyle = '#2c2620';
                ctx.beginPath(); ctx.arc(p.x, y, 4.2, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#6a5f4e';
                ctx.beginPath(); ctx.arc(p.x - 1.2, y - 1.2, 1.6, 0, Math.PI * 2); ctx.fill();
                // ground shadow
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
            } else if (p.type === 'missile') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                // body
                ctx.fillStyle = '#c8c8d0';
                ctx.beginPath();
                ctx.moveTo(6, 0); ctx.lineTo(1, -2.4); ctx.lineTo(-5, -2.4);
                ctx.lineTo(-5, 2.4); ctx.lineTo(1, 2.4);
                ctx.closePath(); ctx.fill();
                // nose
                ctx.fillStyle = '#c8452a';
                ctx.beginPath();
                ctx.moveTo(6, 0); ctx.lineTo(2.5, -2); ctx.lineTo(2.5, 2);
                ctx.closePath(); ctx.fill();
                // fins
                ctx.fillStyle = '#8a8a94';
                ctx.beginPath();
                ctx.moveTo(-5, -2.4); ctx.lineTo(-7.5, -4.4); ctx.lineTo(-4, -1);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-5, 2.4); ctx.lineTo(-7.5, 4.4); ctx.lineTo(-4, 1);
                ctx.closePath(); ctx.fill();
                // exhaust flame
                ctx.globalCompositeOperation = 'lighter';
                const flick = 0.7 + Math.random() * 0.5;
                ctx.fillStyle = 'rgba(255,190,80,0.9)';
                ctx.beginPath();
                ctx.moveTo(-5, -1.4); ctx.lineTo(-5 - 7 * flick, 0); ctx.lineTo(-5, 1.4);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            } else if (p.type === 'beam') {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = Math.max(0, (p.life ?? 0) / 0.1);
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
                ctx.restore();
            }
        }
    }
}
