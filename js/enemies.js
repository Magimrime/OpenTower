// ===== ENEMY SYSTEM =====
// Enemies follow a shared flow field toward the base (O(1) per step),
// naturally streaming around defenses or chewing through the weakest
// wall when a detour would be too long. Local separation keeps them
// from stacking without deadlocks.
import { ENEMIES, GRID_SIZE, JUICE } from './config.js';
import { SpatialHash, angleLerp, hash2 } from './utils/math.js';
import { audio } from './audio.js';

let nextEnemyId = 1;

export class Enemy {
    constructor(type, gx, gy) {
        this.id = nextEnemyId++;
        this.type = type;
        this.def = ENEMIES[type];
        this.gx = gx;
        this.gy = gy;
        this.worldX = gx * GRID_SIZE + GRID_SIZE / 2;
        this.worldY = gy * GRID_SIZE + GRID_SIZE / 2;
        this.maxHp = this.def.hp;
        this.hp = this.def.hp;
        this.speed = this.def.speed * (0.92 + hash2(this.id, 3) * 0.16);
        this.damage = this.def.damage;
        this.armor = this.def.armor || 0;
        this.dead = false;
        this.size = this.def.size || 0.7;
        this.radius = GRID_SIZE * 0.36 * this.size;
        this.color = this.def.color;
        this.reward = this.def.reward;
        this.isBoss = this.def.isBoss || false;

        this.attackTarget = null;
        this.attackTimer = 0;
        this.attackLunge = 0;

        this.targetCell = null;
        this.lateral = (hash2(this.id, 11) - 0.5) * GRID_SIZE * 0.5;
        this.rotation = 0;
        this.hitFlash = 0;
        this.teleportTimer = 0;
        this.swipeTimer = 0;
        this.vx = 0; this.vy = 0;
    }

    update(dt, game) {
        if (this.dead) return;
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.attackLunge = Math.max(0, this.attackLunge - dt * 4);

        this.gx = Math.floor(this.worldX / GRID_SIZE);
        this.gy = Math.floor(this.worldY / GRID_SIZE);

        // Void Walker teleport: blink toward the base periodically
        if (this.def.canTeleport) {
            this.teleportTimer += dt;
            if (this.teleportTimer > 8) {
                this.teleportTimer = 0;
                this._tryTeleport(game);
            }
        }

        // opportunistic swipe at any soldier or worker underfoot
        this.swipeTimer += dt;
        if (this.swipeTimer >= 1 / (this.def.attackSpeed || 0.8)) {
            const reach = this.radius + GRID_SIZE * 0.55;
            const victim = game.soldierMgr.getSoldierAt(this.worldX, this.worldY, reach)
                || game.workerMgr.getWorkerAt(this.worldX, this.worldY, reach);
            if (victim && !victim.dead) {
                this.swipeTimer = 0;
                this.attackLunge = 1;
                victim.takeDamage(this.damage, game);
            }
        }

        // --- attacking ---
        if (this.attackTarget) {
            const t = this.attackTarget;
            if (t.hp <= 0 || !game.buildingMgr.buildings.includes(t)) {
                this.attackTarget = null;
                this.targetCell = null;
            } else {
                const { dist, dirX, dirY } = this._distToBuilding(t);
                if (dist > GRID_SIZE * 0.55) {
                    // step closer
                    this._moveToward(this.worldX + dirX * GRID_SIZE, this.worldY + dirY * GRID_SIZE, dt, game);
                } else {
                    this.rotation = angleLerp(this.rotation, Math.atan2(dirY, dirX), Math.min(1, dt * 10));
                    this.attackTimer += dt;
                    const attackSpeed = this.def.attackSpeed || 0.8;
                    if (this.attackTimer >= 1 / attackSpeed) {
                        this.attackTimer = 0;
                        this.attackLunge = 1;
                        let dmg = this.damage;
                        if (this.def.buildingDamageMult) dmg *= this.def.buildingDamageMult;
                        game.onBuildingAttacked(t, dmg, this);
                    }
                }
                return;
            }
        }

        // --- navigate via flow field ---
        const field = game.flowField;
        if (!field.inBounds(this.gx, this.gy)) {
            // Far outside: march straight at the base
            const base = game.buildingMgr.base;
            if (base) this._moveToward(base.worldX, base.worldY, dt, game);
            return;
        }

        if (!this.targetCell ||
            (this.gx === this.targetCell.gx && this.gy === this.targetCell.gy) ||
            this._reachedTargetCell()) {
            this.targetCell = field.getNextCell(this.gx, this.gy);
        }

        if (this.targetCell) {
            // Next cell occupied by a building (even a construction site)? Attack it.
            const occ = game.grid.getOccupant(this.targetCell.gx, this.targetCell.gy);
            if (occ && occ.type === 'building' && occ.entity) {
                this.attackTarget = occ.entity;
                return;
            }
            const tx = this.targetCell.gx * GRID_SIZE + GRID_SIZE / 2 + this.lateral;
            const ty = this.targetCell.gy * GRID_SIZE + GRID_SIZE / 2 + this.lateral * 0.6;
            this._moveToward(tx, ty, dt, game);
        } else {
            // No downhill neighbor (at base or isolated): try attacking the base directly
            const base = game.buildingMgr.base;
            if (base) {
                const { dist } = this._distToBuilding(base);
                if (dist < GRID_SIZE * 1.2) this.attackTarget = base;
                else this._moveToward(base.worldX, base.worldY, dt, game);
            }
        }
    }

    _reachedTargetCell() {
        const tx = this.targetCell.gx * GRID_SIZE + GRID_SIZE / 2 + this.lateral;
        const ty = this.targetCell.gy * GRID_SIZE + GRID_SIZE / 2 + this.lateral * 0.6;
        return Math.abs(this.worldX - tx) < GRID_SIZE * 0.3 && Math.abs(this.worldY - ty) < GRID_SIZE * 0.3;
    }

    _moveToward(tx, ty, dt, game) {
        const dx = tx - this.worldX;
        const dy = ty - this.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sp = this.speed * GRID_SIZE;
        this.vx = (dx / dist) * sp;
        this.vy = (dy / dist) * sp;
        this.worldX += this.vx * dt;
        this.worldY += this.vy * dt;
        this.rotation = angleLerp(this.rotation, Math.atan2(this.vy, this.vx), Math.min(1, dt * 8));
    }

    applySeparation(dt, hash) {
        // soft push away from overlapping neighbors
        let pushX = 0, pushY = 0;
        const r = this.radius;
        hash.queryCircle(this.worldX, this.worldY, r + GRID_SIZE * 0.5, (other) => {
            if (other === this || other.dead) return;
            const dx = this.worldX - other.worldX;
            const dy = this.worldY - other.worldY;
            const d = Math.sqrt(dx * dx + dy * dy);
            const minD = r + other.radius;
            if (d > 0.001 && d < minD) {
                const f = (minD - d) / minD;
                pushX += (dx / d) * f;
                pushY += (dy / d) * f;
            }
        });
        if (pushX !== 0 || pushY !== 0) {
            const maxPush = GRID_SIZE * 2.2 * dt;
            this.worldX += Math.max(-maxPush, Math.min(maxPush, pushX * GRID_SIZE * 2.2 * dt));
            this.worldY += Math.max(-maxPush, Math.min(maxPush, pushY * GRID_SIZE * 2.2 * dt));
        }
    }

    _distToBuilding(b) {
        // distance from enemy to nearest point of the building's rect
        const x1 = b.gx * GRID_SIZE, y1 = b.gy * GRID_SIZE;
        const x2 = x1 + b.size * GRID_SIZE, y2 = y1 + b.size * GRID_SIZE;
        const nx = Math.max(x1, Math.min(this.worldX, x2));
        const ny = Math.max(y1, Math.min(this.worldY, y2));
        const dx = nx - this.worldX, dy = ny - this.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { dist, dirX: dist > 0.001 ? dx / dist : 1, dirY: dist > 0.001 ? dy / dist : 0 };
    }

    _tryTeleport(game) {
        const base = game.buildingMgr.base;
        if (!base) return;
        const dx = base.worldX - this.worldX;
        const dy = base.worldY - this.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GRID_SIZE * 10) return;
        game.particles.teleportEffect(this.worldX, this.worldY);
        const jump = GRID_SIZE * 6;
        this.worldX += (dx / dist) * jump;
        this.worldY += (dy / dist) * jump;
        this.targetCell = null;
        game.particles.teleportEffect(this.worldX, this.worldY);
        audio.play('teleport');
    }

    takeDamage(amount, pierceArmor = false) {
        if (this.dead) return;
        const actual = pierceArmor ? amount : Math.max(1, amount - this.armor);
        this.hp -= actual;
        this.hitFlash = JUICE.hitFlashTime;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
        }
    }

    get hpPercent() { return this.hp / this.maxHp; }
}

export class EnemyManager {
    constructor() {
        this.enemies = [];
        this.hash = new SpatialHash(GRID_SIZE * 2);
    }

    spawn(type, gx, gy) {
        const enemy = new Enemy(type, gx, gy);
        this.enemies.push(enemy);
        return enemy;
    }

    update(dt, game) {
        // rebuild spatial hash
        this.hash.clear();
        for (const e of this.enemies) {
            if (!e.dead) this.hash.insert(e, e.worldX, e.worldY);
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update(dt, game);
            if (!e.dead) e.applySeparation(dt, this.hash);

            if (e.dead) {
                game.particles.enemyDeath(e.worldX, e.worldY, e.color, e.size);
                if (e.isBoss) {
                    game.particles.explosion(e.worldX, e.worldY, 2.2);
                    game.camera.shake(JUICE.shakeBig);
                    audio.play('explosion_big');
                } else {
                    audio.play('enemy_die');
                }
                game.resourceMgr.addRewards(e.reward);
                game.stats.kills++;
                game.waveMgr.score += e.isBoss ? 250 : Math.ceil(e.maxHp / 8);
                // reward popup for meaningful kills
                if (e.isBoss || Math.random() < 0.25) {
                    const parts = Object.entries(e.reward).map(([r, a]) => `+${a} ${r}`);
                    if (parts.length) {
                        game.floatingText.add(e.worldX, e.worldY - 14, parts[0], { color: '#ffd777', size: 11 });
                    }
                }
                this.enemies.splice(i, 1);
            }
        }
    }

    // fast nearest-enemy query for turrets
    findNearest(x, y, range) {
        let best = null, bestD = range;
        this.hash.queryCircle(x, y, range, (e) => {
            if (e.dead) return;
            const d = Math.hypot(e.worldX - x, e.worldY - y);
            if (d < bestD) { bestD = d; best = e; }
        });
        return best;
    }

    queryCircle(x, y, r, visit) { this.hash.queryCircle(x, y, r, visit); }

    get activeCount() { return this.enemies.length; }
    clear() { this.enemies = []; }
}
