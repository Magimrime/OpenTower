// ===== SOLDIER SYSTEM =====
// Soldiers are trained at the Armory. They hold a guard post, engage
// enemies that come near, chase within a leash, and walk through gates.
import { GRID_SIZE, SOLDIER_CONFIG, MAX_SOLDIERS } from './config.js';
import { hash2 } from './utils/math.js';
import { audio } from './audio.js';

let nextSoldierId = 1;

export class Soldier {
    constructor(gx, gy) {
        this.id = nextSoldierId++;
        this.gx = gx;
        this.gy = gy;
        this.worldX = gx * GRID_SIZE + GRID_SIZE / 2;
        this.worldY = gy * GRID_SIZE + GRID_SIZE / 2;
        this.hp = SOLDIER_CONFIG.hp;
        this.maxHp = SOLDIER_CONFIG.hp;
        this.dead = false;
        this.selected = false;

        this.guardX = this.worldX;
        this.guardY = this.worldY;
        this.target = null;
        this.fireTimer = Math.random();
        this.scanTimer = Math.random() * 0.25;
        this.path = null;
        this.pathIndex = 0;
        this.state = 'idle'; // idle | moving | chasing

        // animation
        this.facing = Math.random() < 0.5 ? -1 : 1;
        this.walkPhase = Math.random() * Math.PI * 2;
        this.aimAngle = 0;

        this.offX = (hash2(this.id, 3) - 0.5) * GRID_SIZE * 0.8;
        this.offY = (hash2(this.id, 9) - 0.5) * GRID_SIZE * 0.8;
    }

    takeDamage(amount, game) {
        if (this.dead) return;
        this.hp -= amount;
        game.particles.hitSpark(this.worldX, this.worldY - 10, '#aac8ff');
        if (this.hp <= 0) this.dead = true;
    }

    commandMove(gx, gy, game) {
        this.state = 'moving';
        this.target = null;
        this.path = game.pathfinder.findPath(this.gx, this.gy, gx, gy);
        this.pathIndex = 0;
        this.guardX = gx * GRID_SIZE + GRID_SIZE / 2 + this.offX * 0.6;
        this.guardY = gy * GRID_SIZE + GRID_SIZE / 2 + this.offY * 0.6;
        if (!this.path) {
            this.state = 'idle';
            this.guardX = this.worldX;
            this.guardY = this.worldY;
        }
    }

    update(dt, game) {
        this.gx = Math.floor(this.worldX / GRID_SIZE);
        this.gy = Math.floor(this.worldY / GRID_SIZE);
        const cfg = SOLDIER_CONFIG;

        // periodic target acquisition
        this.scanTimer -= dt;
        if (this.scanTimer <= 0) {
            this.scanTimer = 0.25;
            if (!this.target || this.target.dead) {
                this.target = game.enemyMgr.findNearest(this.worldX, this.worldY, cfg.engageRange * GRID_SIZE);
            }
        }
        if (this.target && this.target.dead) this.target = null;

        // a direct move order runs to completion first
        if (this.state === 'moving' && this.path) {
            this._followPath(dt, game);
            return;
        }

        const distToGuard = Math.hypot(this.guardX - this.worldX, this.guardY - this.worldY);

        if (this.target) {
            const d = Math.hypot(this.target.worldX - this.worldX, this.target.worldY - this.worldY);
            this.aimAngle = Math.atan2(this.target.worldY - (this.worldY - 3), this.target.worldX - this.worldX);
            this.facing = this.target.worldX >= this.worldX ? 1 : -1;

            if (d <= cfg.range * GRID_SIZE) {
                // hold position and fire
                this.state = 'idle';
                this.fireTimer += dt;
                if (this.fireTimer >= 1 / cfg.fireRate) {
                    this.fireTimer = 0;
                    this._shoot(game);
                }
                return;
            }
            if (distToGuard <= cfg.leash * GRID_SIZE) {
                this._steerToward(this.target.worldX, this.target.worldY, dt, game);
                return;
            }
            this.target = null; // too far from post: give up the chase
        }

        // drift back to the guard post
        if (distToGuard > GRID_SIZE * 0.6) {
            this._steerToward(this.guardX, this.guardY, dt, game);
        } else {
            this.state = 'idle';
            this.walkPhase += dt * 2;
        }
    }

    _shoot(game) {
        const cfg = SOLDIER_CONFIG;
        const mx = this.worldX + Math.cos(this.aimAngle) * 11;
        const my = this.worldY - 3 + Math.sin(this.aimAngle) * 11;
        game.projectileMgr.spawn('bullet', {
            x: mx, y: my, target: this.target,
            speed: 13 * GRID_SIZE, damage: cfg.damage, color: '#ffd28a'
        });
        game.particles.muzzle(mx, my, this.aimAngle, '#ffd28a');
        audio.play('shoot_mg');
    }

    _steerToward(tx, ty, dt, game) {
        const dx = tx - this.worldX, dy = ty - this.worldY;
        const dist = Math.hypot(dx, dy) || 1;
        const step = SOLDIER_CONFIG.speed * GRID_SIZE * dt;
        const nx = this.worldX + (dx / dist) * step;
        const ny = this.worldY + (dy / dist) * step;
        // respect buildings (gates count as walkable, so troops pass doors)
        if (game.grid.isWalkable(Math.floor(nx / GRID_SIZE), Math.floor(ny / GRID_SIZE))) {
            this.worldX = nx; this.worldY = ny;
        } else if (game.grid.isWalkable(Math.floor(nx / GRID_SIZE), this.gy)) {
            this.worldX = nx;
        } else if (game.grid.isWalkable(this.gx, Math.floor(ny / GRID_SIZE))) {
            this.worldY = ny;
        }
        this.state = 'chasing';
        this.walkPhase += step * 0.32;
        if (Math.abs(dx) > 1) this.facing = dx > 0 ? 1 : -1;
    }

    _followPath(dt, game) {
        const t = this.path[this.pathIndex];
        if (!t) { this.path = null; this.state = 'idle'; return; }
        const last = this.pathIndex === this.path.length - 1;
        const tx = t.gx * GRID_SIZE + GRID_SIZE / 2 + (last ? this.offX * 0.6 : 0);
        const ty = t.gy * GRID_SIZE + GRID_SIZE / 2 + (last ? this.offY * 0.6 : 0);
        const dx = tx - this.worldX, dy = ty - this.worldY;
        const dist = Math.hypot(dx, dy);
        const step = SOLDIER_CONFIG.speed * GRID_SIZE * dt;
        this.walkPhase += step * 0.32;
        if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
        if (dist <= step) {
            this.worldX = tx; this.worldY = ty;
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) {
                this.path = null;
                this.state = 'idle';
            }
        } else {
            this.worldX += (dx / dist) * step;
            this.worldY += (dy / dist) * step;
        }
    }

    get animAction() {
        if (this.target) return 'aim';
        return (this.state === 'moving' || this.state === 'chasing') ? 'walk' : 'idle';
    }
}

export class SoldierManager {
    constructor() {
        this.soldiers = [];
    }

    addSoldiers(count, gx, gy) {
        for (let i = 0; i < count && this.soldiers.length < MAX_SOLDIERS; i++) {
            this.soldiers.push(new Soldier(gx + (i % 2), gy + Math.floor(i / 2)));
        }
    }

    update(dt, game) {
        for (let i = this.soldiers.length - 1; i >= 0; i--) {
            const s = this.soldiers[i];
            s.update(dt, game);
            if (s.dead) {
                game.particles.enemyDeath(s.worldX, s.worldY - 8, '#57634c', 0.7);
                audio.play('enemy_die');
                game.onSoldierLost();
                this.soldiers.splice(i, 1);
            }
        }
    }

    getSelected() { return this.soldiers.filter(s => s.selected); }
    deselectAll() { for (const s of this.soldiers) s.selected = false; }

    // fan the squad out around the target cell
    commandSelectedTo(gx, gy, game) {
        const sel = this.getSelected();
        sel.forEach((s, i) => {
            const ring = Math.floor(i / 8);
            const a = ((i % 8) / 8) * Math.PI * 2;
            s.commandMove(gx + Math.round(Math.cos(a) * ring), gy + Math.round(Math.sin(a) * ring), game);
        });
        return sel.length;
    }

    getSoldierAt(wx, wy, radius = GRID_SIZE * 0.5) {
        let best = null, bestD = radius;
        for (const s of this.soldiers) {
            const d = Math.hypot(s.worldX - wx, s.worldY - wy - 8);
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    }

    getInBox(x1, y1, x2, y2) {
        return this.soldiers.filter(s =>
            s.worldX >= x1 && s.worldX <= x2 &&
            s.worldY >= y1 && s.worldY <= y2
        );
    }

    get totalSoldiers() { return this.soldiers.length; }
}
