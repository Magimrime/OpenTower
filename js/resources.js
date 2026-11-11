// ===== RESOURCE MANAGER =====
import { STARTING_RESOURCES, RESOURCE_NODES, MAP_CONFIG, GRID_SIZE } from './config.js';
import { randomRange, randomInt, shuffleArray } from './utils/math.js';

export class ResourceManager {
    constructor() {
        this.resources = { ...STARTING_RESOURCES };
        this.nodes = []; // Resource nodes on the map
        this.gainAccum = {}; // gains since last UI sample (income display)
        this.pendingRespawns = []; // depleted renewables waiting to regrow
    }

    consumeGains() {
        const g = this.gainAccum;
        this.gainAccum = {};
        return g;
    }

    canAfford(cost) {
        for (const [res, amount] of Object.entries(cost)) {
            if ((this.resources[res] || 0) < amount) return false;
        }
        return true;
    }

    spend(cost) {
        if (!this.canAfford(cost)) return false;
        for (const [res, amount] of Object.entries(cost)) {
            this.resources[res] -= amount;
        }
        return true;
    }

    add(res, amount) {
        this.resources[res] = (this.resources[res] || 0) + amount;
        this.gainAccum[res] = (this.gainAccum[res] || 0) + amount;
    }

    addRewards(rewards) {
        for (const [res, amount] of Object.entries(rewards)) {
            this.add(res, amount);
        }
    }

    refund(cost, percent = 0.5) {
        for (const [res, amount] of Object.entries(cost)) {
            this.add(res, Math.floor(amount * percent));
        }
    }

    // One cluster-belt of a resource in the annulus [minR, maxR] around center
    _placeBelt(grid, centerGx, centerGy, type, count, minR, maxR, clusterCount, spread) {
        const nodeDef = RESOURCE_NODES[type];
        const baseAngle = Math.random() * Math.PI * 2;
        const perCluster = Math.ceil(count / clusterCount);
        let placed = 0;

        for (let c = 0; c < clusterCount && placed < count; c++) {
            // stratified angles: clusters surround the base instead of clumping
            const angle = baseAngle + (c / clusterCount) * Math.PI * 2 + randomRange(-0.5, 0.5);
            const dist = randomRange(minR, maxR);
            const cx = centerGx + Math.round(Math.cos(angle) * dist);
            const cy = centerGy + Math.round(Math.sin(angle) * dist);

            let inCluster = 0;
            let attempts = 0;
            while (inCluster < perCluster && placed < count && attempts < perCluster * 10) {
                attempts++;
                // gaussian-ish organic blob
                const a = Math.random() * Math.PI * 2;
                const r = (Math.random() + Math.random()) * 0.5 * spread;
                const gx = cx + Math.round(Math.cos(a) * r * 1.2);
                const gy = cy + Math.round(Math.sin(a) * r);
                if (grid.isOccupied(gx, gy)) continue;
                // keep a clear yard around the base
                if (Math.abs(gx - centerGx) < 5 && Math.abs(gy - centerGy) < 5) continue;

                const amount = nodeDef.amount + randomInt(-10, 20);
                const node = {
                    id: `${type}_${this._nodeSeq++}`,
                    type, gx, gy,
                    resource: nodeDef.resource,
                    amount, maxAmount: amount,
                    color: nodeDef.color,
                    depleted: false,
                    claimants: 0
                };
                this.nodes.push(node);
                grid.occupy(gx, gy, 'resource', node);
                placed++;
                inCluster++;
            }
        }
    }

    // Organized map layout: coherent patches ringing the base.
    // Basics (wood, stone) are guaranteed close to home; rarer minerals
    // sit in progressively farther belts, spread around the compass.
    generateMapResources(grid, centerGx, centerGy) {
        this._nodeSeq = 0;
        this.centerGx = centerGx;
        this.centerGy = centerGy;

        const trees = MAP_CONFIG.treeCount;
        const stones = MAP_CONFIG.stoneCount;
        const coppers = MAP_CONFIG.copperCount;
        const irons = MAP_CONFIG.ironCount;

        // starter patches: always within easy walking distance
        this._placeBelt(grid, centerGx, centerGy, 'tree', Math.round(trees * 0.35), 7, 12, 2, 3.4);
        this._placeBelt(grid, centerGx, centerGy, 'stoneDeposit', Math.round(stones * 0.35), 8, 13, 2, 2.6);
        this._placeBelt(grid, centerGx, centerGy, 'copperOre', Math.round(coppers * 0.4), 9, 14, 1, 2.4);
        this._placeBelt(grid, centerGx, centerGy, 'ironOre', Math.round(irons * 0.3), 11, 15, 1, 2.2);

        // outer belts, farther out the rarer they get
        this._placeBelt(grid, centerGx, centerGy, 'tree', trees - Math.round(trees * 0.35), 13, 25, 5, 4.2);
        this._placeBelt(grid, centerGx, centerGy, 'stoneDeposit', stones - Math.round(stones * 0.35), 14, 23, 3, 3);
        this._placeBelt(grid, centerGx, centerGy, 'copperOre', coppers - Math.round(coppers * 0.4), 15, 24, 2, 2.6);
        this._placeBelt(grid, centerGx, centerGy, 'ironOre', irons - Math.round(irons * 0.3), 16, 24, 3, 2.6);
        this._placeBelt(grid, centerGx, centerGy, 'goldOre', MAP_CONFIG.goldCount, 18, 26, 2, 2.4);
        this._placeBelt(grid, centerGx, centerGy, 'crystalNode', MAP_CONFIG.crystalCount, 21, 27, 2, 2);

        this.generatedRadius = 28;
    }

    // Expanding toward the frontier seeds new resource rings — and the
    // farther out a ring is, the richer it is in rare minerals.
    expandFrontier(grid, needRadius) {
        if (this.centerGx === undefined) return false;
        let expanded = false;
        while (this.generatedRadius < needRadius && this.generatedRadius < 120) {
            const minR = this.generatedRadius;
            const maxR = minR + 14;
            const rich = minR / 28; // richness multiplier per ring
            const cx = this.centerGx, cy = this.centerGy;
            this._placeBelt(grid, cx, cy, 'tree', Math.round(16 + minR * 0.45), minR, maxR, 4, 4.2);
            this._placeBelt(grid, cx, cy, 'stoneDeposit', Math.round(8 + minR * 0.28), minR, maxR, 3, 3);
            this._placeBelt(grid, cx, cy, 'copperOre', Math.round(5 + minR * 0.22), minR, maxR, 2, 2.6);
            this._placeBelt(grid, cx, cy, 'ironOre', Math.round(6 + minR * 0.3), minR, maxR, 3, 2.6);
            this._placeBelt(grid, cx, cy, 'goldOre', Math.round(3 + 4 * rich), minR, maxR, 2, 2.4);
            this._placeBelt(grid, cx, cy, 'crystalNode', Math.round(2 + 3.5 * rich), minR, maxR, 2, 2.2);
            // obsidian only exists in the deep frontier
            if (minR >= 42) {
                this._placeBelt(grid, cx, cy, 'obsidianShard', Math.round(3 + 3 * rich), minR, maxR, 2, 2);
            }
            this.generatedRadius = maxR;
            expanded = true;
        }
        return expanded;
    }

    harvestNode(node, amount, time = 0) {
        const harvested = Math.min(amount, node.amount);
        node.amount -= harvested;
        if (node.amount <= 0) {
            node.amount = 0;
            const def = RESOURCE_NODES[node.type];
            if (node.type === 'tree' && !node.isStump && def.stumpAmount) {
                // the tree falls but leaves a stump: bonus wood if you grub
                // it out, or it regrows into a tree if left alone
                node.isStump = true;
                node.amount = def.stumpAmount;
                node.maxAmount = def.stumpAmount;
                node.regrowAt = time + (def.respawnTime || 75) * randomRange(0.85, 1.3);
            } else {
                node.depleted = true;
            }
        }
        return harvested;
    }

    getNodesInRadius(gx, gy, radius, resourceType) {
        // stumps are left alone so they can regrow (gatherer buildings skip them)
        return this.nodes.filter(n =>
            !n.depleted && !n.isStump &&
            n.resource === resourceType &&
            Math.abs(n.gx - gx) <= radius &&
            Math.abs(n.gy - gy) <= radius
        );
    }

    removeDepletedNodes(grid, time = 0) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            if (this.nodes[i].depleted) {
                const node = this.nodes[i];
                grid.vacate(node.gx, node.gy);
                const def = RESOURCE_NODES[node.type];
                // a grubbed-out stump is gone for good; only non-stump
                // renewables use the respawn queue
                if (def && def.respawnTime > 0 && !node.isStump) {
                    this.pendingRespawns.push({
                        type: node.type, gx: node.gx, gy: node.gy,
                        at: time + def.respawnTime * randomRange(0.85, 1.3)
                    });
                }
                this.nodes.splice(i, 1);
            }
        }
    }

    // Regrowth: queued respawns come back, and living stumps grow into trees
    updateRespawns(grid, time) {
        for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
            const r = this.pendingRespawns[i];
            if (time < r.at) continue;
            if (grid.isOccupied(r.gx, r.gy)) { r.at = time + 10; continue; }
            const def = RESOURCE_NODES[r.type];
            const amount = def.amount + randomInt(-10, 20);
            const node = {
                id: `${r.type}_r${r.gx}_${r.gy}_${Math.floor(time)}`,
                type: r.type, gx: r.gx, gy: r.gy,
                resource: def.resource,
                amount, maxAmount: amount,
                color: def.color,
                depleted: false,
                claimants: 0,
                spawnAt: time // renderer grows it in
            };
            this.nodes.push(node);
            grid.occupy(r.gx, r.gy, 'resource', node);
            this.pendingRespawns.splice(i, 1);
        }

        for (const node of this.nodes) {
            if (!node.isStump || node.depleted) continue;
            if (time < node.regrowAt) continue;
            if ((node.claimants || 0) > 0) { node.regrowAt = time + 10; continue; } // someone's chopping it
            const def = RESOURCE_NODES[node.type];
            node.isStump = false;
            node.regrowAt = undefined;
            node.amount = def.amount + randomInt(-10, 20);
            node.maxAmount = node.amount;
            node.spawnAt = time;
        }
    }
}
