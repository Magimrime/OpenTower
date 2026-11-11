// ===== GRID SYSTEM =====
import { GRID_SIZE } from './config.js';

export class Grid {
    constructor() {
        // Sparse grid: key = "x,y" -> cell data
        this.cells = new Map();
        // Occupancy: key = "x,y" -> { type, entity }
        this.occupancy = new Map();
        // Bumped on every occupancy change so path caches self-invalidate
        this.version = 0;
    }

    worldToGrid(wx, wy) {
        return {
            gx: Math.floor(wx / GRID_SIZE),
            gy: Math.floor(wy / GRID_SIZE)
        };
    }

    gridToWorld(gx, gy) {
        return {
            wx: gx * GRID_SIZE + GRID_SIZE / 2,
            wy: gy * GRID_SIZE + GRID_SIZE / 2
        };
    }

    gridToWorldTopLeft(gx, gy) {
        return { wx: gx * GRID_SIZE, wy: gy * GRID_SIZE };
    }

    key(gx, gy) { return `${gx},${gy}`; }

    isOccupied(gx, gy) {
        return this.occupancy.has(this.key(gx, gy));
    }

    getOccupant(gx, gy) {
        return this.occupancy.get(this.key(gx, gy)) || null;
    }

    occupy(gx, gy, type, entity) {
        this.occupancy.set(this.key(gx, gy), { type, entity });
        this.version++;
    }

    occupyArea(gx, gy, size, type, entity) {
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                this.occupy(gx + dx, gy + dy, type, entity);
            }
        }
    }

    vacate(gx, gy) {
        this.occupancy.delete(this.key(gx, gy));
        this.version++;
    }

    vacateArea(gx, gy, size) {
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                this.vacate(gx + dx, gy + dy);
            }
        }
    }

    canPlace(gx, gy, size) {
        for (let dx = 0; dx < size; dx++) {
            for (let dy = 0; dy < size; dy++) {
                if (this.isOccupied(gx + dx, gy + dy)) return false;
            }
        }
        return true;
    }

    isWalkable(gx, gy) {
        const occ = this.getOccupant(gx, gy);
        if (!occ) return true;
        // Resource nodes are walkable
        if (occ.type === 'resource') return true;
        // Finished gates let friendly units through (enemies use the flow
        // field, which still treats every building as an obstacle to break)
        if (occ.type === 'building' && occ.entity &&
            occ.entity.type === 'gate' && occ.entity.built) return true;
        return false;
    }

    getNeighbors(gx, gy) {
        return [
            { gx: gx - 1, gy },
            { gx: gx + 1, gy },
            { gx, gy: gy - 1 },
            { gx, gy: gy + 1 }
        ];
    }

    getNeighbors8(gx, gy) {
        const n = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                n.push({ gx: gx + dx, gy: gy + dy });
            }
        }
        return n;
    }
}
