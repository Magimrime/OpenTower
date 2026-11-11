// ===== RENDERER =====
// World-space rendering only — all HUD/menus live in the HTML UI layer.
import { GRID_SIZE, BUILDINGS, MAP_CONFIG, ENEMIES, UPGRADE_TIER_COLORS } from './config.js';
import {
    getSprite, paintTerrainCell, drawTreeSprite, drawStumpSprite, drawOreSprite, drawBaseSprite,
    drawTurretBase, drawTurretBarrel, drawWallSprite, drawLumberMill, drawQuarry,
    drawMine, drawCrystalExtractor, drawPowerPlant, drawBarracks, drawUpgradeStation,
    drawRadar, drawRepairStation, drawTeleporter, drawEnemySprite, drawWorkerSprite,
    drawShadowBlob, getGlowSprite, getMuzzleFlashSprite, drawScaffold,
    drawGateSprite, drawSoldierSprite, drawArmory
} from './utils/sprites.js';
import { hash2 } from './utils/math.js';

const CHUNK_CELLS = 8;
const CHUNK_PX = CHUNK_CELLS * GRID_SIZE;

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.terrainChunks = new Map();
        this.vignette = null;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        // never 0×0 (hidden/minimized windows report 0 and break drawImage)
        this.canvas.width = Math.max(2, window.innerWidth);
        this.canvas.height = Math.max(2, window.innerHeight);
        this.vignette = null;    // rebuilt at the new size
        this.redVignette = null;
    }

    get w() { return this.canvas.width; }
    get h() { return this.canvas.height; }

    // Bake every sprite the game can need up front so nothing (especially
    // big boss sprites) causes a hitch the first time it appears mid-fight.
    prewarm(game) {
        if (this._prewarmed) return;
        this._prewarmed = true;
        const gs = GRID_SIZE;
        for (const type of Object.keys(BUILDINGS)) {
            for (let level = 1; level <= 3; level++) {
                this.getBuildingSprite(game, type, level, 0);
                if (BUILDINGS[type].damage) {
                    getSprite(`barrel_${type}_${level}`, (c, w, h) => drawTurretBarrel(c, w, h, type, level), 56, 56);
                }
            }
        }
        for (let mask = 0; mask < 16; mask++) {
            getSprite(`wall_wall_${mask}`, (c, w, h) => drawWallSprite(c, w, h, mask, false), gs, gs);
            getSprite(`wall_reinforcedWall_${mask}`, (c, w, h) => drawWallSprite(c, w, h, mask, true), gs, gs);
            getSprite(`gate_${mask}`, (c, w, h) => drawGateSprite(c, w, h, mask), gs, gs);
        }
        for (const [type, def] of Object.entries(ENEMIES)) {
            const px = Math.ceil(gs * 2 * Math.max(1, def.size || 0.7));
            getSprite(`enemy_${type}`, (c, w, h) => drawEnemySprite(c, w, h, type), px, px);
        }
        for (let v = 0; v < 4; v++) {
            getSprite(`tree${v}`, (c, w, h) => drawTreeSprite(c, w, h, v), gs, gs);
        }
        getSprite('stump', drawStumpSprite, gs, gs);
        for (const ore of ['stoneDeposit', 'copperOre', 'ironOre', 'goldOre', 'crystalNode', 'obsidianShard']) {
            getSprite(`ore_${ore}`, (c, w, h) => drawOreSprite(c, w, h, ore), gs, gs);
        }
        for (let s = 1; s <= 3; s++) {
            getSprite(`scaffold_${s}`, drawScaffold, s * gs, s * gs);
        }
        getMuzzleFlashSprite();
        for (const color of ['rgba(255,255,255,0.9)', 'rgba(120,230,255,0.9)', '#ffaa00', '#ff4400', '#00ccff', '#ff6600']) {
            getGlowSprite(color, 32);
        }
    }

    // ================= MAIN =================
    drawGame(game) {
        const { ctx } = this;
        const cam = game.camera;

        ctx.fillStyle = '#141f14';
        ctx.fillRect(0, 0, this.w, this.h);

        cam.applyTransform(ctx, this.w, this.h);
        const bounds = cam.getViewBounds(this.w, this.h);

        this.drawTerrain(bounds);
        this.drawMoveMarkers(game);
        this.drawResourceNodes(game, bounds);
        this.drawGridOverlay(game, bounds);
        this.drawBuildings(game, bounds);
        this.drawWorkers(game, bounds);
        this.drawSoldiers(game, bounds);
        this.drawEnemies(game, bounds);
        game.projectileMgr.draw(ctx);
        this.drawBeams(game);
        game.particles.draw(ctx);
        game.floatingText.draw(ctx, cam.zoom);
        if (game.wireSystem.wireViewActive) {
            game.wireSystem.draw(ctx, cam, this.w, this.h, game.time);
        }
        this.drawPlacementPreview(game);
        this.drawRangeIndicator(game);

        ctx.restore();

        // screen-space layers
        this.drawSelectionBox(game);
        this.drawSpawnWarnings(game);
        this.drawVignette(game);
    }

    // ================= TERRAIN =================
    _getChunk(cx, cy) {
        const key = `${cx},${cy}`;
        let chunk = this.terrainChunks.get(key);
        if (!chunk) {
            chunk = document.createElement('canvas');
            chunk.width = CHUNK_PX;
            chunk.height = CHUNK_PX;
            const cctx = chunk.getContext('2d');
            for (let dx = 0; dx < CHUNK_CELLS; dx++) {
                for (let dy = 0; dy < CHUNK_CELLS; dy++) {
                    paintTerrainCell(cctx, dx * GRID_SIZE, dy * GRID_SIZE, GRID_SIZE,
                        cx * CHUNK_CELLS + dx, cy * CHUNK_CELLS + dy);
                }
            }
            // trim cache if it grows too large
            if (this.terrainChunks.size > 320) {
                const it = this.terrainChunks.keys();
                for (let i = 0; i < 80; i++) this.terrainChunks.delete(it.next().value);
            }
            this.terrainChunks.set(key, chunk);
        }
        return chunk;
    }

    drawTerrain(bounds) {
        const { ctx } = this;
        const sx = Math.floor(bounds.left / CHUNK_PX);
        const ex = Math.floor(bounds.right / CHUNK_PX);
        const sy = Math.floor(bounds.top / CHUNK_PX);
        const ey = Math.floor(bounds.bottom / CHUNK_PX);
        for (let cx = sx; cx <= ex; cx++) {
            for (let cy = sy; cy <= ey; cy++) {
                ctx.drawImage(this._getChunk(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX);
            }
        }
    }

    drawGridOverlay(game, bounds) {
        const { ctx } = this;
        const placing = game.placement && game.placement.kind !== 'teleportPick';
        if (!game.showGrid && !placing && !game.wireSystem.wireViewActive) return;
        const gs = GRID_SIZE;
        const sx = Math.floor(bounds.left / gs);
        const ex = Math.ceil(bounds.right / gs);
        const sy = Math.floor(bounds.top / gs);
        const ey = Math.ceil(bounds.bottom / gs);

        ctx.strokeStyle = 'rgba(0, 200, 255, 0.07)';
        ctx.lineWidth = 1 / game.camera.zoom;
        ctx.beginPath();
        for (let x = sx; x <= ex; x++) { ctx.moveTo(x * gs, sy * gs); ctx.lineTo(x * gs, ey * gs); }
        for (let y = sy; y <= ey; y++) { ctx.moveTo(sx * gs, y * gs); ctx.lineTo(ex * gs, y * gs); }
        ctx.stroke();
    }

    // ================= NODES =================
    drawResourceNodes(game, bounds) {
        const { ctx } = this;
        const gs = GRID_SIZE;
        for (const node of game.resourceMgr.nodes) {
            if (node.depleted) continue;
            const wx = node.gx * gs, wy = node.gy * gs;
            if (wx + gs < bounds.left || wx > bounds.right || wy + gs < bounds.top || wy > bounds.bottom) continue;

            const h = hash2(node.gx, node.gy);
            if (node.type === 'tree' && node.isStump) {
                const sprite = getSprite('stump', drawStumpSprite, gs, gs);
                ctx.save();
                ctx.translate(wx + gs / 2, wy + gs / 2);
                if (h > 0.5) ctx.scale(-1, 1);
                ctx.drawImage(sprite, -gs / 2, -gs / 2);
                ctx.restore();
            } else if (node.type === 'tree') {
                const variant = Math.floor(h * 4);
                const sprite = getSprite(`tree${variant}`, (c, w, hh) => drawTreeSprite(c, w, hh, variant), gs, gs);
                const flip = h > 0.5;
                let scale = 1.02 + hash2(node.gx * 3, node.gy * 5) * 0.35;
                // regrown trees ease in from a sapling
                if (node.spawnAt !== undefined) {
                    const age = game.time - node.spawnAt;
                    if (age < 3) {
                        const t = age / 3;
                        scale *= 0.25 + 0.75 * (1 - (1 - t) * (1 - t));
                    }
                }
                ctx.save();
                ctx.translate(wx + gs / 2, wy + gs / 2);
                ctx.scale(flip ? -scale : scale, scale);
                ctx.drawImage(sprite, -gs / 2, -gs / 2);
                ctx.restore();
            } else {
                const sprite = getSprite(`ore_${node.type}`, (c, w, hh) => drawOreSprite(c, w, hh, node.type), gs, gs);
                ctx.drawImage(sprite, wx, wy);
            }

            // depletion bar
            const pct = node.amount / node.maxAmount;
            if (pct < 0.6) {
                this._bar(ctx, wx + 6, wy + gs - 5, gs - 12, 3,
                    pct, pct < 0.25 ? '#ff3344' : '#ffaa00');
            }
        }
    }

    // ================= BUILDINGS =================
    _wallMask(game, b) {
        let mask = 0;
        const isWall = (gx, gy) => {
            const occ = game.grid.getOccupant(gx, gy);
            return occ && occ.type === 'building' && occ.entity &&
                (occ.entity.type === 'wall' || occ.entity.type === 'reinforcedWall' ||
                 occ.entity.type === 'gate');
        };
        if (isWall(b.gx, b.gy - 1)) mask |= 1;
        if (isWall(b.gx + 1, b.gy)) mask |= 2;
        if (isWall(b.gx, b.gy + 1)) mask |= 4;
        if (isWall(b.gx - 1, b.gy)) mask |= 8;
        return mask;
    }

    // Solid extruded sides for a sprite: stacked darkened copies that keep
    // the material's hue, so every structure reads as a raised 3D block.
    _getDepthLayer(sprite, depth = 5) {
        if (!this._depthCache) this._depthCache = new WeakMap();
        let d = this._depthCache.get(sprite);
        if (!d) {
            // darkened material copy (keeps some color, unlike a flat shadow)
            const dark = document.createElement('canvas');
            dark.width = sprite.width;
            dark.height = sprite.height;
            const dc = dark.getContext('2d');
            dc.drawImage(sprite, 0, 0);
            dc.globalCompositeOperation = 'source-atop';
            dc.fillStyle = 'rgba(12, 15, 11, 0.72)';
            dc.fillRect(0, 0, dark.width, dark.height);

            // stack into a continuous extrusion
            d = document.createElement('canvas');
            d.width = sprite.width;
            d.height = sprite.height + depth;
            const c = d.getContext('2d');
            for (let i = depth; i >= 1; i--) c.drawImage(dark, 0, i);
            this._depthCache.set(sprite, d);
        }
        return d;
    }

    getBuildingSprite(game, type, level = 1, maskOverride = null) {
        const def = BUILDINGS[type];
        const px = def.size * GRID_SIZE;
        switch (type) {
            case 'base': return getSprite('base', drawBaseSprite, px, px);
            case 'machineGun': case 'cannon': case 'laser': case 'missile':
                return getSprite(`tbase_${type}_${level}`, (c, w, h) => drawTurretBase(c, w, h, type, level), px, px);
            case 'wall': case 'reinforcedWall': {
                const mask = maskOverride ?? 0;
                return getSprite(`wall_${type}_${mask}`, (c, w, h) =>
                    drawWallSprite(c, w, h, mask, type === 'reinforcedWall'), px, px);
            }
            case 'gate': {
                const mask = maskOverride ?? 0;
                return getSprite(`gate_${mask}`, (c, w, h) =>
                    drawGateSprite(c, w, h, mask), px, px);
            }
            case 'armory': return getSprite('armory', drawArmory, px, px);
            case 'lumberMill': return getSprite('lumberMill', drawLumberMill, px, px);
            case 'quarry': return getSprite('quarry', drawQuarry, px, px);
            case 'mine': return getSprite('mine', drawMine, px, px);
            case 'crystalExtractor': return getSprite('crystalExtractor', drawCrystalExtractor, px, px);
            case 'powerPlant': return getSprite('powerPlant', drawPowerPlant, px, px);
            case 'workerBarracks': return getSprite('workerBarracks', drawBarracks, px, px);
            case 'upgradeStation': return getSprite('upgradeStation', drawUpgradeStation, px, px);
            case 'radar': return getSprite('radar', drawRadar, px, px);
            case 'repairStation': return getSprite('repairStation', drawRepairStation, px, px);
            case 'teleporter': return getSprite('teleporter', drawTeleporter, px, px);
            default: return getSprite(`generic_${type}`, (c, w, h) => {
                c.fillStyle = def.color; c.fillRect(4, 4, w - 8, h - 8);
            }, px, px);
        }
    }

    drawBuildings(game, bounds) {
        const { ctx } = this;
        const gs = GRID_SIZE;
        const t = game.time;

        for (const b of game.buildingMgr.buildings) {
            const wx = b.gx * gs, wy = b.gy * gs;
            const bw = b.size * gs, bh = b.size * gs;
            if (wx + bw < bounds.left || wx > bounds.right || wy + bh < bounds.top || wy > bounds.bottom) continue;

            if (!b.built) {
                this._drawConstruction(game, b, wx, wy, bw, bh);
                continue;
            }

            const cx = wx + bw / 2, cy = wy + bh / 2;
            const pop = b.spawnPop > 0 ? 1 + Math.sin(b.spawnPop * Math.PI) * 0.07 : 1;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(pop, pop);

            const mask = (b.type === 'wall' || b.type === 'reinforcedWall' || b.type === 'gate')
                ? this._wallMask(game, b) : null;
            const sprite = this.getBuildingSprite(game, b.type, b.level, mask);
            // pseudo-3D: solid extruded sides beneath the silhouette
            const depth = 4 + b.size * 2;
            ctx.drawImage(this._getDepthLayer(sprite, depth), -bw / 2, -bh / 2);
            ctx.drawImage(sprite, -bw / 2, -bh / 2);

            // ---- dynamic per-type flair ----
            if (b.type === 'base') {
                // pulsing core glow (with or without a weapon on top)
                const pulse = 0.5 + Math.sin(t * 2.2) * 0.5;
                ctx.globalAlpha = 0.25 + pulse * 0.3;
                ctx.drawImage(getGlowSprite('rgba(0,255,136,0.8)', 64), -bw * 0.18, -bh * 0.18, bw * 0.36, bh * 0.36);
                ctx.globalAlpha = 1;
            }
            if (b.isTurret) {
                const barrelType = b.type === 'base'
                    ? (b.mountedWeapon === 'gun' ? 'machineGun' : 'cannon')
                    : b.type;
                const barrel = getSprite(`barrel_${barrelType}_${b.level}`, (c, w, h) =>
                    drawTurretBarrel(c, w, h, barrelType, b.level), 56, 56);
                const bs = b.type === 'base' ? 76 : 56;
                ctx.save();
                ctx.rotate(b.rotation);
                ctx.translate(-b.recoil * 4, 0);
                ctx.drawImage(barrel, -bs / 2, -bs / 2, bs, bs);
                if (b.muzzleTimer > 0) {
                    const flash = getMuzzleFlashSprite();
                    ctx.globalCompositeOperation = 'lighter';
                    const fx = b.type === 'base' ? 34 : bw * 0.42 - 6;
                    ctx.drawImage(flash, fx, -14, 28, 28);
                    ctx.globalCompositeOperation = 'source-over';
                }
                ctx.restore();
            } else if (b.type === 'radar') {
                // rotating scanner dish on the platform hub
                ctx.save();
                ctx.translate(0, -bh * 0.24);
                ctx.rotate(b.dishAngle);
                ctx.fillStyle = '#4e5a66';
                ctx.beginPath();
                ctx.ellipse(5, 0, 12.5, 5.5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#8fa3b0';
                ctx.beginPath();
                ctx.ellipse(3.8, 0, 9.4, 4.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#c2d2dc';
                ctx.beginPath();
                ctx.ellipse(2.6, -0.8, 5.2, 2.3, 0, 0, Math.PI * 2);
                ctx.fill();
                // feed arm + emitter tip
                ctx.strokeStyle = '#2c343c';
                ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15.5, 0); ctx.stroke();
                ctx.fillStyle = '#44ccff';
                ctx.beginPath(); ctx.arc(15.5, 0, 2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                // blinking status light on the hub
                if (Math.sin(t * 4 + b.id) > 0.2) {
                    ctx.fillStyle = '#44ccff';
                    ctx.beginPath();
                    ctx.arc(0, -bh * 0.24 - 5.5, 1.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (b.type === 'gate') {
                // sliding door panels retract into the posts
                const horizontal = !!((mask & 2) || (mask & 8)) || !((mask & 1) || (mask & 4));
                const open = b.doorOpen || 0;
                const pw = 9.5 * (1 - open * 0.92);
                ctx.fillStyle = '#7a828c';
                if (horizontal) {
                    ctx.fillRect(-10, -4.5, pw, 9);
                    ctx.fillRect(10 - pw, -4.5, pw, 9);
                    ctx.fillStyle = '#ffcc66';
                    ctx.fillRect(-10 + pw - 1.2, -4.5, 1.2, 9);
                    ctx.fillRect(10 - pw, -4.5, 1.2, 9);
                } else {
                    ctx.fillRect(-4.5, -10, 9, pw);
                    ctx.fillRect(-4.5, 10 - pw, 9, pw);
                    ctx.fillStyle = '#ffcc66';
                    ctx.fillRect(-4.5, -10 + pw - 1.2, 9, 1.2);
                    ctx.fillRect(-4.5, 10 - pw, 9, 1.2);
                }
            } else if (b.type === 'teleporter') {
                // swirling energy
                ctx.save();
                ctx.rotate(t * 1.5);
                ctx.strokeStyle = 'rgba(204,68,255,0.7)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(0, 0, bw * 0.16 + i * 7, i * 2.1, i * 2.1 + 1.8);
                    ctx.stroke();
                }
                ctx.restore();
                if (b.teleportCooldown > 0) {
                    ctx.fillStyle = 'rgba(0,0,0,0.45)';
                    ctx.beginPath();
                    ctx.arc(0, 0, bw * 0.14, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (b.type === 'powerPlant' && b.powered !== false) {
                const pulse = 0.5 + Math.sin(t * 3 + b.id) * 0.5;
                ctx.globalAlpha = 0.15 + pulse * 0.2;
                ctx.drawImage(getGlowSprite('rgba(255,238,51,0.8)', 64), -bw * 0.25, -bh * 0.27, bw * 0.5, bh * 0.5);
                ctx.globalAlpha = 1;
            } else if (b.gatherFlash > 0) {
                ctx.globalAlpha = b.gatherFlash * 0.8;
                ctx.drawImage(getGlowSprite(b.def.accentColor, 48), -12, -12, 24, 24);
                ctx.globalAlpha = 1;
            }

            // hit flash
            if (b.hitFlash > 0) {
                ctx.globalAlpha = b.hitFlash * 5;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.fillRect(-bw / 2 + 2, -bh / 2 + 2, bw - 4, bh - 4);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }

            ctx.restore();

            // repair pulse ring
            if (b.type === 'repairStation' && b.repairPulse > 0) {
                const radius = (b.def.repairRadius || 6) * gs * (1 - b.repairPulse);
                ctx.strokeStyle = `rgba(68,255,136,${b.repairPulse * 0.5})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // needs-power indicator: blinking bolt badge (drawn, no glyphs)
            if (b.powerDraw > 0 && !b.powered) {
                const blink = Math.sin(t * 5) > 0;
                if (blink) {
                    const ix = cx, iy = wy - 11;
                    ctx.fillStyle = 'rgba(10,12,16,0.88)';
                    ctx.beginPath();
                    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,221,51,0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = '#ffdd33';
                    ctx.beginPath();
                    ctx.moveTo(ix - 1, iy - 5.5);
                    ctx.lineTo(ix + 3, iy - 0.5);
                    ctx.lineTo(ix + 0.5, iy - 0.5);
                    ctx.lineTo(ix + 1, iy + 5.5);
                    ctx.lineTo(ix - 3, iy + 0.5);
                    ctx.lineTo(ix - 0.5, iy + 0.5);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            // level pips (non-turrets): count within tier, colored by tier
            if (b.level > 1 && !b.isTurret) {
                const tier = Math.ceil(b.level / 3);
                const pips = b.level - (tier - 1) * 3 || 3;
                ctx.fillStyle = UPGRADE_TIER_COLORS[Math.min(2, tier - 1)];
                for (let i = 0; i < pips; i++) {
                    ctx.beginPath();
                    ctx.arc(wx + bw - 8 - i * 7, wy + bh - 7, 2.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // HP bar when damaged
            if (b.hp < b.maxHp) {
                const pct = b.hp / b.maxHp;
                this._bar(ctx, wx + 3, wy - 7, bw - 6, 4.5, pct,
                    pct > 0.5 ? '#00ff88' : pct > 0.25 ? '#ffaa00' : '#ff3344');
            }

            // selection ring
            if (b.selected) {
                ctx.strokeStyle = '#00c8ff';
                ctx.lineWidth = 2;
                ctx.setLineDash([7, 4]);
                ctx.lineDashOffset = -t * 18;
                ctx.strokeRect(wx - 3, wy - 3, bw + 6, bh + 6);
                ctx.setLineDash([]);
            }
        }
    }

    _drawConstruction(game, b, wx, wy, bw, bh) {
        const { ctx } = this;
        const scaffold = getSprite(`scaffold_${b.size}`, drawScaffold, bw, bh);
        ctx.drawImage(scaffold, wx, wy);
        // ghost of the finished building rises with progress
        const sprite = this.getBuildingSprite(game, b.type, 1, 0);
        ctx.globalAlpha = 0.25 + b.buildProgress * 0.45;
        ctx.drawImage(sprite, wx, wy);
        ctx.globalAlpha = 1;
        // progress bar
        this._bar(ctx, wx + 4, wy + bh - 8, bw - 8, 5, b.buildProgress, '#00ff88');
        // workers-on-site badge
        const workers = game.workerMgr.workers.filter(w =>
            w.task && w.task.type === 'build' && w.task.target === b).length;
        if (workers > 0) {
            ctx.fillStyle = 'rgba(10,14,20,0.8)';
            ctx.beginPath();
            ctx.arc(wx + bw - 8, wy + 8, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc00';
            ctx.font = '700 10px Rajdhani';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${workers}`, wx + bw - 8, wy + 9);
        }
    }

    _bar(ctx, x, y, w, h, pct, color) {
        ctx.fillStyle = 'rgba(8,10,14,0.75)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 2);
        else ctx.rect(x - 1, y - 1, w + 2, h + 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(x, y, Math.max(0, w * Math.min(1, pct)), h);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y, Math.max(0, w * Math.min(1, pct)), h * 0.4);
    }

    // ================= UNITS =================
    drawSoldiers(game, bounds) {
        const { ctx } = this;
        const pad = GRID_SIZE;
        for (const s of game.soldierMgr.soldiers) {
            if (s.worldX < bounds.left - pad || s.worldX > bounds.right + pad ||
                s.worldY < bounds.top - pad || s.worldY > bounds.bottom + pad) continue;
            const action = s.animAction;
            // rifle rotation happens inside a mirrored space when facing left
            const localAim = s.facing === 1 ? s.aimAngle : Math.PI - s.aimAngle;
            drawSoldierSprite(ctx, s.worldX, s.worldY + 8, {
                facing: s.facing,
                walkPhase: s.walkPhase,
                action,
                aimAngle: localAim,
                selected: s.selected
            });
            if (s.hp < s.maxHp) {
                this._bar(ctx, s.worldX - 9, s.worldY - 28, 18, 2.6, s.hp / s.maxHp,
                    s.hp / s.maxHp > 0.5 ? '#5ac8ff' : '#ff3344');
            }
        }
    }

    drawWorkers(game, bounds) {
        const { ctx } = this;
        const pad = GRID_SIZE;
        for (const w of game.workerMgr.workers) {
            if (w.sheltered) continue; // safe inside the bunker
            if (w.worldX < bounds.left - pad || w.worldX > bounds.right + pad ||
                w.worldY < bounds.top - pad || w.worldY > bounds.bottom + pad) continue;

            let carryColor = null;
            if (w.carrying > 0 && w.carryResource) {
                carryColor = {
                    wood: '#8a6a3a', stone: '#aaaaaa', copper: '#3ec9a7', iron: '#c87c3c',
                    gold: '#ffd700', crystal: '#b040ff', obsidian: '#8f7bd8'
                }[w.carryResource] || '#ccc';
            }
            drawWorkerSprite(ctx, w.worldX, w.worldY + 8, {
                facing: w.facing,
                walkPhase: w.walkPhase,
                action: w.animAction === 'walk' && carryColor ? 'carry' : w.animAction,
                actionPhase: w.actionPhase,
                carryColor,
                selected: w.selected
            });

            // marker above head: red pulse when fleeing, else task diamond
            if (w.fleeing) {
                const pulse = 0.6 + Math.sin(game.time * 9) * 0.4;
                ctx.fillStyle = `rgba(255,60,70,${pulse})`;
                ctx.save();
                ctx.translate(w.worldX, w.worldY - 21);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-2.8, -2.8, 5.6, 5.6);
                ctx.restore();
            } else if (w.task && (w.selected || game.camera.zoom > 1.3)) {
                const colors = { build: '#ffcc00', gather: '#4fd6ff', repair: '#5cff9e', move: '#e8eef4' };
                ctx.fillStyle = colors[w.task.type] || '#ffffff';
                ctx.globalAlpha = 0.9;
                ctx.save();
                ctx.translate(w.worldX, w.worldY - 20);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
                ctx.restore();
                ctx.globalAlpha = 1;
            }

            // health bar when hurt
            if (w.hp < w.maxHp) {
                this._bar(ctx, w.worldX - 9, w.worldY - 28, 18, 2.6, w.hp / w.maxHp,
                    w.hp / w.maxHp > 0.5 ? '#00ff88' : '#ff3344');
            }
        }
    }

    drawEnemies(game, bounds) {
        const { ctx } = this;
        const gs = GRID_SIZE;
        for (const e of game.enemyMgr.enemies) {
            if (e.dead) continue;
            const pad = gs * 2;
            if (e.worldX < bounds.left - pad || e.worldX > bounds.right + pad ||
                e.worldY < bounds.top - pad || e.worldY > bounds.bottom + pad) continue;

            const spritePx = Math.ceil(gs * 2 * Math.max(1, e.size));
            const sprite = getSprite(`enemy_${e.type}`, (c, w, h) => drawEnemySprite(c, w, h, e.type), spritePx, spritePx);
            const dw = gs * e.size * 2;

            drawShadowBlob(ctx, e.worldX + 2, e.worldY + gs * e.size * 0.42, gs * e.size * 0.42, gs * e.size * 0.17, 0.3);

            ctx.save();
            ctx.translate(e.worldX, e.worldY);
            ctx.rotate(e.rotation);
            if (e.attackLunge > 0) ctx.translate(e.attackLunge * 5, 0);
            ctx.drawImage(sprite, -dw / 2, -dw / 2, dw, dw);
            if (e.hitFlash > 0) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = e.hitFlash * 6;
                ctx.drawImage(getGlowSprite('rgba(255,255,255,0.9)', 48), -dw * 0.3, -dw * 0.3, dw * 0.6, dw * 0.6);
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 1;
            }
            ctx.restore();

            if (e.isBoss) {
                const pulse = 0.6 + Math.sin(game.time * 4) * 0.4;
                ctx.strokeStyle = `rgba(255,68,0,${0.35 + pulse * 0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(e.worldX, e.worldY, gs * e.size * 0.75, 0, Math.PI * 2);
                ctx.stroke();
            }

            if (e.hp < e.maxHp) {
                const barW = gs * e.size * 0.9;
                this._bar(ctx, e.worldX - barW / 2, e.worldY - gs * e.size * 0.62 - 6, barW, e.isBoss ? 5 : 3.5,
                    e.hpPercent, e.hpPercent > 0.5 ? '#00ff88' : e.hpPercent > 0.25 ? '#ffaa00' : '#ff3344');
            }
        }
    }

    drawBeams(game) {
        const { ctx } = this;
        for (const b of game.buildingMgr.buildings) {
            if (!b.beamTarget || b.beamTarget.dead) continue;
            const sx = b.worldX + Math.cos(b.rotation) * 10;
            const sy = b.worldY + Math.sin(b.rotation) * 10;
            const tx = b.beamTarget.worldX;
            const ty = b.beamTarget.worldY;
            const flicker = 0.8 + Math.random() * 0.2;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(0,204,255,${0.25 * flicker})`;
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.strokeStyle = `rgba(160,240,255,${0.9 * flicker})`;
            ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.drawImage(getGlowSprite('rgba(120,230,255,0.9)', 32), tx - 8, ty - 8, 16, 16);
            ctx.restore();
        }
    }

    // ================= OVERLAYS =================
    drawMoveMarkers(game) {
        const { ctx } = this;
        for (const m of game.moveMarkers) {
            const t = m.t; // 1 -> 0
            const r = GRID_SIZE * (0.55 - t * 0.25);
            ctx.strokeStyle = `rgba(0,255,136,${t * 0.9})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(0,255,136,${t * 0.4})`;
            ctx.beginPath();
            ctx.arc(m.x, m.y, r * 1.6, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    drawPlacementPreview(game) {
        const { ctx } = this;
        const gs = GRID_SIZE;
        const p = game.placement;
        if (!p) return;

        if (p.kind === 'building') {
            const def = BUILDINGS[p.type];
            const cells = game.wallDragCells.length > 0
                ? game.wallDragCells
                : [game.grid.worldToGrid(game.input.mouseWorld.x, game.input.mouseWorld.y)];

            for (const cell of cells) {
                const canPlace = game.grid.canPlace(cell.gx, cell.gy, def.size);
                const canAfford = game.resourceMgr.canAfford(def.cost);
                const valid = canPlace && canAfford;
                const wx = cell.gx * gs, wy = cell.gy * gs;
                const bw = def.size * gs;

                const sprite = this.getBuildingSprite(game, p.type, 1, 0);
                ctx.globalAlpha = 0.55;
                ctx.drawImage(sprite, wx, wy);
                ctx.globalAlpha = 1;

                ctx.fillStyle = valid ? 'rgba(0,255,136,0.14)' : 'rgba(255,51,68,0.22)';
                ctx.fillRect(wx, wy, bw, bw);
                ctx.strokeStyle = valid ? '#00ff88' : '#ff3344';
                ctx.lineWidth = 2;
                ctx.strokeRect(wx, wy, bw, bw);
            }

            // range ring on the cursor cell
            const c0 = cells[cells.length - 1];
            if (def.range) {
                this._dashedCircle(c0.gx * gs + def.size * gs / 2, c0.gy * gs + def.size * gs / 2,
                    def.range * gs, 'rgba(0,200,255,0.35)');
            }
            if (def.gatherRadius) {
                this._dashedCircle(c0.gx * gs + def.size * gs / 2, c0.gy * gs + def.size * gs / 2,
                    def.gatherRadius * gs, 'rgba(136,255,136,0.3)');
            }
            if (def.repairRadius) {
                this._dashedCircle(c0.gx * gs + def.size * gs / 2, c0.gy * gs + def.size * gs / 2,
                    def.repairRadius * gs, 'rgba(68,255,136,0.3)');
            }
        } else if (p.kind === 'wire') {
            const { gx, gy } = game.grid.worldToGrid(game.input.mouseWorld.x, game.input.mouseWorld.y);
            ctx.fillStyle = 'rgba(255,204,0,0.2)';
            ctx.fillRect(gx * gs + 2, gy * gs + 2, gs - 4, gs - 4);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(gx * gs + 2, gy * gs + 2, gs - 4, gs - 4);
        } else if (p.kind === 'teleportDest' && p.source) {
            const b = p.source;
            const { gx, gy } = game.grid.worldToGrid(game.input.mouseWorld.x, game.input.mouseWorld.y);
            const valid = game.grid.canPlace(gx, gy, b.size);
            const sprite = this.getBuildingSprite(game, b.type, b.level, 0);
            ctx.globalAlpha = 0.5;
            ctx.drawImage(sprite, gx * gs, gy * gs);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = valid ? '#cc44ff' : '#ff3344';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(gx * gs, gy * gs, b.size * gs, b.size * gs);
            ctx.setLineDash([]);
            // link line
            ctx.strokeStyle = 'rgba(204,68,255,0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.worldX, b.worldY);
            ctx.lineTo(gx * gs + b.size * gs / 2, gy * gs + b.size * gs / 2);
            ctx.stroke();
        } else if (p.kind === 'teleportPick') {
            // highlight hovered building
            const hb = game.hoveredBuilding;
            if (hb && hb.type !== 'base' && hb.type !== 'teleporter') {
                ctx.strokeStyle = '#cc44ff';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([5, 4]);
                ctx.strokeRect(hb.gx * gs - 2, hb.gy * gs - 2, hb.size * gs + 4, hb.size * gs + 4);
                ctx.setLineDash([]);
            }
        }
    }

    _dashedCircle(x, y, r, color) {
        const { ctx } = this;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawRangeIndicator(game) {
        const b = game.selectedBuilding;
        if (!b || !b.built) return;
        if (b.def.range) {
            const range = b.def.range * GRID_SIZE * (1 + (b.getStatMult() - 1) * 0.35);
            this._dashedCircle(b.worldX, b.worldY, range, 'rgba(0,200,255,0.3)');
        }
        if (b.def.gatherRadius) {
            this._dashedCircle(b.worldX, b.worldY, b.def.gatherRadius * GRID_SIZE, 'rgba(136,255,136,0.3)');
        }
        if (b.def.repairRadius) {
            this._dashedCircle(b.worldX, b.worldY, b.def.repairRadius * GRID_SIZE, 'rgba(68,255,136,0.3)');
        }
    }

    drawSelectionBox(game) {
        if (!game.input.isDragging || !game.input.dragStart || game.placement) return;
        const { ctx } = this;
        const s = game.input.dragStart, c = game.input.dragCurrent;
        const x = Math.min(s.x, c.x), y = Math.min(s.y, c.y);
        const w = Math.abs(c.x - s.x), h = Math.abs(c.y - s.y);
        ctx.strokeStyle = '#00c8ff';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.fillStyle = 'rgba(0, 200, 255, 0.07)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
    }

    drawSpawnWarnings(game) {
        const { ctx } = this;
        const base = game.buildingMgr.base;
        if (!base) return;
        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (const warning of game.waveMgr.spawnWarnings) {
            const [dx, dy] = dirs[warning.side];
            const wx = base.worldX + dx * MAP_CONFIG.enemySpawnDistance * GRID_SIZE * 0.85;
            const wy = base.worldY + dy * MAP_CONFIG.enemySpawnDistance * GRID_SIZE * 0.85;
            const s = game.camera.worldToScreen(wx, wy, this.w, this.h);
            const x = Math.max(50, Math.min(this.w - 50, s.x));
            const y = Math.max(90, Math.min(this.h - 120, s.y));
            const pulse = 0.5 + Math.sin(game.time * 6) * 0.5;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(dy, dx));
            ctx.globalAlpha = 0.5 + pulse * 0.5;
            ctx.fillStyle = '#ff3344';
            for (let i = 0; i < 2; i++) {
                ctx.beginPath();
                ctx.moveTo(6 + i * 11, -9);
                ctx.lineTo(15 + i * 11, 0);
                ctx.lineTo(6 + i * 11, 9);
                ctx.lineTo(10 + i * 11, 0);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        }
    }

    drawVignette(game) {
        const { ctx } = this;
        if (this.w < 2 || this.h < 2) return;
        if (!this.vignette) {
            this.vignette = document.createElement('canvas');
            this.vignette.width = this.w;
            this.vignette.height = this.h;
            const vctx = this.vignette.getContext('2d');
            const g = vctx.createRadialGradient(
                this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.42,
                this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75
            );
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.38)');
            vctx.fillStyle = g;
            vctx.fillRect(0, 0, this.w, this.h);
        }
        ctx.drawImage(this.vignette, 0, 0);

        // base-damage flash: red pulse at the screen edges only
        if (game.baseDamageFlash > 0) {
            if (!this.redVignette) {
                this.redVignette = document.createElement('canvas');
                this.redVignette.width = this.w;
                this.redVignette.height = this.h;
                const rctx = this.redVignette.getContext('2d');
                const g = rctx.createRadialGradient(
                    this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.38,
                    this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72
                );
                g.addColorStop(0, 'rgba(255,30,50,0)');
                g.addColorStop(1, 'rgba(255,30,50,0.5)');
                rctx.fillStyle = g;
                rctx.fillRect(0, 0, this.w, this.h);
            }
            ctx.globalAlpha = Math.min(1, game.baseDamageFlash);
            ctx.drawImage(this.redVignette, 0, 0);
            ctx.globalAlpha = 1;
        }
    }

    // ================= MINIMAP (drawn into the UI's canvas) =================
    _minimapHalf(game) {
        // widen coverage as the frontier expands
        return Math.max(MAP_CONFIG.enemySpawnDistance + 14, (game.resourceMgr.generatedRadius || 0) + 4);
    }

    drawMinimap(game, mmCtx, size) {
        const base = game.buildingMgr.base;
        mmCtx.clearRect(0, 0, size, size);
        mmCtx.fillStyle = '#101a10';
        mmCtx.fillRect(0, 0, size, size);
        if (!base) return;

        const half = this._minimapHalf(game); // world cells covered from center
        const scale = size / (half * 2);
        const cx = base.gx + base.size / 2;
        const cy = base.gy + base.size / 2;
        const toMap = (gx, gy) => ({
            x: (gx - cx + half) * scale,
            y: (gy - cy + half) * scale
        });

        // resource nodes
        for (const node of game.resourceMgr.nodes) {
            if (node.depleted) continue;
            const p = toMap(node.gx, node.gy);
            if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
            mmCtx.fillStyle = node.type === 'tree' ? '#2d6a2d' : node.color;
            mmCtx.globalAlpha = 0.7;
            mmCtx.fillRect(p.x, p.y, 2, 2);
        }
        mmCtx.globalAlpha = 1;

        // wires (faint)
        for (const [, wire] of game.wireSystem.wires) {
            const p = toMap(wire.gx, wire.gy);
            if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
            mmCtx.fillStyle = 'rgba(200,150,60,0.5)';
            mmCtx.fillRect(p.x, p.y, 1.5, 1.5);
        }

        // buildings
        for (const b of game.buildingMgr.buildings) {
            const p = toMap(b.gx, b.gy);
            const s = Math.max(2.5, b.size * scale);
            if (p.x < -s || p.x > size || p.y < -s || p.y > size) continue;
            mmCtx.fillStyle = b.type === 'base' ? '#00ff88' : (b.built ? b.def.accentColor : 'rgba(150,150,150,0.5)');
            mmCtx.fillRect(p.x, p.y, s, s);
        }

        // soldiers
        for (const s of game.soldierMgr.soldiers) {
            const p = toMap(s.worldX / GRID_SIZE, s.worldY / GRID_SIZE);
            if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
            mmCtx.fillStyle = '#5ac8ff';
            mmCtx.fillRect(p.x - 1, p.y - 1, 2.4, 2.4);
        }

        // enemies
        for (const e of game.enemyMgr.enemies) {
            const p = toMap(e.worldX / GRID_SIZE, e.worldY / GRID_SIZE);
            if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
            mmCtx.fillStyle = e.isBoss ? '#ff7700' : '#ff3344';
            const s = e.isBoss ? 4.5 : 2.5;
            mmCtx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        }

        // spawn warnings: pulsing edge markers
        const pulse = 0.4 + Math.sin(game.time * 6) * 0.35;
        for (const warning of game.waveMgr.spawnWarnings) {
            mmCtx.fillStyle = `rgba(255,51,68,${pulse})`;
            const m = 3;
            if (warning.side === 0) mmCtx.fillRect(size * 0.25, m, size * 0.5, 3);
            if (warning.side === 1) mmCtx.fillRect(size - m - 3, size * 0.25, 3, size * 0.5);
            if (warning.side === 2) mmCtx.fillRect(size * 0.25, size - m - 3, size * 0.5, 3);
            if (warning.side === 3) mmCtx.fillRect(m, size * 0.25, 3, size * 0.5);
        }

        // camera viewport
        const vb = game.camera.getViewBounds(this.w, this.h);
        const p1 = toMap(vb.left / GRID_SIZE, vb.top / GRID_SIZE);
        const p2 = toMap(vb.right / GRID_SIZE, vb.bottom / GRID_SIZE);
        mmCtx.strokeStyle = 'rgba(0,200,255,0.8)';
        mmCtx.lineWidth = 1;
        mmCtx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    }

    // click on minimap -> world coords
    minimapToWorld(mx, my, size, game) {
        const base = game.buildingMgr.base;
        if (!base) return null;
        const half = this._minimapHalf(game);
        const scale = size / (half * 2);
        const cx = base.gx + base.size / 2;
        const cy = base.gy + base.size / 2;
        return {
            x: (mx / scale - half + cx) * GRID_SIZE,
            y: (my / scale - half + cy) * GRID_SIZE
        };
    }
}
