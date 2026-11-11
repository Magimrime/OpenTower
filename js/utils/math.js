// ===== MATH UTILITIES =====

export class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    clone() { return new Vec2(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
    copy(v) { this.x = v.x; this.y = v.y; return this; }

    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vec2(this.x * s, this.y * s); }
    div(s) { return new Vec2(this.x / s, this.y / s); }

    addMut(v) { this.x += v.x; this.y += v.y; return this; }
    subMut(v) { this.x -= v.x; this.y -= v.y; return this; }
    mulMut(s) { this.x *= s; this.y *= s; return this; }

    dot(v) { return this.x * v.x + this.y * v.y; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    lengthSq() { return this.x * this.x + this.y * this.y; }

    normalize() {
        const len = this.length();
        if (len === 0) return new Vec2();
        return this.div(len);
    }

    distanceTo(v) { return this.sub(v).length(); }
    distanceSqTo(v) { return this.sub(v).lengthSq(); }

    lerp(v, t) {
        return new Vec2(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t
        );
    }

    angle() { return Math.atan2(this.y, this.x); }

    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vec2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    equals(v) { return this.x === v.x && this.y === v.y; }
    toString() { return `${this.x},${this.y}`; }

    static fromAngle(angle, length = 1) {
        return new Vec2(Math.cos(angle) * length, Math.sin(angle) * length);
    }

    static fromString(str) {
        const [x, y] = str.split(',').map(Number);
        return new Vec2(x, y);
    }
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function inverseLerp(a, b, val) {
    return (val - a) / (b - a);
}

export function mapRange(val, inMin, inMax, outMin, outMax) {
    return outMin + (outMax - outMin) * inverseLerp(inMin, inMax, val);
}

export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

export function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function rectIntersects(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function gridDistance(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function euclideanDistance(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}

export function shuffleArray(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.floor(n).toString();
}

// Interpolate between angles along the shortest arc
export function angleLerp(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

export function angleDiff(a, b) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

// Deterministic 2D integer hash -> [0, 1)
export function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = h ^ (h >> 16);
    return (h >>> 0) / 4294967296;
}

// Seeded PRNG factory
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Uniform bucket grid for fast radius queries over moving entities.
// Rebuild each frame: cheap, avoids stale-entry bookkeeping.
export class SpatialHash {
    constructor(cellSize = 96) {
        this.cellSize = cellSize;
        this.buckets = new Map();
    }

    clear() { this.buckets.clear(); }

    _key(cx, cy) { return cx * 100000 + cy; }

    insert(entity, x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const key = this._key(cx, cy);
        let bucket = this.buckets.get(key);
        if (!bucket) { bucket = []; this.buckets.set(key, bucket); }
        bucket.push(entity);
    }

    // Visit all entities in buckets overlapping the circle (may include some outside it)
    queryCircle(x, y, radius, visit) {
        const minCx = Math.floor((x - radius) / this.cellSize);
        const maxCx = Math.floor((x + radius) / this.cellSize);
        const minCy = Math.floor((y - radius) / this.cellSize);
        const maxCy = Math.floor((y + radius) / this.cellSize);
        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const bucket = this.buckets.get(this._key(cx, cy));
                if (!bucket) continue;
                for (const e of bucket) visit(e);
            }
        }
    }
}
