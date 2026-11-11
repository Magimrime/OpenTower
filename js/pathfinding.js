// ===== PATHFINDING =====
// Binary-heap A* (8-directional, no corner cutting, octile heuristic,
// line-of-sight smoothing) for workers, plus a Dijkstra flow field for
// enemies that treats buildings as high-cost cells so they naturally
// path around defenses — or break through the weakest wall when a
// detour is too long.

const SQRT2 = Math.SQRT2;

class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item) {
        const items = this.items;
        items.push(item);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent].f <= items[i].f) break;
            const tmp = items[parent]; items[parent] = items[i]; items[i] = tmp;
            i = parent;
        }
    }
    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            items[0] = last;
            let i = 0;
            const n = items.length;
            while (true) {
                const l = i * 2 + 1, r = l + 1;
                let smallest = i;
                if (l < n && items[l].f < items[smallest].f) smallest = l;
                if (r < n && items[r].f < items[smallest].f) smallest = r;
                if (smallest === i) break;
                const tmp = items[smallest]; items[smallest] = items[i]; items[i] = tmp;
                i = smallest;
            }
        }
        return top;
    }
}

const DIRS8 = [
    { dx: 1, dy: 0, cost: 1 }, { dx: -1, dy: 0, cost: 1 },
    { dx: 0, dy: 1, cost: 1 }, { dx: 0, dy: -1, cost: 1 },
    { dx: 1, dy: 1, cost: SQRT2 }, { dx: 1, dy: -1, cost: SQRT2 },
    { dx: -1, dy: 1, cost: SQRT2 }, { dx: -1, dy: -1, cost: SQRT2 }
];

function octile(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}

export class Pathfinder {
    constructor(grid) {
        this.grid = grid;
        this.cache = new Map(); // LRU: key -> path (shared, do not mutate)
        this.cacheLimit = 400;
        this.gridVersion = -1;
    }

    clearCache() { this.cache.clear(); }

    _checkVersion() {
        if (this.grid.version !== this.gridVersion) {
            this.gridVersion = this.grid.version;
            this.cache.clear();
        }
    }

    _cacheGet(key) {
        const path = this.cache.get(key);
        if (path !== undefined) {
            // refresh LRU position
            this.cache.delete(key);
            this.cache.set(key, path);
        }
        return path;
    }

    _cacheSet(key, path) {
        if (this.cache.size >= this.cacheLimit) {
            const oldest = this.cache.keys().next().value;
            this.cache.delete(oldest);
        }
        this.cache.set(key, path);
    }

    // Main A*. goalSet: optional Set of "x,y" strings — reaching any of them wins.
    // Returns array of {gx, gy} waypoints (smoothed), or null.
    findPath(startGx, startGy, endGx, endGy, maxSteps = 6000) {
        this._checkVersion();
        const key = `${startGx},${startGy}>${endGx},${endGy}`;
        const cached = this._cacheGet(key);
        if (cached !== undefined) return cached;

        const path = this._search(startGx, startGy, endGx, endGy, null, maxSteps);
        this._cacheSet(key, path);
        return path;
    }

    // Path to any walkable cell adjacent to a size×size building — single search.
    findPathToBuilding(startGx, startGy, buildingGx, buildingGy, buildingSize) {
        this._checkVersion();
        const key = `${startGx},${startGy}>B${buildingGx},${buildingGy},${buildingSize}`;
        const cached = this._cacheGet(key);
        if (cached !== undefined) return cached;

        const goals = new Set();
        for (let dx = -1; dx <= buildingSize; dx++) {
            for (let dy = -1; dy <= buildingSize; dy++) {
                const inside = dx >= 0 && dx < buildingSize && dy >= 0 && dy < buildingSize;
                if (inside) continue;
                const tx = buildingGx + dx, ty = buildingGy + dy;
                if (this.grid.isWalkable(tx, ty)) goals.add(`${tx},${ty}`);
            }
        }
        if (goals.size === 0) { this._cacheSet(key, null); return null; }

        // Heuristic target: building center
        const cx = buildingGx + (buildingSize - 1) / 2;
        const cy = buildingGy + (buildingSize - 1) / 2;
        const path = this._search(startGx, startGy, cx, cy, goals, 6000);
        this._cacheSet(key, path);
        return path;
    }

    _search(startGx, startGy, endGx, endGy, goalSet, maxSteps) {
        const grid = this.grid;
        const startKey = `${startGx},${startGy}`;
        if (!goalSet && startGx === Math.round(endGx) && startGy === Math.round(endGy)) return [];

        const open = new MinHeap();
        const gScore = new Map();
        const cameFrom = new Map();
        const closed = new Set();

        gScore.set(startKey, 0);
        open.push({ gx: startGx, gy: startGy, g: 0, f: octile(startGx, startGy, endGx, endGy) });

        let steps = 0;
        while (open.size > 0 && steps < maxSteps) {
            steps++;
            const current = open.pop();
            const curKey = `${current.gx},${current.gy}`;
            if (closed.has(curKey)) continue;
            closed.add(curKey);

            const isGoal = goalSet
                ? goalSet.has(curKey)
                : (current.gx === endGx && current.gy === endGy);
            if (isGoal) {
                return this._smooth(this._reconstruct(cameFrom, curKey, startKey));
            }

            for (const dir of DIRS8) {
                const nx = current.gx + dir.dx;
                const ny = current.gy + dir.dy;
                const nKey = `${nx},${ny}`;
                if (closed.has(nKey)) continue;

                const isEnd = goalSet ? goalSet.has(nKey) : (nx === endGx && ny === endGy);
                if (!grid.isWalkable(nx, ny) && !isEnd) continue;

                // No cutting corners around blocked cells on diagonals
                if (dir.dx !== 0 && dir.dy !== 0) {
                    if (!grid.isWalkable(current.gx + dir.dx, current.gy) ||
                        !grid.isWalkable(current.gx, current.gy + dir.dy)) continue;
                }

                const tentG = current.g + dir.cost;
                const oldG = gScore.get(nKey);
                if (oldG === undefined || tentG < oldG) {
                    gScore.set(nKey, tentG);
                    cameFrom.set(nKey, curKey);
                    open.push({ gx: nx, gy: ny, g: tentG, f: tentG + octile(nx, ny, endGx, endGy) });
                }
            }
        }
        return null;
    }

    _reconstruct(cameFrom, endKey, startKey) {
        const path = [];
        let key = endKey;
        while (key !== startKey) {
            const comma = key.indexOf(',');
            path.push({ gx: +key.slice(0, comma), gy: +key.slice(comma + 1) });
            key = cameFrom.get(key);
            if (key === undefined) break;
        }
        path.reverse();
        return path;
    }

    // String pulling: drop waypoints that have a clear straight line between them.
    _smooth(path) {
        if (!path || path.length <= 2) return path;
        const result = [path[0]];
        let anchorIdx = 0;
        for (let i = 2; i < path.length; i++) {
            const anchor = path[anchorIdx];
            if (!this.hasLine(anchor.gx, anchor.gy, path[i].gx, path[i].gy)) {
                result.push(path[i - 1]);
                anchorIdx = i - 1;
            }
        }
        result.push(path[path.length - 1]);
        return result;
    }

    // Supercover line walkability check (conservative: both cells at diagonal crossings)
    hasLine(x0, y0, x1, y1) {
        x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; // integer safety: NaN here would hang the loop
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        if (dx + dy > 600) return false;
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let x = x0, y = y0;
        while (x !== x1 || y !== y1) {
            const e2 = err * 2;
            if (e2 > -dy && e2 < dx) {
                // Diagonal step crosses two cells — both must be open
                if (!this.grid.isWalkable(x + sx, y) || !this.grid.isWalkable(x, y + sy)) return false;
                x += sx; y += sy;
                err += dx - dy;
            } else if (e2 > -dy) {
                x += sx; err -= dy;
            } else {
                y += sy; err += dx;
            }
            if ((x !== x1 || y !== y1) && !this.grid.isWalkable(x, y)) return false;
        }
        return true;
    }
}

// ===== ENEMY FLOW FIELD =====
// Dijkstra map centered on the base. Every walkable cell costs ~1;
// building cells are passable at a cost derived from their HP, so the
// field encodes "walk around, or chew through if the detour is huge".
// All enemies share it: O(1) direction lookups, recomputed only when
// buildings change.
export class FlowField {
    constructor(grid) {
        this.grid = grid;
        this.radius = 64;                    // half-size in cells around base
        this.size = this.radius * 2 + 1;
        this.dist = new Float32Array(this.size * this.size);
        this.originGx = 0;
        this.originGy = 0;
        this.dirty = true;
        this.recomputeTimer = 0;
    }

    markDirty() { this.dirty = true; }

    update(dt, baseBuilding) {
        this.recomputeTimer -= dt;
        if (this.dirty && this.recomputeTimer <= 0 && baseBuilding) {
            this.compute(baseBuilding);
            this.dirty = false;
            this.recomputeTimer = 0.4; // throttle recomputes
        }
    }

    _idx(gx, gy) {
        const lx = gx - this.originGx + this.radius;
        const ly = gy - this.originGy + this.radius;
        if (lx < 0 || ly < 0 || lx >= this.size || ly >= this.size) return -1;
        return ly * this.size + lx;
    }

    // Allocation-free Dijkstra over a typed cost grid. Bosses trigger
    // recomputes constantly (they demolish walls), so this must be cheap.
    compute(base) {
        this.originGx = base.gx + Math.floor(base.size / 2);
        this.originGy = base.gy + Math.floor(base.size / 2);
        const size = this.size;
        const n = size * size;
        const dist = this.dist;
        dist.fill(Infinity);

        // Build the cost grid by walking only OCCUPIED cells (sparse map),
        // never allocating strings in the relax loop below.
        if (!this.cost || this.cost.length !== n) this.cost = new Float32Array(n);
        const cost = this.cost;
        cost.fill(1);
        for (const [key, occ] of this.grid.occupancy) {
            const comma = key.indexOf(',');
            const idx = this._idx(+key.slice(0, comma), +key.slice(comma + 1));
            if (idx < 0) continue;
            if (occ.type === 'resource') {
                cost[idx] = occ.entity && occ.entity.type === 'tree' ? 1.6 : 1.2;
            } else if (occ.type === 'building') {
                const b = occ.entity;
                cost[idx] = (!b || b.type === 'base') ? 1 : 10 + (b.hp || 100) / 30;
            }
        }

        // Binary heap over parallel number arrays with lazy deletion
        const heapD = this._heapD || (this._heapD = []);
        const heapI = this._heapI || (this._heapI = []);
        heapD.length = 0; heapI.length = 0;
        const push = (d, idx) => {
            let i = heapD.length;
            heapD.push(d); heapI.push(idx);
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heapD[p] <= heapD[i]) break;
                let t = heapD[p]; heapD[p] = heapD[i]; heapD[i] = t;
                t = heapI[p]; heapI[p] = heapI[i]; heapI[i] = t;
                i = p;
            }
        };
        const pop = () => {
            const topD = heapD[0], topI = heapI[0];
            const lastD = heapD.pop(), lastI = heapI.pop();
            const m = heapD.length;
            if (m > 0) {
                heapD[0] = lastD; heapI[0] = lastI;
                let i = 0;
                while (true) {
                    const l = i * 2 + 1, r = l + 1;
                    let s = i;
                    if (l < m && heapD[l] < heapD[s]) s = l;
                    if (r < m && heapD[r] < heapD[s]) s = r;
                    if (s === i) break;
                    let t = heapD[s]; heapD[s] = heapD[i]; heapD[i] = t;
                    t = heapI[s]; heapI[s] = heapI[i]; heapI[i] = t;
                    i = s;
                }
            }
            this._popD = topD;
            return topI;
        };

        // Multi-source: all base cells are distance 0
        for (let dx = 0; dx < base.size; dx++) {
            for (let dy = 0; dy < base.size; dy++) {
                const idx = this._idx(base.gx + dx, base.gy + dy);
                if (idx < 0) continue;
                dist[idx] = 0;
                push(0, idx);
            }
        }

        // neighbor index offsets (row-major), with column guards for wrap
        const SQ2 = Math.SQRT2;
        while (heapD.length > 0) {
            const idx = pop();
            const d = this._popD;
            if (d > dist[idx]) continue; // stale entry

            const lx = idx % size;
            const canL = lx > 0, canR = lx < size - 1;
            const up = idx - size, down = idx + size;

            if (canL && d + cost[idx - 1] < dist[idx - 1]) { dist[idx - 1] = d + cost[idx - 1]; push(dist[idx - 1], idx - 1); }
            if (canR && d + cost[idx + 1] < dist[idx + 1]) { dist[idx + 1] = d + cost[idx + 1]; push(dist[idx + 1], idx + 1); }
            if (up >= 0 && d + cost[up] < dist[up]) { dist[up] = d + cost[up]; push(dist[up], up); }
            if (down < n && d + cost[down] < dist[down]) { dist[down] = d + cost[down]; push(dist[down], down); }
            if (canL && up >= 0 && d + cost[up - 1] * SQ2 < dist[up - 1]) { dist[up - 1] = d + cost[up - 1] * SQ2; push(dist[up - 1], up - 1); }
            if (canR && up >= 0 && d + cost[up + 1] * SQ2 < dist[up + 1]) { dist[up + 1] = d + cost[up + 1] * SQ2; push(dist[up + 1], up + 1); }
            if (canL && down < n && d + cost[down - 1] * SQ2 < dist[down - 1]) { dist[down - 1] = d + cost[down - 1] * SQ2; push(dist[down - 1], down - 1); }
            if (canR && down < n && d + cost[down + 1] * SQ2 < dist[down + 1]) { dist[down + 1] = d + cost[down + 1] * SQ2; push(dist[down + 1], down + 1); }
        }
    }

    distanceAt(gx, gy) {
        const idx = this._idx(gx, gy);
        return idx < 0 ? Infinity : this.dist[idx];
    }

    // Best next cell descending the gradient, or null if outside/unreachable
    getNextCell(gx, gy) {
        const here = this.distanceAt(gx, gy);
        if (!isFinite(here)) return null;
        let best = null;
        let bestDist = here;
        for (const dir of DIRS8) {
            const nx = gx + dir.dx, ny = gy + dir.dy;
            const idx = this._idx(nx, ny);
            if (idx < 0) continue;
            const d = this.dist[idx];
            if (d < bestDist - 1e-6) {
                bestDist = d;
                best = { gx: nx, gy: ny };
            }
        }
        return best;
    }

    inBounds(gx, gy) { return this._idx(gx, gy) >= 0; }
}
