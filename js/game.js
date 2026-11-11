// ===== GAME ORCHESTRATOR =====
import { GRID_SIZE, STARTING_WORKERS, BUILDINGS, TELEPORTER_CONFIG, JUICE, WORKER_CONFIG, BASE_MOUNTS, SOLDIER_CONFIG } from './config.js';
import { Grid } from './grid.js';
import { Camera } from './camera.js';
import { InputManager } from './input.js';
import { Pathfinder, FlowField } from './pathfinding.js';
import { ResourceManager } from './resources.js';
import { BuildingManager, Building } from './buildings.js';
import { WorkerManager, Worker } from './workers.js';
import { SoldierManager, Soldier } from './soldiers.js';
import { EnemyManager } from './enemies.js';
import { WaveManager } from './waves.js';
import { WireSystem } from './wires.js';
import { ProjectileManager } from './projectiles.js';
import { ParticleSystem, FloatingTextSystem } from './particles.js';
import { Renderer } from './renderer.js';
import { audio } from './audio.js';
import { progress } from './progress.js';
import { saveGame, deleteSave } from './saveload.js';
import { WIRE_CONFIG, UPGRADE_LEVELS } from './config.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        this.input = new InputManager(canvas);
        this.camera = new Camera();
        this.ui = null; // assigned by main.js after construction

        this._createSystems();

        // state
        this.state = 'menu'; // menu | playing | paused | gameover | victory
        this.time = 0;
        this.showGrid = false;
        this.gameMode = 'campaign';
        this.gameSpeed = 1;
        this._lastSpeed = 1;
        this.placement = null; // {kind:'building'|'wire'|'teleportPick'|'teleportDest', ...}
        this.wallDragCells = [];
        this.moveMarkers = [];
        this.selectedBuilding = null;
        this.hoveredBuilding = null;
        this.baseDamageFlash = 0;
        this._baseHitSound = 0;
        this.stats = { kills: 0, built: 0 };

        // stable hotkey order for 1-9
        this.buildHotkeys = Object.keys(BUILDINGS).filter(k => k !== 'base');
    }

    _createSystems() {
        this.grid = new Grid();
        this.pathfinder = new Pathfinder(this.grid);
        this.flowField = new FlowField(this.grid);
        this.resourceMgr = new ResourceManager();
        this.buildingMgr = new BuildingManager();
        this.workerMgr = new WorkerManager();
        this.soldierMgr = new SoldierManager();
        this.enemyMgr = new EnemyManager();
        this.waveMgr = new WaveManager();
        this.wireSystem = new WireSystem();
        this.projectileMgr = new ProjectileManager();
        this.particles = new ParticleSystem();
        this.floatingText = new FloatingTextSystem();
        this.energyUsed = 0;
        this.energyTotal = 0;
    }

    // ================= LIFECYCLE =================
    startGame(mode, level = 1) {
        this.gameMode = mode;
        this.state = 'playing';
        this.time = 0;
        this.stats = { kills: 0, built: 0 };
        this._createSystems();
        if (this.ui) this.ui.applySettings();

        const baseGx = -1, baseGy = -1;
        this.buildingMgr.createBase(this.grid, baseGx, baseGy);
        this.camera.snapTo(0, 0);
        this.camera.targetZoom = this.camera.zoom = 1;

        this.workerMgr.initialize(STARTING_WORKERS, baseGx, baseGy);
        this.resourceMgr.generateMapResources(this.grid, baseGx, baseGy);
        this.waveMgr.init(mode, level);
        this.flowField.markDirty();
        this.renderer.prewarm(this);

        this.selectedBuilding = null;
        this.placement = null;
        // don't toast unlocks the player effectively starts with
        this._announcedUnlocks = new Set(
            Object.keys(BUILDINGS).filter(t => this.isBuildingUnlocked(t)));
        this.setGameSpeed(1);
        this.hideAllOverlays();
        document.getElementById('buildDock').classList.remove('hidden');
        if (this.ui) {
            this.ui.setVisible(true);
            this.ui.setWireMode(false);
            this.ui.markSelectionDirty();
        }
        this.toast(mode === 'campaign' ? `Level ${level} — defend your bunker!` : 'Infinite mode — survive as long as you can!', 'info');
    }

    loadFromSave(data) {
        this.gameMode = data.mode;
        this.state = 'playing';
        this.time = data.time || 0;
        this.stats = data.stats || { kills: 0, built: 0 };
        this._createSystems();
        if (this.ui) this.ui.applySettings();

        this.resourceMgr.resources = { ...this.resourceMgr.resources, ...data.resources };

        // nodes
        for (const n of data.nodes) {
            const node = {
                id: `${n.type}_${n.gx}_${n.gy}`,
                type: n.type, gx: n.gx, gy: n.gy,
                resource: this._nodeResource(n.type),
                amount: n.amount, maxAmount: n.maxAmount,
                color: this._nodeColor(n.type),
                depleted: n.amount <= 0,
                isStump: n.isStump || false,
                regrowAt: n.regrowAt,
                claimants: 0
            };
            this.resourceMgr.nodes.push(node);
            this.grid.occupy(n.gx, n.gy, 'resource', node);
        }
        this.resourceMgr.pendingRespawns = data.respawns || [];
        this.resourceMgr.generatedRadius = data.generatedRadius || 28;
        this.resourceMgr._nodeSeq = this.resourceMgr.nodes.length + 1;

        // buildings
        for (const bd of data.buildings) {
            const b = new Building(bd.type, bd.gx, bd.gy);
            b.level = bd.level;
            b.maxHp = Math.ceil(b.def.hp * (UPGRADE_LEVELS[bd.level]?.statMult || 1));
            b.hp = Math.min(bd.hp, b.maxHp);
            b.built = bd.built;
            b.buildProgress = bd.progress;
            // older saves lack the field: assume already-built barracks paid out
            b.workersGranted = bd.workersGranted !== undefined
                ? bd.workersGranted
                : (b.built ? (b.workersProvided || 0) * b.level : 0);
            b.soldiersGranted = bd.soldiersGranted !== undefined
                ? bd.soldiersGranted
                : (b.built ? (b.def.soldiersProvided || 0) * b.level : 0);
            if (bd.mountedWeapon) b.mountedWeapon = bd.mountedWeapon;
            this.buildingMgr.buildings.push(b);
            this.grid.occupyArea(b.gx, b.gy, b.size, 'building', b);
            if (b.type === 'base') this.buildingMgr.base = b;
        }

        // wires (restored without cost)
        for (const wd of data.wires) {
            const def = WIRE_CONFIG.wireTypes[wd.type];
            this.wireSystem.wires.set(`${wd.gx},${wd.gy}`, {
                gx: wd.gx, gy: wd.gy, type: wd.type,
                maxPower: def.maxPower, currentPower: 0, color: def.color,
                connections: [], networkId: -1, pulsePhase: Math.random() * Math.PI * 2
            });
        }
        this.wireSystem.dirty = true;

        // workers
        this.workerMgr.upgrades = { ...this.workerMgr.upgrades, ...data.workerUpgrades };
        for (const wd of data.workers) {
            const w = new Worker(Math.floor(wd.x / GRID_SIZE), Math.floor(wd.y / GRID_SIZE));
            w.worldX = wd.x; w.worldY = wd.y;
            if (wd.hp !== undefined) w.hp = Math.min(wd.hp, w.maxHp);
            this.workerMgr.workers.push(w);
        }

        // soldiers
        for (const sd of (data.soldiers || [])) {
            const s = new Soldier(Math.floor(sd.x / GRID_SIZE), Math.floor(sd.y / GRID_SIZE));
            s.worldX = sd.x; s.worldY = sd.y;
            s.guardX = sd.gx !== undefined ? sd.gx : sd.x;
            s.guardY = sd.gy !== undefined ? sd.gy : sd.y;
            if (sd.hp !== undefined) s.hp = Math.min(sd.hp, s.maxHp);
            this.soldierMgr.soldiers.push(s);
        }

        // enemies
        for (const ed of data.enemies) {
            const e = this.enemyMgr.spawn(ed.type, Math.floor(ed.x / GRID_SIZE), Math.floor(ed.y / GRID_SIZE));
            e.worldX = ed.x; e.worldY = ed.y;
            e.hp = Math.min(ed.hp, e.maxHp);
        }

        // waves
        const wm = this.waveMgr;
        wm.init(data.mode, data.campaignLevel);
        wm.currentWave = data.wave.currentWave;
        wm.waveTimer = data.wave.waveTimer;
        wm.waveActive = data.wave.waveActive;
        wm.wavesThisLevel = data.wave.wavesThisLevel;
        wm.score = data.wave.score;
        wm.spawnQueue = data.wave.spawnQueue || [];
        wm.pendingQueue = data.wave.pendingQueue || wm.generateWave(wm.currentWave + 1);

        const base = this.buildingMgr.base;
        if (base) {
            this.camera.snapTo(base.worldX, base.worldY);
            this.resourceMgr.centerGx = base.gx + Math.floor(base.size / 2);
            this.resourceMgr.centerGy = base.gy + Math.floor(base.size / 2);
        }
        this.flowField.markDirty();
        this.renderer.prewarm(this);

        this.selectedBuilding = null;
        this.placement = null;
        this._announcedUnlocks = new Set(
            Object.keys(BUILDINGS).filter(t => this.isBuildingUnlocked(t)));
        this.setGameSpeed(1);
        this.hideAllOverlays();
        if (this.ui) {
            this.ui.setVisible(true);
            this.ui.setWireMode(false);
            this.ui.markSelectionDirty();
        }
        this.toast('Game loaded — welcome back, commander', 'success');
    }

    _nodeResource(type) {
        return {
            tree: 'wood', stoneDeposit: 'stone', copperOre: 'copper', ironOre: 'iron',
            goldOre: 'gold', crystalNode: 'crystal', obsidianShard: 'obsidian'
        }[type];
    }
    _nodeColor(type) {
        return {
            tree: '#2d7a2d', stoneDeposit: '#8a8a8a', copperOre: '#3ec9a7', ironOre: '#b87333',
            goldOre: '#ffd700', crystalNode: '#b040ff', obsidianShard: '#8f7bd8'
        }[type];
    }

    // ================= UPDATE =================
    update(dt) {
        if (this.state !== 'playing') return;

        const worldDt = dt * this.gameSpeed;
        this.time += worldDt;
        this.input.updateMouseWorld(this.camera);
        this.handleInput(dt);
        this.camera.update(dt, this.input, this.renderer.w, this.renderer.h);

        // hovered building (needed even while paused-speed for tooltips)
        const { gx, gy } = this.grid.worldToGrid(this.input.mouseWorld.x, this.input.mouseWorld.y);
        this.hoveredBuilding = this.buildingMgr.getBuildingAt(gx, gy);

        // visual decay runs on real time
        this.baseDamageFlash = Math.max(0, this.baseDamageFlash - dt * 2.8);
        this._baseHitSound = Math.max(0, this._baseHitSound - dt);
        for (let i = this.moveMarkers.length - 1; i >= 0; i--) {
            this.moveMarkers[i].t -= dt * 1.8;
            if (this.moveMarkers[i].t <= 0) this.moveMarkers.splice(i, 1);
        }

        if (worldDt > 0) {
            this.buildingMgr.update(worldDt, this);
            this.workerMgr.update(worldDt, this);
            this.soldierMgr.update(worldDt, this);
            this.enemyMgr.update(worldDt, this);
            this.waveMgr.update(worldDt, this);
            this.projectileMgr.update(worldDt, this);
        }
        this.particles.update(Math.max(worldDt, dt * 0.3));
        this.floatingText.update(dt);
        this.flowField.update(worldDt, this.buildingMgr.base);
        this.wireSystem.recalculate(this.buildingMgr.buildings);

        // energy accounting
        let total = 0;
        for (const network of this.wireSystem.powerNetworks) total += network.totalPower;
        let used = 0;
        for (const b of this.buildingMgr.buildings) {
            if (b.built && b.powerDraw > 0 && b.powered) used += b.powerDraw;
        }
        this.energyTotal = Math.round(total);
        this.energyUsed = Math.round(used);
        this.resourceMgr.resources.energy = this.energyTotal;

        this.resourceMgr.removeDepletedNodes(this.grid, this.time);
        this.resourceMgr.updateRespawns(this.grid, this.time);

        // the base slowly retrains fallen workers, up to what's been earned
        if (worldDt > 0) {
            let entitled = STARTING_WORKERS;
            for (const b of this.buildingMgr.buildings) {
                if (b.built && b.workersGranted) entitled += b.workersGranted;
            }
            if (this.workerMgr.totalWorkers < entitled) {
                this._retrainTimer = (this._retrainTimer || 0) + worldDt;
                if (this._retrainTimer >= WORKER_CONFIG.retrainTime) {
                    this._retrainTimer = 0;
                    const base = this.buildingMgr.base;
                    if (base) {
                        this.workerMgr.addWorkers(1, base.gx + 1, base.gy + base.size);
                        this.toast('Replacement worker trained', 'info');
                    }
                }
            } else {
                this._retrainTimer = 0;
            }

            // fallen soldiers get replaced at an armory
            let entitledSoldiers = 0;
            let armory = null;
            for (const b of this.buildingMgr.buildings) {
                if (b.built && b.soldiersGranted) {
                    entitledSoldiers += b.soldiersGranted;
                    if (!armory) armory = b;
                }
            }
            if (this.soldierMgr.totalSoldiers < entitledSoldiers && armory) {
                this._retrainSoldierTimer = (this._retrainSoldierTimer || 0) + worldDt;
                if (this._retrainSoldierTimer >= SOLDIER_CONFIG.retrainTime) {
                    this._retrainSoldierTimer = 0;
                    this.soldierMgr.addSoldiers(1, armory.gx, armory.gy + armory.size);
                    this.toast('Replacement soldier trained', 'info');
                }
            } else {
                this._retrainSoldierTimer = 0;
            }
        }

        // destroyed buildings
        for (let i = this.buildingMgr.buildings.length - 1; i >= 0; i--) {
            const b = this.buildingMgr.buildings[i];
            if (b.hp <= 0) {
                if (b.type === 'base') { this.gameOver(); return; }
                this.particles.explosion(b.worldX, b.worldY, 1.2 + b.size * 0.4);
                this.camera.shake(JUICE.shakeSmall + b.size);
                audio.play('building_destroyed');
                this.grid.vacateArea(b.gx, b.gy, b.size);
                this.buildingMgr.buildings.splice(i, 1);
                if (this.selectedBuilding === b) this.clearSelection();
                this.flowField.markDirty();
                this.wireSystem.dirty = true;
                this.toast(`${b.name} destroyed!`, 'error');
            }
        }

        if (this.ui) this.ui.update(dt);
    }

    // ================= INPUT =================
    handleInput(dt) {
        const input = this.input;

        // ---- keyboard ----
        if (input.isKeyJust('Escape')) {
            const help = document.getElementById('keybindsOverlay');
            if (help.classList.contains('active')) help.classList.remove('active');
            else if (this.placement) this.cancelPlacement();
            else if (this.selectedBuilding || this.workerMgr.getSelectedWorkers().length) this.clearSelection();
            else this.pause();
        }
        if (input.isKeyJust('KeyH')) {
            document.getElementById('keybindsOverlay').classList.toggle('active');
        }
        if (input.isKeyJust('KeyB')) {
            document.getElementById('buildDock').classList.toggle('hidden');
        }
        if (input.isKeyJust('KeyG')) this.showGrid = !this.showGrid;
        if (input.isKeyJust('KeyV')) {
            this.toggleWireMode(!(this.placement && this.placement.kind === 'wire'));
        }
        if (input.isKeyJust('KeyF') && this.buildingMgr.base) {
            this.camera.focusOn(this.buildingMgr.base.worldX, this.buildingMgr.base.worldY);
        }
        if (input.isKeyJust('Space')) this.waveMgr.startEarly(this);
        if (input.isKeyJust('KeyP')) {
            this.setGameSpeed(this.gameSpeed === 0 ? this._lastSpeed || 1 : 0);
        }
        if (input.isKeyJust('Minus')) this.setGameSpeed(this.gameSpeed > 1 ? this.gameSpeed - 1 : this.gameSpeed === 1 ? 0 : 0);
        if (input.isKeyJust('Equal')) this.setGameSpeed(this.gameSpeed === 0 ? 1 : Math.min(3, this.gameSpeed + 1));
        if (input.isKeyJust('KeyU') && this.selectedBuilding) this.upgradeSelected();
        if (input.isKeyJust('Delete') && this.selectedBuilding) this.sellSelected();
        if (input.isCtrl() && input.isKeyJust('KeyA')) {
            this.workerMgr.selectAll();
            this.selectedBuilding = null;
            for (const b of this.buildingMgr.buildings) b.selected = false;
            if (this.ui) this.ui.markSelectionDirty();
            this.toast(`${this.workerMgr.totalWorkers} workers selected`, 'info');
        }
        for (let i = 0; i < 9 && i < this.buildHotkeys.length; i++) {
            if (input.isKeyJust(`Digit${i + 1}`)) {
                const type = this.buildHotkeys[i];
                if (this.isBuildingUnlocked(type)) this.setPlacement(type);
                else { this.toast(this.buildRequirementHint(type), 'warning'); audio.play('invalid'); }
            }
        }
        if (input.isKeyJust('Tab')) {
            const built = this.buildingMgr.buildings.filter(b => b.built);
            if (built.length > 0) {
                const idx = this.selectedBuilding ? built.indexOf(this.selectedBuilding) : -1;
                const next = built[(idx + 1) % built.length];
                this.selectBuilding(next);
                this.camera.focusOn(next.worldX, next.worldY);
            }
        }

        // ---- mouse ----
        const { gx, gy } = this.grid.worldToGrid(input.mouseWorld.x, input.mouseWorld.y);
        const p = this.placement;

        // wall drag-line preview
        this.wallDragCells = [];
        if (p && p.kind === 'building' && BUILDINGS[p.type].size === 1 &&
            input.mouseDown.left && input.dragStart && input.isDragging) {
            const s = this.camera.screenToWorld(input.dragStart.x, input.dragStart.y, this.renderer.w, this.renderer.h);
            const sc = this.grid.worldToGrid(s.x, s.y);
            this.wallDragCells = this._lineCells(sc.gx, sc.gy, gx, gy);
        }

        // wire painting
        if (p && p.kind === 'wire') {
            if (input.mouseDown.left && !input.mouseOverUI) {
                if (this.wireSystem.placeWire(gx, gy, this.wireSystem.selectedWireType, this.resourceMgr)) {
                    audio.play('place');
                    this.wireSystem.dirty = true;
                }
            }
            if (input.mouseDown.right && !input.mouseOverUI) {
                if (this.wireSystem.removeWire(gx, gy, this.resourceMgr)) {
                    audio.play('sell');
                    this.wireSystem.dirty = true;
                }
            }
            return; // wire mode swallows other mouse handling
        }

        // remember drag cells while dragging (consumed on release)
        if (this.wallDragCells.length) this._lastDragCells = this.wallDragCells.slice();

        // left release: place or select
        if (input.mouseJustUp.left && !input.mouseOverUI) {
            const box = input.getBoxSelect(); // non-null if this release ended a drag

            if (p && p.kind === 'building') {
                const def = BUILDINGS[p.type];
                if (def.size === 1 && box && this._lastDragCells && this._lastDragCells.length) {
                    // line placement from the drag we just finished
                    let placed = 0;
                    for (const cell of this._lastDragCells) {
                        if (this._placeBuildingAt(p.type, cell.gx, cell.gy, true)) placed++;
                    }
                    if (placed > 0) audio.play('place');
                } else {
                    this._placeBuildingAt(p.type, gx, gy, false);
                    if (!input.isShift() && def.size !== 1) this.cancelPlacement();
                }
            } else if (p && p.kind === 'teleportPick') {
                const b = this.buildingMgr.getBuildingAt(gx, gy);
                if (b && b.built && b.type !== 'base' && b.type !== 'teleporter') {
                    this.placement = { kind: 'teleportDest', tp: p.tp, source: b };
                    this.toast('Now click the destination', 'info');
                } else {
                    this.toast('Pick a building to relocate (not the base)', 'warning');
                }
            } else if (p && p.kind === 'teleportDest') {
                this._executeTeleport(p, gx, gy);
            } else if (!box) {
                // plain click: select worker > building > nothing
                this._handleSelectClick(gx, gy);
            } else {
                this._handleBoxSelect(box);
            }
            this._lastDragCells = null;
        }

        // right click
        if (input.mouseJustDown.right && !input.mouseOverUI) {
            if (this.placement) {
                this.cancelPlacement();
            } else {
                const selWorkers = this.workerMgr.getSelectedWorkers();
                const selSoldiers = this.soldierMgr.getSelected();
                if (selWorkers.length > 0 || selSoldiers.length > 0) {
                    if (selWorkers.length > 0) this.workerMgr.commandSelectedTo(gx, gy, this, input.isShift());
                    if (selSoldiers.length > 0) this.soldierMgr.commandSelectedTo(gx, gy, this);
                    this.moveMarkers.push({
                        x: gx * GRID_SIZE + GRID_SIZE / 2,
                        y: gy * GRID_SIZE + GRID_SIZE / 2,
                        t: 1
                    });
                    audio.play('click');
                } else if (this.selectedBuilding) {
                    this.clearSelection();
                }
            }
        }

        // consume stray box selects (e.g. drag during placement)
        input.getBoxSelect();
    }

    _lineCells(x0, y0, x1, y1) {
        // L-shaped: dominant axis first, then the other
        x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; // integer safety for the walk loops
        const cells = [];
        const dx = x1 - x0, dy = y1 - y0;
        if (Math.abs(dx) + Math.abs(dy) > 300) return cells;
        const seen = new Set();
        const add = (x, y) => {
            const k = `${x},${y}`;
            if (!seen.has(k)) { seen.add(k); cells.push({ gx: x, gy: y }); }
        };
        if (Math.abs(dx) >= Math.abs(dy)) {
            const sx = Math.sign(dx) || 1;
            for (let x = x0; x !== x1 + sx; x += sx) add(x, y0);
            const sy = Math.sign(dy) || 1;
            for (let y = y0; y !== y1 + sy; y += sy) add(x1, y);
        } else {
            const sy = Math.sign(dy) || 1;
            for (let y = y0; y !== y1 + sy; y += sy) add(x0, y);
            const sx = Math.sign(dx) || 1;
            for (let x = x0; x !== x1 + sx; x += sx) add(x, y1);
        }
        return cells;
    }

    _placeBuildingAt(type, gx, gy, silent) {
        if (!this.isBuildingUnlocked(type)) return null;
        const def = BUILDINGS[type];
        if (!this.grid.canPlace(gx, gy, def.size)) {
            if (!silent) { this.toast('Blocked — clear the area first', 'warning'); audio.play('invalid'); }
            return null;
        }
        if (!this.resourceMgr.canAfford(def.cost)) {
            if (!silent) { this.toast('Not enough resources', 'warning'); audio.play('invalid'); }
            return null;
        }
        const building = this.buildingMgr.placeBuilding(type, gx, gy, this.grid, this.resourceMgr);
        if (!building) return null;
        this.stats.built++;
        this.flowField.markDirty();
        this.wireSystem.dirty = true;
        this._checkFrontier(building);
        this.particles.constructionDust(building.worldX, building.worldY, def.size * 0.6);
        if (!silent) audio.play('place');
        const assigned = this.workerMgr.autoAssignBuild(building, this);
        if (assigned === 0) this.toast('No workers available — construction will wait', 'warning');
        return building;
    }

    _executeTeleport(p, gx, gy) {
        const b = p.source;
        const tp = p.tp;
        const cost = { darkMatter: b.size * b.size * TELEPORTER_CONFIG.darkMatterPerCell };
        if (!this.grid.canPlace(gx, gy, b.size)) {
            this.toast('Destination blocked', 'warning'); audio.play('invalid'); return;
        }
        if (!this.resourceMgr.canAfford(cost)) {
            this.toast(`Needs ${cost.darkMatter} dark matter`, 'warning'); audio.play('invalid'); return;
        }
        this.resourceMgr.spend(cost);
        this.particles.teleportEffect(b.worldX, b.worldY);
        this.grid.vacateArea(b.gx, b.gy, b.size);
        b.gx = gx; b.gy = gy;
        this.grid.occupyArea(gx, gy, b.size, 'building', b);
        b.spawnPop = 1;
        this.particles.teleportEffect(b.worldX, b.worldY);
        audio.play('teleport');
        tp.teleportCooldown = TELEPORTER_CONFIG.cooldown;
        this.flowField.markDirty();
        this.wireSystem.dirty = true;
        this._checkFrontier(b);
        this.cancelPlacement();
        this.toast(`${b.name} relocated`, 'success');
        if (this.ui) this.ui.markSelectionDirty();
    }

    _handleSelectClick(gx, gy) {
        const soldier = this.soldierMgr.getSoldierAt(this.input.mouseWorld.x, this.input.mouseWorld.y);
        const worker = soldier ? null : this.workerMgr.getWorkerAt(this.input.mouseWorld.x, this.input.mouseWorld.y);
        const additive = this.input.isShift();
        if (!additive) {
            this.workerMgr.deselectAll();
            this.soldierMgr.deselectAll();
            for (const b of this.buildingMgr.buildings) b.selected = false;
            this.selectedBuilding = null;
        }
        if (soldier) {
            soldier.selected = true;
            audio.play('click');
        } else if (worker) {
            worker.selected = true;
            audio.play('click');
        } else {
            const building = this.buildingMgr.getBuildingAt(gx, gy);
            if (building) {
                this.selectBuilding(building);
                audio.play('click');
            }
        }
        if (this.ui) this.ui.markSelectionDirty();
    }

    _handleBoxSelect(box) {
        const w1 = this.camera.screenToWorld(box.x1, box.y1, this.renderer.w, this.renderer.h);
        const w2 = this.camera.screenToWorld(box.x2, box.y2, this.renderer.w, this.renderer.h);
        const workers = this.workerMgr.getWorkersInBox(w1.x, w1.y, w2.x, w2.y);
        const soldiers = this.soldierMgr.getInBox(w1.x, w1.y, w2.x, w2.y);
        this.workerMgr.deselectAll();
        this.soldierMgr.deselectAll();
        for (const b of this.buildingMgr.buildings) b.selected = false;
        this.selectedBuilding = null;
        for (const w of workers) w.selected = true;
        for (const s of soldiers) s.selected = true;
        const total = workers.length + soldiers.length;
        if (total > 0) {
            const parts = [];
            if (workers.length) parts.push(`${workers.length} worker${workers.length > 1 ? 's' : ''}`);
            if (soldiers.length) parts.push(`${soldiers.length} soldier${soldiers.length > 1 ? 's' : ''}`);
            this.toast(`${parts.join(' + ')} selected`, 'info');
            audio.play('click');
        }
        if (this.ui) this.ui.markSelectionDirty();
    }

    // ================= COMMANDS =================
    setPlacement(type) {
        if (this.placement && this.placement.kind === 'wire') this.toggleWireMode(false);
        this.placement = { kind: 'building', type };
        this.clearSelection(false);
    }

    cancelPlacement() {
        if (this.placement && this.placement.kind === 'wire') {
            this.toggleWireMode(false);
            return;
        }
        this.placement = null;
        this.wallDragCells = [];
    }

    toggleWireMode(on) {
        if (on) {
            this.placement = { kind: 'wire' };
            this.wireSystem.wireViewActive = true;
            this.clearSelection(false);
            this.toast('Wire mode — drag to lay wires, right-drag to remove', 'info');
        } else {
            if (this.placement && this.placement.kind === 'wire') this.placement = null;
            this.wireSystem.wireViewActive = false;
        }
        if (this.ui) this.ui.setWireMode(on);
    }

    startTeleportMode(teleporter) {
        this.placement = { kind: 'teleportPick', tp: teleporter };
        this.toast('Click the building you want to relocate', 'info');
    }

    selectBuilding(b) {
        for (const bld of this.buildingMgr.buildings) bld.selected = false;
        this.workerMgr.deselectAll();
        this.soldierMgr.deselectAll();
        b.selected = true;
        this.selectedBuilding = b;
        if (this.ui) this.ui.markSelectionDirty();
    }

    clearSelection(clearPlacementToo = true) {
        this.workerMgr.deselectAll();
        this.soldierMgr.deselectAll();
        for (const b of this.buildingMgr.buildings) b.selected = false;
        this.selectedBuilding = null;
        if (this.ui) this.ui.markSelectionDirty();
    }

    upgradeSelected() {
        const b = this.selectedBuilding;
        if (!b || !b.built) return;
        if (b.upgrade(this)) {
            this.particles.upgradeEffect(b.worldX, b.worldY);
            audio.play('upgrade');
            this.toast(`${b.name} upgraded to ${UPGRADE_LEVELS[b.level].name}`, 'success');
            this._grantBarracksWorkers(b);
            if (this.ui) this.ui.markSelectionDirty();
        } else {
            this.toast(b.level >= 3 ? 'Already at max level' : 'Not enough resources', 'warning');
            audio.play('invalid');
        }
    }

    sellSelected() {
        const b = this.selectedBuilding;
        if (!b || b.type === 'base') return;
        const refund = b.getSellRefund();
        this.buildingMgr.removeBuilding(b, this.grid, this.resourceMgr);
        this.flowField.markDirty();
        this.wireSystem.dirty = true;
        this.particles.constructionDust(b.worldX, b.worldY, b.size * 0.6);
        audio.play('sell');
        const txt = Object.entries(refund).map(([r, a]) => `+${a} ${r}`).join(', ');
        this.toast(`Sold ${b.name} (${txt})`, 'info');
        this.clearSelection();
    }

    setGameSpeed(v) {
        if (this.gameSpeed > 0) this._lastSpeed = this.gameSpeed;
        this.gameSpeed = v;
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === v);
        });
    }

    // Tech tree: a building is available once its prerequisites are BUILT
    isBuildingUnlocked(type) {
        const def = BUILDINGS[type];
        if (!def || !def.requires) return true;
        for (const [req, n] of Object.entries(def.requires)) {
            if (this.buildingMgr.countByType(req) < n) return false;
        }
        return true;
    }

    buildRequirementHint(type) {
        const def = BUILDINGS[type];
        if (!def || !def.requires) return '';
        const parts = Object.entries(def.requires).map(([req, n]) =>
            `${BUILDINGS[req] ? BUILDINGS[req].name : req}${n > 1 ? ' x' + n : ''}`);
        return 'Requires: ' + parts.join(' + ');
    }

    _announceNewUnlocks() {
        if (!this._announcedUnlocks) this._announcedUnlocks = new Set();
        for (const type of Object.keys(BUILDINGS)) {
            if (type === 'base' || !BUILDINGS[type].requires) continue;
            if (this._announcedUnlocks.has(type)) continue;
            if (this.isBuildingUnlocked(type)) {
                this._announcedUnlocks.add(type);
                this.toast(`Unlocked: ${BUILDINGS[type].name}`, 'success');
                audio.play('upgrade');
            }
        }
    }

    // ================= EVENTS (called by subsystems) =================
    onBuildingComplete(building) {
        audio.play('complete');
        this.particles.constructionDust(building.worldX, building.worldY, building.size);
        this.toast(`${building.name} online`, 'success');
        this.flowField.markDirty();
        this.wireSystem.dirty = true;
        this._grantBarracksWorkers(building);
        this._announceNewUnlocks();
        if (this.ui) this.ui.markSelectionDirty();
    }

    onWorkerLost() {
        this.camera.shake(1.5);
        if (!this._workerLostToast || this.time - this._workerLostToast > 2.5) {
            this._workerLostToast = this.time;
            this.toast('Worker lost!', 'error');
        }
    }

    // Building near the edge of the known world reveals fresh resource rings
    _checkFrontier(building) {
        const base = this.buildingMgr.base;
        if (!base) return;
        const cx = base.gx + Math.floor(base.size / 2);
        const cy = base.gy + Math.floor(base.size / 2);
        const d = Math.max(Math.abs(building.gx - cx), Math.abs(building.gy - cy));
        if (this.resourceMgr.expandFrontier(this.grid, d + 16)) {
            this.toast('New deposits discovered beyond the frontier', 'success');
            audio.play('complete');
        }
    }

    // Barracks/Armory train units per level; grant whatever is owed
    _grantBarracksWorkers(building) {
        if (!building.built) return;
        if (building.workersProvided) {
            const owed = building.workersProvided * building.level - building.workersGranted;
            if (owed > 0) {
                const before = this.workerMgr.totalWorkers;
                this.workerMgr.addWorkers(owed, building.gx, building.gy + building.size);
                const added = this.workerMgr.totalWorkers - before;
                building.workersGranted += added;
                if (added > 0) this.toast(`+${added} workers trained`, 'success');
                else this.toast(`Worker limit reached (${this.workerMgr.totalWorkers})`, 'warning');
            }
        }
        if (building.soldiersProvided) {
            const owed = building.soldiersProvided * building.level - building.soldiersGranted;
            if (owed > 0) {
                const before = this.soldierMgr.totalSoldiers;
                this.soldierMgr.addSoldiers(owed, building.gx, building.gy + building.size);
                const added = this.soldierMgr.totalSoldiers - before;
                building.soldiersGranted += added;
                if (added > 0) this.toast(`+${added} soldiers trained`, 'success');
                else this.toast(`Soldier limit reached (${this.soldierMgr.totalSoldiers})`, 'warning');
            }
        }
    }

    mountBaseWeapon(kind) {
        const base = this.buildingMgr.base;
        const def = BASE_MOUNTS[kind];
        if (!base || !def || base.mountedWeapon) return;
        if (base.level < 2) {
            this.toast('Upgrade the bunker to Mk II first', 'warning');
            audio.play('invalid');
            return;
        }
        if (!this.resourceMgr.canAfford(def.cost)) {
            this.toast('Not enough resources', 'warning');
            audio.play('invalid');
            return;
        }
        this.resourceMgr.spend(def.cost);
        base.mountedWeapon = kind;
        base.spawnPop = 1;
        this.particles.upgradeEffect(base.worldX, base.worldY);
        audio.play('upgrade');
        this.toast(`${def.name} installed on the Command Bunker`, 'success');
        if (this.ui) this.ui.markSelectionDirty();
    }

    onSoldierLost() {
        this.camera.shake(1.5);
        if (!this._soldierLostToast || this.time - this._soldierLostToast > 2.5) {
            this._soldierLostToast = this.time;
            this.toast('Soldier down!', 'error');
        }
    }

    onBuildingAttacked(building, dmg, enemy) {
        building.takeDamage(dmg);
        if (building.type === 'base') {
            this.baseDamageFlash = Math.min(1, this.baseDamageFlash + 0.55);
            this.camera.shake(2.5);
            if (this._baseHitSound <= 0) {
                audio.play('base_hit');
                this._baseHitSound = 0.35;
            }
        }
        // walls getting chewed → flow costs shift
        if (building.hp <= 0) this.flowField.markDirty();
    }

    onWaveCleared() {
        // quiet autosave so Continue always works — deferred off the
        // wave-clear frame (which is often busy with death effects)
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = setTimeout(() => {
            if (this.state === 'playing') saveGame(this);
        }, 400);
    }

    // ================= FLOW =================
    render() {
        this.renderer.drawGame(this);
    }

    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        document.getElementById('pauseMenu').classList.add('active');
    }

    resume() {
        this.state = 'playing';
        document.getElementById('pauseMenu').classList.remove('active');
    }

    victory() {
        this.state = 'victory';
        audio.play('victory');
        const base = this.buildingMgr.base;
        const hpPct = base ? base.hp / base.maxHp : 0;
        const stars = hpPct >= 0.9 ? 3 : hpPct >= 0.5 ? 2 : 1;
        const level = this.waveMgr.campaignLevel;
        progress.completeLevel(level, stars);
        deleteSave();
        const statsText =
            `Level ${level} complete\n` +
            `Base integrity: ${Math.round(hpPct * 100)}%\n` +
            `Enemies destroyed: ${this.stats.kills}\n` +
            `Buildings constructed: ${this.stats.built}`;
        if (this.ui) this.ui.showVictory(stars, statsText, level < 30);
    }

    gameOver() {
        this.state = 'gameover';
        audio.play('defeat');
        this.camera.shake(JUICE.shakeBig);
        if (this.gameMode === 'infinite') {
            progress.recordInfinite(this.waveMgr.currentWave, this.waveMgr.score);
        }
        deleteSave();
        const statsText =
            `Waves survived: ${this.waveMgr.currentWave}\n` +
            `Score: ${this.waveMgr.score}\n` +
            `Enemies destroyed: ${this.stats.kills}` +
            (this.gameMode === 'infinite' ? `\nBest: wave ${progress.data.bestInfiniteWave} · ${progress.data.bestInfiniteScore} pts` : '');
        if (this.ui) this.ui.showGameOver(statsText);
    }

    announceWave(num, hasBoss = false, sideNames = []) {
        const el = document.getElementById('waveAnnounce');
        document.getElementById('waveNum').textContent = num;
        const sub = document.getElementById('waveSub');
        el.classList.toggle('boss', hasBoss);
        if (hasBoss) sub.textContent = 'BOSS DETECTED';
        else if (sideNames.length) sub.textContent = `FROM THE ${sideNames.join(' + ')}`;
        else sub.textContent = 'Enemies approaching!';
        el.classList.add('show');
        clearTimeout(this._announceTimer);
        this._announceTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    toast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        while (container.children.length > 5) container.firstChild.remove();
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    hideAllOverlays() {
        document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active'));
    }
}
