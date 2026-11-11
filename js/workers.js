// ===== WORKER SYSTEM =====
// Workers are animated humanoids with a real logistics loop:
// walk to node -> harvest -> carry to a drop-off -> deposit -> repeat.
import { GRID_SIZE, WORKER_CONFIG, WORKER_UPGRADES, MAX_WORKERS, RESOURCE_NODES } from './config.js';
import { hash2 } from './utils/math.js';
import { audio } from './audio.js';

let nextWorkerId = 1;

export class Worker {
    constructor(gx, gy) {
        this.id = nextWorkerId++;
        this.gx = gx;
        this.gy = gy;
        this.worldX = gx * GRID_SIZE + GRID_SIZE / 2;
        this.worldY = gy * GRID_SIZE + GRID_SIZE / 2;
        this.selected = false;

        // task state
        this.task = null;           // { type: 'move'|'gather'|'build'|'repair', ... }
        this.taskQueue = [];
        this.stage = null;          // gather: 'go' | 'harvest' | 'return'
        this.path = null;
        this.pathIndex = 0;
        this.pathVersion = -1;
        this.destGx = 0;
        this.destGy = 0;

        this.idle = true;
        this.autoGatherTimer = Math.random() * 2;
        this.carrying = 0;
        this.carryResource = null;

        // survival
        this.hp = WORKER_CONFIG.hp;
        this.maxHp = WORKER_CONFIG.hp;
        this.dead = false;
        this.fleeing = false;
        this.sheltered = false; // hiding inside the base, not rendered
        this._dangerTimer = Math.random() * 0.3;
        this._nearestThreatD = Infinity;
        this._safeTimer = 0;

        // animation
        this.facing = Math.random() < 0.5 ? -1 : 1;
        this.walkPhase = Math.random() * Math.PI * 2;
        this.actionPhase = 0;
        this.animAction = 'idle';   // idle | walk | build | mine | carry
        this._lastStrike = -1;

        // small personal offset so workers don't perfectly stack
        this.offX = (hash2(this.id, 7) - 0.5) * GRID_SIZE * 0.5;
        this.offY = (hash2(this.id, 13) - 0.5) * GRID_SIZE * 0.5;
    }

    // ---- stat getters (global upgrades live on the manager) ----
    speed(mgr) { return WORKER_CONFIG.baseSpeed * WORKER_UPGRADES.speed.levels[mgr.upgrades.speed]; }
    buildSpeed(mgr) { return WORKER_UPGRADES.buildSpeed.levels[mgr.upgrades.buildSpeed]; }
    carryMax(mgr) { return Math.round(WORKER_CONFIG.baseCarryMax * WORKER_UPGRADES.carryCapacity.levels[mgr.upgrades.carryCapacity]); }

    takeDamage(amount, game) {
        if (this.dead) return;
        this.hp -= amount;
        game.particles.hitSpark(this.worldX, this.worldY - 10, '#ffb0a0');
        if (this.hp <= 0) this.dead = true;
    }

    // Cheap staggered threat scan; sets the distance to the nearest enemy
    _scanThreat(game) {
        let best = Infinity;
        const R = WORKER_CONFIG.fleeRadius * GRID_SIZE * 1.4;
        game.enemyMgr.queryCircle(this.worldX, this.worldY, R, (e) => {
            if (e.dead) return;
            const d = Math.hypot(e.worldX - this.worldX, e.worldY - this.worldY);
            if (d < best) best = d;
        });
        return best;
    }

    _startFlee(game) {
        this._releaseClaim();
        this.task = null;
        this.taskQueue = [];
        this.stage = null;
        this.destBuilding = null;
        this.fleeing = true;
        this.idle = false;
        this._safeTimer = 0;
        const base = game.buildingMgr.base;
        if (base) this._pathToBuilding(base, game);
    }

    _updateFlee(dt, game, mgr) {
        const base = game.buildingMgr.base;
        if (!base) { this.fleeing = false; return; }

        // calm down only after a sustained stretch of safety
        if (this._nearestThreatD > WORKER_CONFIG.fleeRadius * GRID_SIZE * 1.25) {
            this._safeTimer += dt;
            if (this._safeTimer > 2.5) {
                this.fleeing = false;
                if (this.sheltered) {
                    // step back out of the bunker doors
                    this.sheltered = false;
                    this.worldX = base.worldX + this.offX;
                    this.worldY = (base.gy + base.size) * GRID_SIZE + GRID_SIZE * 0.5;
                    this.gx = Math.floor(this.worldX / GRID_SIZE);
                    this.gy = Math.floor(this.worldY / GRID_SIZE);
                }
                this.idle = true;
                this.autoGatherTimer = 0;
                return;
            }
        } else {
            this._safeTimer = 0;
        }

        if (this.sheltered) return; // safe inside the bunker

        const gap = this._distToRect(base.gx, base.gy, base.size);
        if (gap <= GRID_SIZE * 1.1) {
            // reached home: hand over the goods and disappear inside
            if (this.carrying > 0) this._depositCarry(game);
            this.path = null;
            this.sheltered = true;
            this.worldX = base.worldX;
            this.worldY = base.worldY;
            return;
        }
        if (!this.path) {
            if (!this._pathToBuilding(base, game)) {
                this.animAction = 'idle'; // boxed in: cower where they stand
                return;
            }
        }
        const res = this._followPath(dt, game, this.carrying > 0, WORKER_CONFIG.fleeSpeedMult);
        if (res === 'blocked') this.path = null;
    }

    _depositCarry(game) {
        if (this.carrying <= 0) return;
        const amount = Math.round(this.carrying * 10) / 10;
        game.resourceMgr.add(this.carryResource, amount);
        const def = Object.values(RESOURCE_NODES).find(n => n.resource === this.carryResource);
        game.floatingText.add(this.worldX, this.worldY - 24, `+${Math.floor(amount)}`, {
            color: def ? def.color : '#ffffff', size: 11
        });
        game.particles.deposit(this.worldX, this.worldY - 8, def ? def.color : '#ffffff');
        audio.play('deposit');
        this.carrying = 0;
        this.carryResource = null;
    }

    update(dt, game) {
        const mgr = game.workerMgr;

        // danger awareness
        this._dangerTimer -= dt;
        if (this._dangerTimer <= 0) {
            this._dangerTimer = 0.25 + hash2(this.id, 5) * 0.15;
            this._nearestThreatD = this._scanThreat(game);
        }
        if (!this.fleeing && this._nearestThreatD < WORKER_CONFIG.fleeRadius * GRID_SIZE) {
            this._startFlee(game);
        }
        if (this.fleeing) {
            this._updateFlee(dt, game, mgr);
            return;
        }

        if (this.task) {
            this.idle = false;
            switch (this.task.type) {
                case 'move': this._updateMove(dt, game); break;
                case 'gather': this._updateGather(dt, game, mgr); break;
                case 'build': this._updateBuild(dt, game, mgr); break;
                case 'repair': this._updateRepair(dt, game, mgr); break;
            }
        } else {
            this.idle = true;
            this.animAction = 'idle';
            this.walkPhase += dt * 2; // gentle breathing
            this._autoGather(dt, game, mgr);
        }
    }

    // ---------- movement ----------
    _followPath(dt, game, carryMode = false, speedMult = 1) {
        if (!this.path || this.pathIndex >= this.path.length) return 'arrived';

        // Re-validate path if the world changed
        if (this.pathVersion !== game.grid.version) {
            this.pathVersion = game.grid.version;
            const next = this.path[this.pathIndex];
            if (!game.grid.isWalkable(next.gx, next.gy)) {
                const ok = this._repath(game);
                if (!ok) return 'blocked';
            }
        }

        const target = this.path[this.pathIndex];
        const tx = target.gx * GRID_SIZE + GRID_SIZE / 2 + (this.pathIndex === this.path.length - 1 ? this.offX * 0.5 : 0);
        const ty = target.gy * GRID_SIZE + GRID_SIZE / 2 + (this.pathIndex === this.path.length - 1 ? this.offY * 0.5 : 0);
        const dx = tx - this.worldX;
        const dy = ty - this.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveSpeed = this.speed(game.workerMgr) * (carryMode ? 0.85 : 1) * speedMult * GRID_SIZE * dt;

        this.animAction = carryMode ? 'carry' : 'walk';
        this.walkPhase += moveSpeed * 0.30;
        if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;

        if (dist <= moveSpeed) {
            this.worldX = tx;
            this.worldY = ty;
            this.gx = target.gx;
            this.gy = target.gy;
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) {
                this.path = null;
                return 'arrived';
            }
        } else {
            this.worldX += (dx / dist) * moveSpeed;
            this.worldY += (dy / dist) * moveSpeed;
        }
        return 'moving';
    }

    _setPath(path, game) {
        this.path = path;
        this.pathIndex = 0;
        this.pathVersion = game.grid.version;
        return !!path;
    }

    _repath(game) {
        if (this.destBuilding) {
            const b = this.destBuilding;
            return this._setPath(game.pathfinder.findPathToBuilding(this.gx, this.gy, b.gx, b.gy, b.size), game);
        }
        return this._setPath(game.pathfinder.findPath(this.gx, this.gy, this.destGx, this.destGy), game);
    }

    _pathTo(gx, gy, game) {
        this.destGx = gx; this.destGy = gy;
        this.destBuilding = null;
        return this._setPath(game.pathfinder.findPath(this.gx, this.gy, gx, gy), game);
    }

    _pathToBuilding(b, game) {
        this.destBuilding = b;
        return this._setPath(game.pathfinder.findPathToBuilding(this.gx, this.gy, b.gx, b.gy, b.size), game);
    }

    // ---------- task handlers ----------
    _updateMove(dt, game) {
        const res = this._followPath(dt, game);
        if (res !== 'moving') this._finishTask(game);
    }

    // Distance from this worker to the nearest edge of a grid rect
    _distToRect(gx, gy, size) {
        const x1 = gx * GRID_SIZE, y1 = gy * GRID_SIZE;
        const x2 = x1 + size * GRID_SIZE, y2 = y1 + size * GRID_SIZE;
        const nx = Math.max(x1, Math.min(this.worldX, x2));
        const ny = Math.max(y1, Math.min(this.worldY, y2));
        return Math.hypot(nx - this.worldX, ny - this.worldY);
    }

    _updateGather(dt, game, mgr) {
        const node = this.task.target;

        if (this.stage === 'go') {
            if (!node || node.depleted) { this._dropoffOrFinish(game); return; }
            const res = this._followPath(dt, game);
            if (res === 'blocked') { this._finishTask(game); return; }
            if (res !== 'arrived') return;
            // must stand BESIDE the node, never on it
            if (this._distToRect(node.gx, node.gy, 1) > GRID_SIZE * 1.4) {
                if (!this._pathToNodeSide(node, game)) { this._finishTask(game); return; }
                return;
            }
            this.stage = 'harvest';
            this.actionPhase = 0;
        } else if (this.stage === 'harvest') {
            if (!node || node.depleted) { this._dropoffOrFinish(game); return; }
            // the tree just collapsed into a stump: stop unless this task
            // was explicitly aimed at the stump (player re-command)
            if (node.isStump && !this._stumpOk) { this._dropoffOrFinish(game); return; }
            // hug the node: walk the last stretch so the swing lands ON it
            const gap = this._distToRect(node.gx, node.gy, 1);
            if (gap > 11) {
                const nx = node.gx * GRID_SIZE + GRID_SIZE / 2;
                const ny = node.gy * GRID_SIZE + GRID_SIZE / 2 + 6; // aim at the trunk/base
                const dx = nx - this.worldX, dy = ny - this.worldY;
                const dist = Math.hypot(dx, dy) || 1;
                const sp = this.speed(mgr) * GRID_SIZE * dt;
                this.worldX += (dx / dist) * sp;
                this.worldY += (dy / dist) * sp;
                this.animAction = 'walk';
                this.walkPhase += sp * 0.30;
                if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
                return;
            }
            // face the node and swing the right tool
            const nodeX = node.gx * GRID_SIZE + GRID_SIZE / 2;
            if (Math.abs(nodeX - this.worldX) > 2) this.facing = nodeX > this.worldX ? 1 : -1;
            this.animAction = node.resource === 'wood' ? 'chop' : 'mine';
            this._advanceSwing(dt, 1.5, () => {
                audio.play('harvest');
                game.particles.resourceGather(
                    node.gx * GRID_SIZE + GRID_SIZE / 2,
                    node.gy * GRID_SIZE + GRID_SIZE / 2 - 6,
                    node.color
                );
            });
            const harvested = game.resourceMgr.harvestNode(node, WORKER_CONFIG.harvestRate * dt, game.time);
            this.carrying += harvested;
            this.carryResource = node.resource;
            if (this.carrying >= this.carryMax(mgr) || node.depleted) {
                this._dropoffOrFinish(game);
            }
        } else if (this.stage === 'return') {
            const base = game.buildingMgr.base;
            if (!base) { this._finishTask(game); return; }
            const res = this._followPath(dt, game, true);
            if (res === 'moving') return;
            // close the final stretch until actually touching the base wall
            const gap = this._distToRect(base.gx, base.gy, base.size);
            if (gap > 10) {
                if (gap <= GRID_SIZE * 2.2) {
                    const dx = base.worldX - this.worldX;
                    const dy = base.worldY - this.worldY;
                    const dist = Math.hypot(dx, dy) || 1;
                    const sp = this.speed(mgr) * 0.85 * GRID_SIZE * dt;
                    this.worldX += (dx / dist) * sp;
                    this.worldY += (dy / dist) * sp;
                    this.animAction = 'carry';
                    this.walkPhase += sp * 0.30;
                    if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
                    return;
                }
                this._returnRetries = (this._returnRetries || 0) + 1;
                if (this._returnRetries < 3 && this._pathToBuilding(base, game)) return;
                // truly unreachable: dump so resources aren't lost
                game.resourceMgr.add(this.carryResource, this.carrying);
                this.carrying = 0;
                this._finishTask(game);
                return;
            }
            this._returnRetries = 0;
            // deposit at the base
            this._depositCarry(game);
            // loop back if the node still has resources
            if (node && !node.depleted) {
                node.claimants = (node.claimants || 0) + 1;
                this._claimedNode = node;
                this.stage = 'go';
                if (!this._pathToNodeSide(node, game)) this._finishTask(game);
            } else {
                this._finishTask(game);
            }
        }
    }

    // Path to a walkable cell adjacent to a resource node (never onto it)
    _pathToNodeSide(node, game) {
        this.destBuilding = { gx: node.gx, gy: node.gy, size: 1 };
        return this._setPath(
            game.pathfinder.findPathToBuilding(this.gx, this.gy, node.gx, node.gy, 1),
            game
        );
    }

    _dropoffOrFinish(game) {
        this._releaseClaim();
        if (this.carrying <= 0) { this._finishTask(game); return; }
        const base = game.buildingMgr.base;
        if (!base) { this._finishTask(game); return; }
        this.stage = 'return';
        this._returnRetries = 0;
        if (!this._pathToBuilding(base, game)) {
            // stuck: dump on the spot so resources aren't lost
            game.resourceMgr.add(this.carryResource, this.carrying);
            this.carrying = 0;
            this._finishTask(game);
        }
    }

    _updateBuild(dt, game, mgr) {
        const building = this.task.target;
        if (!building || building.built || building.hp <= 0 ||
            !game.buildingMgr.buildings.includes(building)) {
            this._finishTask(game);
            return;
        }
        if (this.path) {
            const res = this._followPath(dt, game);
            if (res === 'blocked') { this._finishTask(game); return; }
            if (res !== 'arrived') return;
        }
        // in range?
        const range = (building.size / 2 + WORKER_CONFIG.buildRange) * GRID_SIZE;
        const dx = building.worldX - this.worldX;
        const dy = building.worldY - this.worldY;
        if (Math.sqrt(dx * dx + dy * dy) > range) {
            if (!this._pathToBuilding(building, game)) { this._finishTask(game); return; }
            return;
        }
        this.facing = dx > 0 ? 1 : -1;
        this.animAction = 'build';
        this._advanceSwing(dt, 1.6, () => {
            audio.play('hammer');
            game.particles.buildHit(
                building.worldX + (Math.random() - 0.5) * building.size * GRID_SIZE * 0.5,
                building.worldY + (Math.random() - 0.5) * building.size * GRID_SIZE * 0.5
            );
        });
        building.addBuildProgress(this.buildSpeed(mgr) * dt);
        if (building.built) {
            game.onBuildingComplete(building);
            this._finishTask(game);
        }
    }

    _updateRepair(dt, game, mgr) {
        const building = this.task.target;
        if (!building || building.hp <= 0 || building.hp >= building.maxHp ||
            !game.buildingMgr.buildings.includes(building)) {
            this._finishTask(game);
            return;
        }
        if (this.path) {
            const res = this._followPath(dt, game);
            if (res === 'blocked') { this._finishTask(game); return; }
            if (res !== 'arrived') return;
        }
        const range = (building.size / 2 + WORKER_CONFIG.buildRange) * GRID_SIZE;
        const dx = building.worldX - this.worldX;
        const dy = building.worldY - this.worldY;
        if (Math.sqrt(dx * dx + dy * dy) > range) {
            if (!this._pathToBuilding(building, game)) { this._finishTask(game); return; }
            return;
        }
        this.facing = dx > 0 ? 1 : -1;
        this.animAction = 'build';
        this._advanceSwing(dt, 1.4, () => {
            audio.play('hammer');
            game.particles.hitSpark(building.worldX, building.worldY, '#88ffbb');
        });
        building.hp = Math.min(building.maxHp, building.hp + WORKER_CONFIG.repairRate * this.buildSpeed(mgr) * dt);
    }

    _advanceSwing(dt, rate, onStrike) {
        this.actionPhase += dt * rate;
        const strikeInt = Math.floor(this.actionPhase + 0.15);
        if (strikeInt !== this._lastStrike) {
            this._lastStrike = strikeInt;
            onStrike();
        }
    }

    // ---------- task management ----------
    startTask(task, game) {
        this._releaseClaim();
        this.task = task;
        this.idle = false;
        this.fleeing = false; // a direct order overrides fear
        if (this.sheltered) {
            // called out of the bunker
            this.sheltered = false;
            const base = game.buildingMgr.base;
            if (base) {
                this.worldX = base.worldX + this.offX;
                this.worldY = (base.gy + base.size) * GRID_SIZE + GRID_SIZE * 0.5;
                this.gx = Math.floor(this.worldX / GRID_SIZE);
                this.gy = Math.floor(this.worldY / GRID_SIZE);
            }
        }
        this.stage = null;
        this.actionPhase = 0;

        if (task.type === 'move') {
            if (!this._pathTo(task.gx, task.gy, game)) this._finishTask(game);
        } else if (task.type === 'gather') {
            const node = task.target;
            if (!node || node.depleted) { this._finishTask(game); return; }
            // remember whether this order was aimed at a stump on purpose
            this._stumpOk = !!node.isStump;
            node.claimants = (node.claimants || 0) + 1;
            this._claimedNode = node;
            this.stage = 'go';
            if (!this._pathToNodeSide(node, game)) this._finishTask(game);
        } else if (task.type === 'build' || task.type === 'repair') {
            const b = task.target;
            if (!b) { this._finishTask(game); return; }
            if (!this._pathToBuilding(b, game)) this._finishTask(game);
        }
    }

    queueTask(task, game) {
        if (this.idle && !this.task) this.startTask(task, game);
        else this.taskQueue.push(task);
    }

    _finishTask(game) {
        this._releaseClaim();
        this.task = null;
        this.stage = null;
        this.path = null;
        this.destBuilding = null;
        if (this.carrying > 0) {
            // never lose carried resources
            game.resourceMgr.add(this.carryResource, this.carrying);
            this.carrying = 0;
            this.carryResource = null;
        }
        if (this.taskQueue.length > 0) {
            this.startTask(this.taskQueue.shift(), game);
        } else {
            this.idle = true;
            this.autoGatherTimer = 0;
        }
    }

    clearTask(game) {
        this.taskQueue = [];
        this._finishTask(game);
        this.autoGatherTimer = -1; // brief pause before auto-gathering again
    }

    _releaseClaim() {
        if (this._claimedNode) {
            this._claimedNode.claimants = Math.max(0, (this._claimedNode.claimants || 1) - 1);
            this._claimedNode = null;
        }
    }

    // ---------- idle auto-gather ----------
    _autoGather(dt, game, mgr) {
        this.autoGatherTimer += dt;
        if (this.autoGatherTimer < WORKER_CONFIG.autoGatherDelay) return;
        this.autoGatherTimer = 0;

        let best = null, bestScore = Infinity;
        for (const node of game.resourceMgr.nodes) {
            if (node.depleted) continue;
            if (node.isStump) continue; // stumps regrow — only chop on player orders
            if ((node.claimants || 0) >= WORKER_CONFIG.maxGatherersPerNode) continue;
            const dx = node.gx - this.gx;
            const dy = node.gy - this.gy;
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist > WORKER_CONFIG.autoGatherRange) continue;
            const score = dist + (node.claimants || 0) * 6;
            if (score < bestScore) { bestScore = score; best = node; }
        }
        if (best) {
            // don't voluntarily walk into a battle
            let danger = false;
            game.enemyMgr.queryCircle(
                best.gx * GRID_SIZE + GRID_SIZE / 2,
                best.gy * GRID_SIZE + GRID_SIZE / 2,
                WORKER_CONFIG.fleeRadius * GRID_SIZE,
                (e) => { if (!e.dead) danger = true; }
            );
            if (danger) return;
            this.startTask({ type: 'gather', target: best }, game);
        }
    }
}

export class WorkerManager {
    constructor() {
        this.workers = [];
        // Global upgrade levels (bought at the Worker Upgrade Station)
        this.upgrades = { speed: 0, buildSpeed: 0, carryCapacity: 0 };
    }

    initialize(count, baseGx, baseGy) {
        for (let i = 0; i < count; i++) {
            const offsetX = (i % 3) - 1;
            const offsetY = Math.floor(i / 3) - 1;
            this.workers.push(new Worker(baseGx + 1 + offsetX, baseGy + 4 + offsetY));
        }
    }

    addWorkers(count, gx, gy) {
        for (let i = 0; i < count && this.workers.length < MAX_WORKERS; i++) {
            this.workers.push(new Worker(gx + (i % 2), gy + Math.floor(i / 2)));
        }
    }

    update(dt, game) {
        for (let i = this.workers.length - 1; i >= 0; i--) {
            const w = this.workers[i];
            w.update(dt, game);
            if (w.dead) {
                w._releaseClaim();
                game.particles.enemyDeath(w.worldX, w.worldY - 8, '#e87820', 0.7);
                audio.play('enemy_die');
                game.onWorkerLost();
                this.workers.splice(i, 1);
            }
        }
    }

    // Cost/purchase of a global worker upgrade. type: speed|buildSpeed|carryCapacity
    getUpgradeCost(type) {
        const def = WORKER_UPGRADES[type];
        const lvl = this.upgrades[type];
        if (lvl >= def.levels.length - 1) return null; // maxed
        return def.cost[lvl + 1];
    }

    buyUpgrade(type, game) {
        const cost = this.getUpgradeCost(type);
        if (!cost || !game.resourceMgr.canAfford(cost)) return false;
        game.resourceMgr.spend(cost);
        this.upgrades[type]++;
        audio.play('upgrade');
        return true;
    }

    getIdleWorkers() { return this.workers.filter(w => w.idle); }
    getSelectedWorkers() { return this.workers.filter(w => w.selected); }
    selectAll() { for (const w of this.workers) w.selected = true; }
    deselectAll() { for (const w of this.workers) w.selected = false; }

    commandSelectedTo(gx, gy, game, shift = false) {
        const selected = this.getSelectedWorkers();
        if (selected.length === 0) return;

        const node = game.resourceMgr.nodes.find(n => !n.depleted && n.gx === gx && n.gy === gy);
        const building = game.buildingMgr.getBuildingAt(gx, gy);

        let label = null;
        for (const w of selected) {
            let task;
            if (node) {
                task = { type: 'gather', target: node };
                label = node.isStump ? 'Grubbing out the stump' : `Harvesting ${node.type}`;
            } else if (building && !building.built) {
                task = { type: 'build', target: building };
                label = `Constructing ${building.name}`;
            } else if (building && building.hp < building.maxHp) {
                task = { type: 'repair', target: building };
                label = `Repairing ${building.name}`;
            } else if (building) {
                continue; // nothing useful to do on an intact building
            } else {
                task = { type: 'move', gx, gy };
            }
            if (shift) w.queueTask(task, game);
            else { w.taskQueue = []; w.startTask(task, game); }
        }
        if (label) game.toast(label, 'info');
    }

    assignBuild(building, game, count = 0) {
        const idle = this.getIdleWorkers();
        const toAssign = count > 0 ? Math.min(count, idle.length) : idle.length;
        for (let i = 0; i < toAssign; i++) {
            idle[i].startTask({ type: 'build', target: building }, game);
        }
        return toAssign;
    }

    // Placing a building always dispatches ONE random worker — pulling
    // someone off gathering if nobody is idle.
    autoAssignBuild(building, game) {
        if (this.workers.length === 0) return 0;
        const idle = this.getIdleWorkers();
        let pick = null;
        if (idle.length > 0) {
            pick = idle[Math.floor(Math.random() * idle.length)];
        } else {
            const interruptible = this.workers.filter(w =>
                !w.task || w.task.type === 'gather' || w.task.type === 'move');
            if (interruptible.length > 0) {
                pick = interruptible[Math.floor(Math.random() * interruptible.length)];
            }
        }
        if (pick) {
            pick.taskQueue = [];
            pick.startTask({ type: 'build', target: building }, game);
            return 1;
        }
        // everyone is mid-construction/repair: queue it on someone random
        const any = this.workers[Math.floor(Math.random() * this.workers.length)];
        any.queueTask({ type: 'build', target: building }, game);
        return 1;
    }

    getWorkerAt(wx, wy, radius = GRID_SIZE * 0.5) {
        let best = null, bestD = radius;
        for (const w of this.workers) {
            if (w.sheltered) continue;
            const d = Math.hypot(w.worldX - wx, w.worldY - wy - 8);
            if (d < bestD) { bestD = d; best = w; }
        }
        return best;
    }

    getWorkersInBox(x1, y1, x2, y2) {
        return this.workers.filter(w =>
            !w.sheltered &&
            w.worldX >= x1 && w.worldX <= x2 &&
            w.worldY >= y1 && w.worldY <= y2
        );
    }

    get totalWorkers() { return this.workers.length; }
    get idleCount() { return this.workers.filter(w => w.idle).length; }
    get busyCount() { return this.workers.filter(w => !w.idle).length; }
}
