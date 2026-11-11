// ===== BUILDING SYSTEM =====
import { BUILDINGS, GRID_SIZE, UPGRADE_LEVELS, MAX_UPGRADE_LEVEL, JUICE, BASE_MOUNTS } from './config.js';
import { angleLerp, angleDiff } from './utils/math.js';
import { audio } from './audio.js';

let nextBuildingId = 1;

export class Building {
    constructor(type, gx, gy) {
        this.id = nextBuildingId++;
        this.type = type;
        this.def = BUILDINGS[type];
        this.name = this.def.name;
        this.gx = gx;
        this.gy = gy;
        this.size = this.def.size;
        this.maxHp = this.def.hp;
        this.hp = this.def.hp;
        this.level = 1;
        this.built = type === 'base';
        this.buildProgress = type === 'base' ? 1 : 0;
        this.buildTime = this.def.buildTime || 0;
        this.powered = this.def.powerDraw === 0;
        this.powerDraw = this.def.powerDraw || 0;
        this.selected = false;
        this.hitFlash = 0;
        this.spawnPop = 0;         // scale-in animation on completion

        // Turret state
        this.target = null;
        this.fireTimer = 0;
        this.rotation = Math.random() * Math.PI * 2;
        this.recoil = 0;
        this.muzzleTimer = 0;
        this.beamTarget = null;    // laser: enemy currently being burned

        // Utility state
        this.gatherTimer = 0;
        this.gatherFlash = 0;
        this.repairTimer = 0;
        this.repairPulse = 0;
        this.dishAngle = 0;        // radar
        this.doorOpen = 0;         // gate: 0 closed .. 1 open
        this.mountedWeapon = null; // base: 'gun' | 'cannon' once purchased
        this.soldiersGranted = 0;  // armory: already-trained headcount
        this.powerOutput = this.def.powerOutput || 0;
        this.workersProvided = this.def.workersProvided || 0;
        this.workersGranted = 0;  // barracks: already-trained headcount
        this.soldiersProvided = this.def.soldiersProvided || 0;
        this.teleportCooldown = 0;
    }

    get worldX() { return this.gx * GRID_SIZE + (this.size * GRID_SIZE) / 2; }
    get worldY() { return this.gy * GRID_SIZE + (this.size * GRID_SIZE) / 2; }
    get isTurret() {
        return (this.def.category === 'defense' && !!this.def.damage) ||
            (this.type === 'base' && !!this.mountedWeapon);
    }
    // the stat block the turret logic fires with (base uses its mount)
    get weaponDef() {
        if (this.type === 'base' && this.mountedWeapon) return BASE_MOUNTS[this.mountedWeapon];
        return this.def;
    }
    get isResourceGatherer() { return !!this.def.gatherResource; }

    update(dt, game) {
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.spawnPop = Math.max(0, this.spawnPop - dt * 2.4);
        this.recoil = Math.max(0, this.recoil - dt * JUICE.recoilDecay * 0.35);
        this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
        this.gatherFlash = Math.max(0, this.gatherFlash - dt);
        this.repairPulse = Math.max(0, this.repairPulse - dt);
        this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);

        if (!this.built) return;
        if (this.powerDraw > 0 && !this.powered) {
            this.beamTarget = null;
            return;
        }

        if (this.isTurret) this.updateTurret(dt, game);
        if (this.isResourceGatherer) this.updateGatherer(dt, game);
        if (this.type === 'repairStation') this.updateRepair(dt, game);
        if (this.type === 'radar') this.dishAngle += dt * 1.4;
        if (this.type === 'gate') {
            // slide open when a worker is close
            const near = game.workerMgr.getWorkerAt(this.worldX, this.worldY, GRID_SIZE * 1.5);
            const target = near ? 1 : 0;
            this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * 8);
        }
    }

    updateTurret(dt, game) {
        const wd = this.weaponDef;
        const range = (wd.range || 5) * GRID_SIZE * (1 + (this.getStatMult() - 1) * 0.35);
        const damage = (wd.damage || 10) * this.getStatMult();
        const fireRate = (wd.fireRate || 1) * (1 + (this.getStatMult() - 1) * 0.6);

        // (re)acquire target
        if (!this.target || this.target.dead || this._distTo(this.target) > range * 1.05) {
            this.target = game.enemyMgr.findNearest(this.worldX, this.worldY, range);
        }
        this.beamTarget = null;
        if (!this.target) return;

        // rotate toward target
        const dx = this.target.worldX - this.worldX;
        const dy = this.target.worldY - this.worldY;
        const targetAngle = Math.atan2(dy, dx);
        this.rotation = angleLerp(this.rotation, targetAngle, Math.min(1, dt * JUICE.turretTurnSpeed));
        const aimed = Math.abs(angleDiff(this.rotation, targetAngle)) < 0.22;

        if (wd.isBeam) {
            // continuous damage while aimed
            if (aimed) {
                this.beamTarget = this.target;
                this.target.takeDamage(damage * dt, true);
                if (Math.random() < dt * 14) {
                    game.particles.laserImpact(this.target.worldX, this.target.worldY, wd.accentColor);
                }
                audio.play('laser');
            }
            return;
        }

        this.fireTimer += dt;
        if (aimed && this.fireTimer >= 1 / fireRate) {
            this.fireTimer = 0;
            this.fire(game, damage);
        }
    }

    fire(game, damage) {
        if (!this.target) return;
        const wd = this.weaponDef;
        this.recoil = 1;
        this.muzzleTimer = 0.06;
        const barrelLen = this.type === 'base' ? 40 : this.size * GRID_SIZE * 0.42;
        const mx = this.worldX + Math.cos(this.rotation) * barrelLen;
        const my = this.worldY + Math.sin(this.rotation) * barrelLen;
        game.particles.muzzle(mx, my, this.rotation, wd.accentColor);

        const kind = wd.weapon;
        if (kind === 'mg') {
            audio.play('shoot_mg');
            game.projectileMgr.spawn('bullet', {
                x: mx, y: my, target: this.target,
                speed: (wd.projectileSpeed || 12) * GRID_SIZE,
                damage, color: wd.accentColor
            });
        } else if (kind === 'shell') {
            audio.play('shoot_cannon');
            game.camera.shake(1.6);
            game.projectileMgr.spawn('shell', {
                x: mx, y: my, target: this.target,
                speed: (wd.projectileSpeed || 8) * GRID_SIZE,
                damage, splash: (wd.splashRadius || 2) * GRID_SIZE,
                color: wd.accentColor
            });
        } else if (kind === 'missile') {
            audio.play('shoot_missile');
            game.projectileMgr.spawn('missile', {
                x: mx, y: my, target: this.target,
                speed: (wd.projectileSpeed || 6) * GRID_SIZE,
                damage, splash: (wd.splashRadius || 3) * GRID_SIZE,
                color: wd.accentColor,
                angle: this.rotation
            });
        }
    }

    _distTo(e) { return Math.hypot(e.worldX - this.worldX, e.worldY - this.worldY); }

    updateGatherer(dt, game) {
        const rate = (this.def.gatherRate || 1) * this.getStatMult();
        const radius = this.def.gatherRadius || 5;
        const resType = this.def.gatherResource;

        this.gatherTimer += dt;
        if (this.gatherTimer >= 1 / rate) {
            this.gatherTimer = 0;
            const nodes = game.resourceMgr.getNodesInRadius(this.gx, this.gy, radius, resType);
            if (nodes.length > 0) {
                const node = nodes[0];
                const harvested = game.resourceMgr.harvestNode(node, 1, game.time);
                if (harvested > 0) {
                    game.resourceMgr.add(resType, harvested);
                    this.gatherFlash = 0.35;
                    game.particles.resourceGather(
                        node.gx * GRID_SIZE + GRID_SIZE / 2,
                        node.gy * GRID_SIZE + GRID_SIZE / 2,
                        node.color
                    );
                }
            }
        }
    }

    updateRepair(dt, game) {
        const rate = (this.def.repairRate || 5) * this.getStatMult();
        const radius = (this.def.repairRadius || 6) * GRID_SIZE;

        this.repairTimer += dt;
        if (this.repairTimer >= 1) {
            this.repairTimer = 0;
            let repaired = false;
            for (const b of game.buildingMgr.buildings) {
                if (b === this || !b.built || b.hp >= b.maxHp) continue;
                const d = Math.hypot(b.worldX - this.worldX, b.worldY - this.worldY);
                if (d <= radius) {
                    b.hp = Math.min(b.maxHp, b.hp + rate);
                    game.particles.hitSpark(b.worldX, b.worldY - 6, '#66ffaa');
                    repaired = true;
                }
            }
            if (repaired) this.repairPulse = 1;
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.hitFlash = JUICE.hitFlashTime;
        if (this.hp <= 0) {
            this.hp = 0;
            return true;
        }
        return false;
    }

    getUpgradeCost() {
        if (this.level >= MAX_UPGRADE_LEVEL) return null;
        const next = this.level + 1;
        const upgradeDef = UPGRADE_LEVELS[next];
        const cost = {};
        for (const [res, amt] of Object.entries(this.def.cost)) {
            cost[res] = Math.ceil(amt * upgradeDef.costMult);
        }
        // higher tiers demand rarer materials
        if (next >= 7) cost.obsidian = (cost.obsidian || 0) + 30 * (next - 6);
        else if (next >= 4) cost.gold = (cost.gold || 0) + 40 * (next - 3);
        return cost;
    }

    upgrade(game) {
        const cost = this.getUpgradeCost();
        if (!cost || !game.resourceMgr.canAfford(cost)) return false;
        game.resourceMgr.spend(cost);
        this.level++;
        const mult = UPGRADE_LEVELS[this.level].statMult;
        this.maxHp = Math.ceil(this.def.hp * mult);
        this.hp = this.maxHp;
        this.spawnPop = 1;
        return true;
    }

    getStatMult() {
        return UPGRADE_LEVELS[this.level]?.statMult || 1;
    }

    getSellRefund() {
        // 50% of everything spent (base + upgrades), 75% while under construction
        const refund = {};
        let totalMult = 1;
        for (let l = 2; l <= this.level; l++) totalMult += UPGRADE_LEVELS[l].costMult;
        const pct = this.built ? 0.5 : 0.75;
        for (const [res, amt] of Object.entries(this.def.cost)) {
            refund[res] = Math.floor(amt * totalMult * pct);
        }
        return refund;
    }

    addBuildProgress(amount) {
        if (this.built) return;
        this.buildProgress += amount / this.buildTime;
        if (this.buildProgress >= 1) {
            this.buildProgress = 1;
            this.built = true;
            this.spawnPop = 1;
        }
    }
}

export class BuildingManager {
    constructor() {
        this.buildings = [];
        this.base = null;
    }

    createBase(grid, gx, gy) {
        const base = new Building('base', gx, gy);
        this.buildings.push(base);
        this.base = base;
        grid.occupyArea(gx, gy, base.size, 'building', base);
        return base;
    }

    placeBuilding(type, gx, gy, grid, resourceMgr) {
        const def = BUILDINGS[type];
        if (!def) return null;
        if (!grid.canPlace(gx, gy, def.size)) return null;
        if (!resourceMgr.canAfford(def.cost)) return null;
        resourceMgr.spend(def.cost);

        const building = new Building(type, gx, gy);
        this.buildings.push(building);
        grid.occupyArea(gx, gy, building.size, 'building', building);
        return building;
    }

    removeBuilding(building, grid, resourceMgr, refund = true) {
        grid.vacateArea(building.gx, building.gy, building.size);
        if (refund) {
            const back = building.getSellRefund();
            for (const [res, amt] of Object.entries(back)) resourceMgr.add(res, amt);
        }
        const idx = this.buildings.indexOf(building);
        if (idx !== -1) this.buildings.splice(idx, 1);
    }

    update(dt, game) {
        for (const b of this.buildings) b.update(dt, game);
    }

    getBuildingAt(gx, gy) {
        return this.buildings.find(b =>
            gx >= b.gx && gx < b.gx + b.size &&
            gy >= b.gy && gy < b.gy + b.size
        );
    }

    countByType(type) {
        let n = 0;
        for (const b of this.buildings) if (b.type === type && b.built) n++;
        return n;
    }

    hasBuilt(type) {
        return this.buildings.some(b => b.type === type && b.built && (b.powerDraw === 0 || b.powered));
    }
}
