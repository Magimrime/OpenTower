// ===== PROCEDURAL SPRITE / TEXTURE LIBRARY =====
// All art is generated on canvas and cached. Style: top-down 3/4 view,
// soft dark outlines, top-left light, saturated accent glows.
import { GRID_SIZE, UPGRADE_TIER_COLORS } from '../config.js';
import { hash2, mulberry32 } from './math.js';

const spriteCache = new Map();

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
}

export function getSprite(key, drawFn, w = GRID_SIZE, h = GRID_SIZE) {
    let s = spriteCache.get(key);
    if (!s) {
        s = makeCanvas(w, h);
        drawFn(s.getContext('2d'), s.width, s.height);
        spriteCache.set(key, s);
    }
    return s;
}

export function clearSpriteCache() { spriteCache.clear(); }

// ---------- shared helpers ----------
function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function shade(hex, amt) {
    // hex '#rrggbb' lightened (+) or darkened (-) by amt (0..255)
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
    const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
}

function bolt(ctx, x, y, r = 1.8) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(x - 0.4, y - 0.4, r * 0.55, 0, Math.PI * 2); ctx.fill();
}

function hazardStripes(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#c8a018';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#22221c';
    for (let i = -h; i < w + h; i += 8) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y);
        ctx.lineTo(x + i + h + 4, y); ctx.lineTo(x + i + 4, y + h);
        ctx.closePath(); ctx.fill();
    }
    ctx.restore();
}

export function drawShadowBlob(ctx, x, y, rx, ry, alpha = 0.28) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Soft radial glow sprite, cached per color+size
export function getGlowSprite(color, size = 32) {
    const key = `glow_${color}_${size}`;
    return getSprite(key, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, color);
        g.addColorStop(0.35, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }, size, size);
}

// ---------- TERRAIN ----------
const GRASS_BASE = [26, 38, 25];

export function paintTerrainCell(ctx, px, py, gs, gx, gy) {
    const h1 = hash2(gx, gy);
    const h2 = hash2(gx * 3 + 11, gy * 7 + 5);
    const h3 = hash2(gx * 13 + 3, gy * 17 + 9);

    // Base grass with gentle brightness variation
    const v = Math.floor(h1 * 7) - 2;
    ctx.fillStyle = `rgb(${GRASS_BASE[0] + v},${GRASS_BASE[1] + v + Math.floor(h2 * 5)},${GRASS_BASE[2] + v})`;
    ctx.fillRect(px, py, gs, gs);

    // Large soft mottling
    if (h2 < 0.3) {
        ctx.fillStyle = h2 < 0.15 ? 'rgba(14,22,14,0.16)' : 'rgba(60,84,48,0.10)';
        ctx.beginPath();
        ctx.ellipse(px + gs * (0.25 + h3 * 0.5), py + gs * (0.25 + h1 * 0.5), gs * 0.55, gs * 0.4, h3 * 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Decorations
    const rand = mulberry32((gx * 7349 + gy * 31727) >>> 0);
    if (h3 < 0.10) {
        // grass tufts
        const bx = px + gs * (0.2 + rand() * 0.6);
        const by = py + gs * (0.25 + rand() * 0.55);
        ctx.strokeStyle = `rgba(${70 + rand() * 40 | 0},${110 + rand() * 40 | 0},60,0.7)`;
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
            const ang = -Math.PI / 2 + (rand() - 0.5) * 1.1;
            const len = 3.5 + rand() * 3.5;
            ctx.beginPath();
            ctx.moveTo(bx + i * 2 - 3, by);
            ctx.quadraticCurveTo(
                bx + i * 2 - 3 + Math.cos(ang) * len * 0.5, by + Math.sin(ang) * len * 0.7,
                bx + i * 2 - 3 + Math.cos(ang) * len, by + Math.sin(ang) * len);
            ctx.stroke();
        }
    } else if (h3 < 0.145) {
        // pebbles
        for (let i = 0; i < 3; i++) {
            const pxx = px + gs * (0.15 + rand() * 0.7);
            const pyy = py + gs * (0.15 + rand() * 0.7);
            const r = 1.2 + rand() * 1.8;
            ctx.fillStyle = `rgba(${90 + rand() * 30 | 0},${95 + rand() * 30 | 0},${88 + rand() * 25 | 0},0.55)`;
            ctx.beginPath(); ctx.arc(pxx, pyy, r, 0, Math.PI * 2); ctx.fill();
        }
    } else if (h3 < 0.165) {
        // dirt patch
        ctx.fillStyle = 'rgba(62,48,32,0.35)';
        ctx.beginPath();
        ctx.ellipse(px + gs * 0.5, py + gs * 0.5, gs * 0.3, gs * 0.22, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
    } else if (h3 < 0.175) {
        // tiny flowers
        for (let i = 0; i < 2; i++) {
            const fx = px + gs * (0.2 + rand() * 0.6);
            const fy = py + gs * (0.2 + rand() * 0.6);
            ctx.fillStyle = rand() < 0.5 ? 'rgba(230,210,90,0.8)' : 'rgba(220,235,240,0.75)';
            ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, Math.PI * 2); ctx.fill();
        }
    }
}

// ---------- RESOURCE NODES ----------
export function drawTreeSprite(ctx, w, h, variant = 0) {
    const rand = mulberry32(variant * 977 + 13);
    const cx = w / 2, cy = h * 0.46;
    // shadow
    drawShadowBlob(ctx, cx + 2, h * 0.82, w * 0.3, w * 0.12, 0.3);
    // trunk
    ctx.fillStyle = '#4d3620';
    ctx.beginPath();
    ctx.moveTo(cx - 3, h * 0.85);
    ctx.quadraticCurveTo(cx - 2, cy, cx - 1.5, cy);
    ctx.lineTo(cx + 1.5, cy);
    ctx.quadraticCurveTo(cx + 2, cy, cx + 3.5, h * 0.85);
    ctx.closePath(); ctx.fill();
    // canopy: clustered lobes, three shades
    const lobes = 5 + Math.floor(rand() * 3);
    const baseR = w * (0.16 + variant * 0.012);
    const shades = ['#1f5a26', '#2a6e2e', '#37853a'];
    for (let pass = 0; pass < 3; pass++) {
        ctx.fillStyle = shades[pass];
        for (let i = 0; i < lobes; i++) {
            const ang = (i / lobes) * Math.PI * 2 + rand() * 0.8;
            const dist = (lobes > 6 ? 0.55 : 0.45) * baseR * (1 - pass * 0.28);
            const r = baseR * (0.75 + rand() * 0.4) * (1 - pass * 0.22);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(ang) * dist - pass * 1.2, cy - w * 0.06 + Math.sin(ang) * dist * 0.8 - pass * 2, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

export function drawStumpSprite(ctx, w, h) {
    const cx = w / 2, cy = h * 0.58;
    // a stump is much smaller than the tree it came from
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.64, 0.64);
    ctx.translate(-cx, -cy);
    drawShadowBlob(ctx, cx + 1, cy + 6, w * 0.22, w * 0.09, 0.28);
    // root flares
    ctx.fillStyle = '#4d3620';
    for (const [ang, len] of [[0.3, 7], [2.4, 6], [4.1, 7], [5.5, 5]]) {
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(ang) * len, cy + 3 + Math.sin(ang) * len * 0.45, 4.5, 2.4, ang, 0, Math.PI * 2);
        ctx.fill();
    }
    // bark cylinder
    ctx.fillStyle = '#5a4026';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 4);
    ctx.lineTo(cx - 7, cy + 4);
    ctx.quadraticCurveTo(cx, cy + 8, cx + 7, cy + 4);
    ctx.lineTo(cx + 7, cy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(30,20,10,0.35)';
    ctx.fillRect(cx + 3, cy - 4, 4, 9);
    // cut face with growth rings
    ctx.fillStyle = '#c8a06a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 4, 7.4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(cx, cy - 4, 4.8, 2.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy - 4, 2.3, 1.3, 0, 0, Math.PI * 2); ctx.stroke();
    // a couple of wood chips
    ctx.fillStyle = '#a8845a';
    ctx.fillRect(cx - 12, cy + 5, 3.4, 1.8);
    ctx.fillRect(cx + 9, cy + 7, 2.8, 1.6);
    ctx.restore();
}

export function drawOreSprite(ctx, w, h, type) {
    const palettes = {
        stoneDeposit: { main: '#7d8286', dark: '#565b60', light: '#a8adb2', glow: null },
        copperOre: { main: '#4a7a62', dark: '#2f5442', light: '#7ac9a4', glow: null, vein: '#3ec9a7' },
        ironOre: { main: '#8a6a4a', dark: '#5c452f', light: '#c89060', glow: null, vein: '#c87c3c' },
        goldOre: { main: '#7a6a3a', dark: '#55482a', light: '#a89858', glow: null, vein: '#ffd24a' },
        crystalNode: { main: '#8a4ac8', dark: '#5c2f8a', light: '#c88aff', glow: 'rgba(176,64,255,0.35)' },
        obsidianShard: { main: '#38304a', dark: '#211c30', light: '#8f7bd8', glow: 'rgba(143,123,216,0.3)' }
    };
    const p = palettes[type] || palettes.stoneDeposit;
    const cx = w / 2, cy = h * 0.55;
    const rand = mulberry32(type.length * 7919 + 101);

    drawShadowBlob(ctx, cx + 1, h * 0.78, w * 0.32, w * 0.11, 0.3);
    if (p.glow) {
        const g = getGlowSprite(p.glow, 64);
        ctx.drawImage(g, cx - 24, cy - 24, 48, 48);
    }

    if (type === 'crystalNode' || type === 'obsidianShard') {
        // Angular shards
        const shards = 4;
        for (let i = 0; i < shards; i++) {
            const bx = cx - 10 + i * 6 + rand() * 3;
            const bh = 10 + rand() * 10;
            const bw2 = 3.5 + rand() * 2;
            const tilt = (rand() - 0.5) * 0.5;
            ctx.save();
            ctx.translate(bx, cy + 4);
            ctx.rotate(tilt);
            ctx.fillStyle = p.main;
            ctx.beginPath();
            ctx.moveTo(-bw2, 0); ctx.lineTo(-bw2 * 0.5, -bh); ctx.lineTo(bw2 * 0.4, -bh * 1.15); ctx.lineTo(bw2, 0);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = p.light;
            ctx.beginPath();
            ctx.moveTo(-bw2 * 0.5, -bh); ctx.lineTo(bw2 * 0.4, -bh * 1.15); ctx.lineTo(0, 0); ctx.lineTo(-bw2 * 0.4, 0);
            ctx.closePath();
            ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
            ctx.restore();
        }
        return;
    }

    // Rock cluster
    const rocks = [
        { x: cx - 7, y: cy + 2, r: w * 0.2 },
        { x: cx + 7, y: cy + 4, r: w * 0.15 },
        { x: cx + 1, y: cy - 5, r: w * 0.17 }
    ];
    for (const rock of rocks) {
        ctx.fillStyle = p.dark;
        ctx.beginPath();
        const sides = 6;
        for (let i = 0; i <= sides; i++) {
            const ang = (i / sides) * Math.PI * 2 + 0.4;
            const rad = rock.r * (0.85 + hash2(i, rock.x | 0) * 0.3);
            const x = rock.x + Math.cos(ang) * rad;
            const y = rock.y + Math.sin(ang) * rad * 0.85 + 2;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        // top facet
        ctx.fillStyle = p.main;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const ang = (i / sides) * Math.PI * 2 + 0.4;
            const rad = rock.r * (0.85 + hash2(i, rock.x | 0) * 0.3) * 0.88;
            const x = rock.x + Math.cos(ang) * rad;
            const y = rock.y + Math.sin(ang) * rad * 0.8;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        // light facet
        ctx.fillStyle = p.light;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(rock.x - rock.r * 0.25, rock.y - rock.r * 0.3, rock.r * 0.4, rock.r * 0.26, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    // veins for iron / gold
    if (p.vein) {
        ctx.strokeStyle = p.vein;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        for (const rock of rocks) {
            ctx.beginPath();
            ctx.moveTo(rock.x - rock.r * 0.4, rock.y);
            ctx.quadraticCurveTo(rock.x, rock.y - rock.r * 0.35, rock.x + rock.r * 0.35, rock.y + rock.r * 0.15);
            ctx.stroke();
            if (type === 'goldOre') {
                ctx.fillStyle = '#ffe98a';
                ctx.beginPath(); ctx.arc(rock.x + rock.r * 0.2, rock.y - rock.r * 0.2, 1.3, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
}

// ---------- BUILDINGS ----------
export function drawBaseSprite(ctx, w, h) {
    const cx = w / 2, cy = h / 2;
    const R = w * 0.47;
    const oct = (yoff, r) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * r, cy + yoff + Math.sin(a) * r);
        }
        ctx.closePath();
    };

    // bottom slab: dark wall face below a lit top plate
    oct(7, R); ctx.fillStyle = '#20261e'; ctx.fill();
    oct(3, R); ctx.fillStyle = '#2d352b'; ctx.fill();
    let g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#4d5a49');
    g.addColorStop(1, '#3a453a');
    oct(0, R); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,10,0.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // raised inner slab
    oct(4, R * 0.78); ctx.fillStyle = '#28302a'; ctx.fill();
    g = ctx.createLinearGradient(0, cy - R * 0.78, 0, cy + R * 0.78);
    g.addColorStop(0, '#5b6852');
    g.addColorStop(1, '#475442');
    oct(0, R * 0.78); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,10,0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // panel seams
    ctx.strokeStyle = 'rgba(15,20,15,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.72, cy); ctx.lineTo(cx + R * 0.72, cy);
    ctx.moveTo(cx, cy - R * 0.72); ctx.lineTo(cx, cy + R * 0.72);
    ctx.stroke();

    // corner pylons: dark front face + lit top
    const py = R * 0.62;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = cx + sx * py, y = cy + sy * py;
        ctx.fillStyle = '#1e241a';
        rr(ctx, x - 7, y - 3, 14, 11, 3); ctx.fill();
        const pg = ctx.createLinearGradient(0, y - 8, 0, y + 4);
        pg.addColorStop(0, '#4b5841');
        pg.addColorStop(1, '#38442f');
        ctx.fillStyle = pg;
        rr(ctx, x - 7, y - 8, 14, 10, 3); ctx.fill();
        hazardStripes(ctx, x - 5, y - 1.5, 10, 3.2);
        bolt(ctx, x - 4.5, y - 5.5); bolt(ctx, x + 4.5, y - 5.5);
    }

    // command dome on a cylindrical drum
    ctx.fillStyle = '#232b1e';
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.16, R * 0.42, R * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    g = ctx.createLinearGradient(cx - R * 0.42, 0, cx + R * 0.42, 0);
    g.addColorStop(0, '#4f5d46');
    g.addColorStop(0.45, '#6b7a62');
    g.addColorStop(1, '#3d4a37');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R * 0.42, cy - R * 0.08, R * 0.84, R * 0.24);
    g = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.24, 2, cx, cy - R * 0.08, R * 0.48);
    g.addColorStop(0, '#8e9e83');
    g.addColorStop(0.6, '#5d6d52');
    g.addColorStop(1, '#3d4a38');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.08, R * 0.42, R * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,10,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // glowing core ring
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.08, R * 0.25, R * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d1f16';
    ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.08, R * 0.14, R * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#00ff88';
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.08, R * 0.065, R * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
}

const TURRET_STYLE = {
    machineGun: { plate: '#4a5248', accent: '#ffaa00' },
    cannon: { plate: '#54493d', accent: '#ff5522' },
    laser: { plate: '#41505c', accent: '#00ccff' },
    missile: { plate: '#4b4b58', accent: '#ff7733' }
};

export function drawTurretBase(ctx, w, h, type, level = 1) {
    const st = TURRET_STYLE[type] || TURRET_STYLE.machineGun;
    const cx = w / 2, cy = h / 2;
    const R = w * 0.42;
    const oct = (yoff, r) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * r, cy + yoff + Math.sin(a) * r);
        }
        ctx.closePath();
    };

    // footing slab with visible thickness
    oct(4, R); ctx.fillStyle = shade(st.plate, -56); ctx.fill();
    const fg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    fg.addColorStop(0, shade(st.plate, -4));
    fg.addColorStop(1, shade(st.plate, -30));
    oct(0, R); ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(8,10,8,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // cylindrical mount: dark base ellipse + lit cap + bottom crescent shade
    ctx.fillStyle = shade(st.plate, -46);
    ctx.beginPath(); ctx.ellipse(cx, cy + 3.5, R * 0.72, R * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    const cg = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.3, 1, cx, cy, R * 0.84);
    cg.addColorStop(0, shade(st.plate, 36));
    cg.addColorStop(0.68, st.plate);
    cg.addColorStop(1, shade(st.plate, -20));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(8,10,8,0.45)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,12,9,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.72, 0.4, Math.PI - 0.4);
    ctx.arc(cx, cy + 3, R * 0.6, Math.PI - 0.4, 0.4, true);
    ctx.closePath();
    ctx.fill();

    // bolts around the ring
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        bolt(ctx, cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58, 1.6);
    }

    // accent ring
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = st.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // Tiered trim: Mk I-III gold, IV-VI cyan, VII-IX violet
    const tier = Math.ceil(level / 3);
    const tierColor = UPGRADE_TIER_COLORS[Math.min(2, tier - 1)];
    const rings = level - (tier - 1) * 3 - 1;
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < rings; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, R * (0.84 + i * 0.09), 0, Math.PI * 2); ctx.stroke();
    }
    if (tier >= 2) {
        ctx.fillStyle = tierColor;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (tier >= 3) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = tierColor;
        ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

// Barrels drawn pointing +X, centered on canvas
export function drawTurretBarrel(ctx, w, h, type, level = 1) {
    const cx = w / 2, cy = h / 2;
    const lenMult = 1 + Math.min(level - 1, 4) * 0.06;
    ctx.save();
    ctx.translate(cx, cy);

    if (type === 'machineGun') {
        // twin barrels
        ctx.fillStyle = '#2c2f2c';
        rr(ctx, -4, -6, 12, 12, 3); ctx.fill();
        ctx.fillStyle = '#3c423c';
        rr(ctx, -3, -5, 10, 10, 2.5); ctx.fill();
        ctx.fillStyle = '#22261f';
        rr(ctx, 4, -4.4, 15 * lenMult, 3, 1.4); ctx.fill();
        rr(ctx, 4, 1.4, 15 * lenMult, 3, 1.4); ctx.fill();
        ctx.fillStyle = '#565c52';
        rr(ctx, 4, -4.4, 15 * lenMult, 1.2, 0.6); ctx.fill();
        rr(ctx, 4, 1.4, 15 * lenMult, 1.2, 0.6); ctx.fill();
        // muzzles
        ctx.fillStyle = '#101210';
        rr(ctx, 3.4 + 15 * lenMult, -4.8, 2.6, 3.8, 1); ctx.fill();
        rr(ctx, 3.4 + 15 * lenMult, 1, 2.6, 3.8, 1); ctx.fill();
        // ammo drum
        ctx.fillStyle = '#6a5a2a';
        rr(ctx, -6, -2.6, 4.5, 5.2, 1.5); ctx.fill();
    } else if (type === 'cannon') {
        // recoil cradle
        ctx.fillStyle = '#33302a';
        rr(ctx, -9, -8, 15, 16, 4); ctx.fill();
        ctx.fillStyle = '#443f36';
        rr(ctx, -7.5, -6.5, 12, 13, 3); ctx.fill();
        bolt(ctx, -4, -4); bolt(ctx, -4, 4);
        // heavy barrel
        ctx.fillStyle = '#26231e';
        rr(ctx, 3, -4.6, 24 * lenMult, 9.2, 3.2); ctx.fill();
        ctx.fillStyle = '#4c463c';
        rr(ctx, 3, -4.6, 24 * lenMult, 3.4, 1.6); ctx.fill();
        // muzzle brake
        ctx.fillStyle = '#15130f';
        rr(ctx, 24 * lenMult, -5.8, 6, 11.6, 2); ctx.fill();
        ctx.fillStyle = '#3a352c';
        rr(ctx, 24 * lenMult + 1.4, -3.6, 3.2, 7.2, 1.2); ctx.fill();
    } else if (type === 'laser') {
        // emitter housing
        ctx.fillStyle = '#2a323c';
        rr(ctx, -7, -6.5, 13, 13, 4); ctx.fill();
        ctx.fillStyle = '#3c4854';
        rr(ctx, -5.5, -5, 10, 10, 3); ctx.fill();
        // focus prongs
        ctx.fillStyle = '#232b33';
        ctx.beginPath();
        ctx.moveTo(5, -6); ctx.lineTo(16, -3); ctx.lineTo(16, -1); ctx.lineTo(5, -2); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(5, 6); ctx.lineTo(16, 3); ctx.lineTo(16, 1); ctx.lineTo(5, 2); ctx.closePath(); ctx.fill();
        // lens
        const g = ctx.createRadialGradient(9, 0, 0.5, 9, 0, 5);
        g.addColorStop(0, '#dffcff');
        g.addColorStop(0.4, '#4ee1ff');
        g.addColorStop(1, '#0a6a88');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(9, 0, 4.2, 0, Math.PI * 2); ctx.fill();
        // conduit glow
        ctx.strokeStyle = 'rgba(0,204,255,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -1.5); ctx.moveTo(-4, 4); ctx.lineTo(4, 1.5); ctx.stroke();
    } else if (type === 'missile') {
        // rotating pod with 4 tubes
        ctx.fillStyle = '#33333c';
        rr(ctx, -11, -10, 24, 20, 5); ctx.fill();
        ctx.fillStyle = '#44444f';
        rr(ctx, -9, -8, 20, 16, 4); ctx.fill();
        bolt(ctx, -8, -8, 1.4); bolt(ctx, 9, -8, 1.4); bolt(ctx, -8, 8, 1.4); bolt(ctx, 9, 8, 1.4);
        // tubes with visible missile tips
        for (const [tx, ty] of [[1, -4.5], [1, 4.5], [8, -4.5], [8, 4.5]]) {
            ctx.fillStyle = '#181820';
            ctx.beginPath(); ctx.arc(tx, ty, 3.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#c8452a';
            ctx.beginPath(); ctx.arc(tx + 0.4, ty, 2.1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath(); ctx.arc(tx - 0.4, ty - 0.7, 0.8, 0, Math.PI * 2); ctx.fill();
        }
    }

    // tier collar on the weapon itself
    const tier = Math.ceil(level / 3);
    if (tier >= 2) {
        ctx.fillStyle = UPGRADE_TIER_COLORS[Math.min(2, tier - 1)];
        rr(ctx, 3.6, -5.5, 2.4, 11, 1.2);
        ctx.fill();
    }
    ctx.restore();
}

// Auto-tiling wall: mask bit 1=N, 2=E, 4=S, 8=W
export function drawWallSprite(ctx, w, h, mask, reinforced) {
    const cx = w / 2, cy = h / 2;
    const armW = reinforced ? 15 : 13;
    const half = armW / 2;
    const main = reinforced ? '#5c6472' : '#6b665c';
    const top = reinforced ? '#798394' : '#8a8474';
    const dark = reinforced ? '#3d434e' : '#47443c';


    ctx.fillStyle = main;
    const drawArm = (x, y, ww, hh) => { ctx.fillRect(x, y, ww, hh); };
    // arms
    if (mask & 1) drawArm(cx - half, 0, armW, cy);
    if (mask & 4) drawArm(cx - half, cy, armW, cy);
    if (mask & 8) drawArm(0, cy - half, cx, armW);
    if (mask & 2) drawArm(cx, cy - half, cx, armW);
    // center block
    const cs = armW + 5;
    rr(ctx, cx - cs / 2, cy - cs / 2, cs, cs, 4);
    ctx.fill();

    // top light
    ctx.fillStyle = top;
    if (mask & 1) ctx.fillRect(cx - half + 2, 0, armW - 4, cy - 2);
    if (mask & 4) ctx.fillRect(cx - half + 2, cy, armW - 4, cy - 2);
    if (mask & 8) ctx.fillRect(0, cy - half + 2, cx - 2, armW - 4);
    if (mask & 2) ctx.fillRect(cx, cy - half + 2, cx - 2, armW - 4);
    rr(ctx, cx - cs / 2 + 2, cy - cs / 2 + 2, cs - 4, cs - 4, 3);
    ctx.fill();

    // seams / texture
    ctx.strokeStyle = `rgba(20,20,16,0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (mask & 1) { ctx.moveTo(cx - half + 2, cy * 0.5); ctx.lineTo(cx + half - 2, cy * 0.5); }
    if (mask & 4) { ctx.moveTo(cx - half + 2, cy * 1.5); ctx.lineTo(cx + half - 2, cy * 1.5); }
    if (mask & 8) { ctx.moveTo(cx * 0.5, cy - half + 2); ctx.lineTo(cx * 0.5, cy + half - 2); }
    if (mask & 2) { ctx.moveTo(cx * 1.5, cy - half + 2); ctx.lineTo(cx * 1.5, cy + half - 2); }
    ctx.stroke();

    // center cap
    ctx.fillStyle = dark;
    rr(ctx, cx - cs / 2 + 4.5, cy - cs / 2 + 4.5, cs - 9, cs - 9, 2.5);
    ctx.fill();
    if (reinforced) {
        bolt(ctx, cx - 4, cy - 4, 1.5); bolt(ctx, cx + 4, cy - 4, 1.5);
        bolt(ctx, cx - 4, cy + 4, 1.5); bolt(ctx, cx + 4, cy + 4, 1.5);
        ctx.strokeStyle = 'rgba(150,190,230,0.35)';
        ctx.lineWidth = 1.2;
        rr(ctx, cx - cs / 2 + 1, cy - cs / 2 + 1, cs - 2, cs - 2, 3.5);
        ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(cx - 3, cy - 3, 6, 2);
    }
}

// Gate: wall arms + doorway posts; the sliding panels are drawn
// dynamically by the renderer so they can open for approaching workers.
export function drawGateSprite(ctx, w, h, mask) {
    const cx = w / 2, cy = h / 2;
    const armW = 13, half = armW / 2;
    const main = '#6b665c', top = '#8a8474';
    const horizontal = !!((mask & 2) || (mask & 8)) || !((mask & 1) || (mask & 4));

    // wall arms
    ctx.fillStyle = main;
    if (mask & 1) ctx.fillRect(cx - half, 0, armW, cy);
    if (mask & 4) ctx.fillRect(cx - half, cy, armW, cy);
    if (mask & 8) ctx.fillRect(0, cy - half, cx, armW);
    if (mask & 2) ctx.fillRect(cx, cy - half, cx, armW);
    ctx.fillStyle = top;
    if (mask & 1) ctx.fillRect(cx - half + 2, 0, armW - 4, cy - 2);
    if (mask & 4) ctx.fillRect(cx - half + 2, cy + 2, armW - 4, cy - 2);
    if (mask & 8) ctx.fillRect(0, cy - half + 2, cx - 2, armW - 4);
    if (mask & 2) ctx.fillRect(cx + 2, cy - half + 2, cx - 2, armW - 4);

    // worn threshold path through the opening
    ctx.fillStyle = 'rgba(46,38,26,0.85)';
    if (horizontal) { rr(ctx, cx - 8, 2, 16, h - 4, 3); ctx.fill(); }
    else { rr(ctx, 2, cy - 8, w - 4, 16, 3); ctx.fill(); }
    ctx.fillStyle = 'rgba(120,100,70,0.25)';
    for (let i = 0; i < 3; i++) {
        if (horizontal) ctx.fillRect(cx - 5 + i * 4, 6 + i * 13, 2.5, 5);
        else ctx.fillRect(6 + i * 13, cy - 5 + i * 4, 5, 2.5);
    }

    // heavy posts flanking the doorway
    ctx.fillStyle = '#46423a';
    const post = (x, y) => {
        rr(ctx, x - 5.5, y - 5.5, 11, 11, 2.5);
        ctx.fill();
        bolt(ctx, x, y, 1.7);
    };
    if (horizontal) { post(cx - 15, cy); post(cx + 15, cy); }
    else { post(cx, cy - 15); post(cx, cy + 15); }
    // lamp
    ctx.fillStyle = '#ffcc66';
    ctx.beginPath();
    ctx.arc(horizontal ? cx - 15 : cx + 4, horizontal ? cy - 4 : cy - 15, 1.7, 0, Math.PI * 2);
    ctx.fill();
}

// ---------- SOLDIER (dynamic, side-view chibi with a rifle) ----------
// opts: { facing, walkPhase, action: 'idle'|'walk'|'aim', aimAngle, selected }
export function drawSoldierSprite(ctx, x, y, opts) {
    const { facing = 1, walkPhase = 0, action = 'idle', aimAngle = 0, selected = false } = opts;
    const moving = action === 'walk';
    const legSwing = moving ? Math.sin(walkPhase) * 3.2 : 0;
    const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.5 : Math.sin(walkPhase * 0.25) * 0.5;

    ctx.save();
    ctx.translate(x, y);
    drawShadowBlob(ctx, 0, 1.5, 7.5, 2.8, 0.3);
    if (selected) {
        ctx.strokeStyle = 'rgba(90,200,255,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, 1.5, 9.5, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(90,200,255,0.25)';
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.ellipse(0, 1.5, 9.5, 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.scale(facing, 1);
    ctx.translate(0, -bob);

    // legs: armored greaves
    for (const s of [-1, 1]) {
        const lx = s * 2.4 + legSwing * s;
        ctx.strokeStyle = '#3c4438';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s * 1.8, -7); ctx.lineTo(lx, -1); ctx.stroke();
        ctx.fillStyle = '#23261f';
        ctx.beginPath(); ctx.ellipse(lx + 0.8, -0.5, 2.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    }

    // torso: olive plate armor with chest strap
    ctx.fillStyle = '#57634c';
    rr(ctx, -3.8, -14.5, 7.6, 8, 2.5); ctx.fill();
    ctx.fillStyle = '#6b7a5c';
    rr(ctx, -3.8, -14.5, 7.6, 3.4, 2.5); ctx.fill();
    ctx.strokeStyle = '#2e352a';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-3.6, -9.5); ctx.lineTo(3.6, -12.6); ctx.stroke();

    // head with combat helmet + visor
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(0.4, -17.2, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#49523f';
    ctx.beginPath(); ctx.arc(0.3, -18, 3.8, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    rr(ctx, -3.6, -18.4, 8, 2, 1); ctx.fill();
    ctx.fillStyle = '#8fd4ff';
    rr(ctx, 1.2, -17.9, 2.6, 1.5, 0.7); ctx.fill();

    // rifle: held level when idle/walking, aimed when firing
    ctx.save();
    ctx.translate(1.6, -11.6);
    if (action === 'aim') ctx.rotate(aimAngle);
    // arms gripping
    ctx.strokeStyle = '#57634c';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-2.6, -1); ctx.lineTo(2.2, 0.6); ctx.stroke();
    // rifle body
    ctx.fillStyle = '#26292c';
    rr(ctx, -2.5, -1.4, 11, 2.4, 1); ctx.fill();
    ctx.fillStyle = '#3f444a';
    rr(ctx, -2.5, -1.4, 4, 2.4, 1); ctx.fill();
    // muzzle
    ctx.fillStyle = '#101214';
    rr(ctx, 8, -1, 2.2, 1.6, 0.6); ctx.fill();
    // stock
    ctx.fillStyle = '#4a3a28';
    rr(ctx, -4.4, -1.2, 2.4, 2.8, 0.8); ctx.fill();
    ctx.restore();

    ctx.restore();
}

export function drawArmory(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 131, 'rgba(46,52,40,0.55)');

    // quonset hut: curved corrugated roof with real barrel shading
    const hx = w * 0.1, hw = w * 0.56, hy = h * 0.24, hh = h * 0.5;
    // end wall (visible face at the bottom)
    ctx.fillStyle = '#2c3526';
    rr(ctx, hx, hy + hh * 0.55, hw, hh * 0.45, 6); ctx.fill();
    // curved roof: vertical gradient across the barrel curve
    const g = ctx.createLinearGradient(0, hy, 0, hy + hh);
    g.addColorStop(0, '#71805f');
    g.addColorStop(0.45, '#55634a');
    g.addColorStop(1, '#39432f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hx, hy + hh * 0.78);
    ctx.quadraticCurveTo(hx, hy, hx + hw * 0.5, hy);
    ctx.quadraticCurveTo(hx + hw, hy, hx + hw, hy + hh * 0.78);
    ctx.lineTo(hx + hw, hy + hh * 0.9);
    ctx.lineTo(hx, hy + hh * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(14,18,10,0.5)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    // curved corrugation ribs
    ctx.strokeStyle = 'rgba(20,26,16,0.4)';
    ctx.lineWidth = 1.1;
    for (let i = 1; i < 5; i++) {
        const rx = hx + (i / 5) * hw;
        const bend = Math.sin((i / 5) * Math.PI) * hh * 0.16;
        ctx.beginPath();
        ctx.moveTo(rx, hy + hh * 0.88);
        ctx.quadraticCurveTo(rx, hy + hh * 0.3 - bend * 0.4, rx, hy + hh * 0.12 - bend * 0.0 + (1 - Math.sin((i / 5) * Math.PI)) * hh * 0.2);
        ctx.stroke();
    }
    // dark entry with hazard lintel
    ctx.fillStyle = '#12160f';
    rr(ctx, w * 0.27, h * 0.46, w * 0.22, h * 0.28, 4); ctx.fill();
    hazardStripes(ctx, w * 0.27, h * 0.42, w * 0.22, 4);

    // rifle rack (right side)
    ctx.strokeStyle = '#7a5c34';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.72); ctx.lineTo(w * 0.72, h * 0.4);
    ctx.moveTo(w * 0.92, h * 0.72); ctx.lineTo(w * 0.92, h * 0.4);
    ctx.moveTo(w * 0.7, h * 0.42); ctx.lineTo(w * 0.94, h * 0.42);
    ctx.stroke();
    ctx.strokeStyle = '#26292c';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(w * (0.75 + i * 0.055), h * 0.7);
        ctx.lineTo(w * (0.77 + i * 0.055), h * 0.44);
        ctx.stroke();
    }
    // sandbags with individual shading
    for (const [sx, sy] of [[w * 0.16, h * 0.8], [w * 0.24, h * 0.82], [w * 0.2, h * 0.76]]) {
        ctx.fillStyle = '#6e6144';
        ctx.beginPath(); ctx.ellipse(sx, sy + 1, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#93835e';
        ctx.beginPath(); ctx.ellipse(sx, sy, 6, 2.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.ellipse(sx - 1.4, sy - 0.8, 3, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    }
    // red training flag
    ctx.strokeStyle = '#88a888';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.26); ctx.lineTo(w * 0.62, h * 0.08); ctx.stroke();
    ctx.fillStyle = '#c84a3a';
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.08); ctx.lineTo(w * 0.76, h * 0.12); ctx.lineTo(w * 0.62, h * 0.17);
    ctx.closePath(); ctx.fill();
}

// Irregular dirt/foundation blob so buildings sit in the world
// instead of on identical square pads
function drawGroundBlob(ctx, w, h, seed, color = 'rgba(58,48,34,0.55)') {
    const rand = mulberry32(seed);
    const cx = w / 2, cy = h * 0.56;
    ctx.fillStyle = color;
    ctx.beginPath();
    const points = 9;
    for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2;
        const r = (0.36 + rand() * 0.1) * w;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.72;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

export function drawLumberMill(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 11, 'rgba(56,44,28,0.55)');

    // open saw shed (left, tall) + attached cabin (right, low) = L-shape
    // shed posts + slanted roof
    ctx.fillStyle = '#3a2c1a';
    rr(ctx, w * 0.1, h * 0.3, w * 0.44, h * 0.46, 3); ctx.fill();
    ctx.fillStyle = '#241b10';
    rr(ctx, w * 0.13, h * 0.36, w * 0.38, h * 0.36, 3); ctx.fill();
    // big circular saw inside the shed
    const sx = w * 0.32, sy = h * 0.55;
    ctx.fillStyle = '#9aa2a8';
    ctx.beginPath(); ctx.arc(sx, sy, w * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#666e74';
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * w * 0.12, sy + Math.sin(a) * w * 0.12);
        ctx.lineTo(sx + Math.cos(a + 0.2) * w * 0.155, sy + Math.sin(a + 0.2) * w * 0.155);
        ctx.lineTo(sx + Math.cos(a + 0.4) * w * 0.12, sy + Math.sin(a + 0.4) * w * 0.12);
        ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2f3538';
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    // shed roof (slanted planks, overhanging)
    ctx.fillStyle = '#7a5c34';
    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.34);
    ctx.lineTo(w * 0.3, h * 0.1);
    ctx.lineTo(w * 0.6, h * 0.3);
    ctx.lineTo(w * 0.56, h * 0.38);
    ctx.lineTo(w * 0.3, h * 0.2);
    ctx.lineTo(w * 0.1, h * 0.42);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,28,14,0.6)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(w * (0.05 + i * 0.07), h * (0.34 - i * 0.056));
        ctx.lineTo(w * (0.1 + i * 0.06), h * (0.42 - i * 0.05));
        ctx.stroke();
    }
    // low cabin (right) with door
    ctx.fillStyle = '#584021';
    rr(ctx, w * 0.6, h * 0.44, w * 0.3, h * 0.34, 3); ctx.fill();
    ctx.fillStyle = '#6e5433';
    ctx.beginPath();
    ctx.moveTo(w * 0.57, h * 0.47);
    ctx.lineTo(w * 0.75, h * 0.34);
    ctx.lineTo(w * 0.93, h * 0.47);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2c2014';
    rr(ctx, w * 0.71, h * 0.6, w * 0.09, h * 0.18, 2); ctx.fill();
    // log pile spilling into the yard (bottom)
    const logs = [[w * 0.2, h * 0.86], [w * 0.32, h * 0.88], [w * 0.26, h * 0.8], [w * 0.45, h * 0.87]];
    for (const [lx, ly] of logs) {
        ctx.fillStyle = '#6b4a26';
        rr(ctx, lx - w * 0.09, ly - 3.5, w * 0.18, 7, 3.5); ctx.fill();
        ctx.fillStyle = '#c8a06a';
        ctx.beginPath(); ctx.arc(lx + w * 0.09, ly, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(lx + w * 0.09, ly, 1.4, 0, Math.PI * 2); ctx.stroke();
    }
}

export function drawQuarry(ctx, w, h) {
    // an open pit carved into the ground — no pad at all
    drawGroundBlob(ctx, w, h, 23, 'rgba(88,84,74,0.6)');
    // irregular terraces
    const cx = w * 0.47, cy = h * 0.54;
    const layers = ['#6b675e', '#57534b', '#454239', '#33302a'];
    for (let i = 0; i < 4; i++) {
        const r = w * (0.4 - i * 0.085);
        ctx.fillStyle = layers[i];
        ctx.beginPath();
        for (let j = 0; j <= 8; j++) {
            const a = (j / 8) * Math.PI * 2;
            const rr2 = r * (0.9 + hash2(j, i * 7) * 0.25);
            const x = cx + Math.cos(a) * rr2 + (i % 2 ? 2 : -2);
            const y = cy + Math.sin(a) * rr2 * 0.7;
            if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#1c1a16';
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 2, w * 0.07, w * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    // terrace ledge lines
    ctx.strokeStyle = 'rgba(20,18,14,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.32, cy + 3); ctx.lineTo(cx - w * 0.18, cy + 1);
    ctx.moveTo(cx + w * 0.3, cy - 4); ctx.lineTo(cx + w * 0.16, cy - 2);
    ctx.stroke();
    // wooden crane on the rim (top-right)
    ctx.strokeStyle = '#5c4526';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(w * 0.82, h * 0.18); ctx.lineTo(w * 0.82, h * 0.5); ctx.stroke();
    ctx.strokeStyle = '#7a5c34';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.82, h * 0.22); ctx.lineTo(w * 0.55, h * 0.42); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,220,220,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w * 0.57, h * 0.42); ctx.lineTo(w * 0.57, h * 0.52); ctx.stroke();
    // hanging bucket
    ctx.fillStyle = '#4c4c54';
    rr(ctx, w * 0.53, h * 0.52, w * 0.08, h * 0.05, 2); ctx.fill();
    // rubble on the rim
    for (const [rx, ry, rs] of [[w * 0.15, h * 0.28, 4], [w * 0.72, h * 0.78, 5], [w * 0.24, h * 0.82, 3.4]]) {
        ctx.fillStyle = '#7d8286';
        ctx.beginPath(); ctx.arc(rx, ry, rs, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a8adb2';
        ctx.beginPath(); ctx.arc(rx - rs * 0.3, ry - rs * 0.3, rs * 0.45, 0, Math.PI * 2); ctx.fill();
    }
}

export function drawMine(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 37, 'rgba(64,52,38,0.55)');
    // asymmetric mound pushed to the top-left
    ctx.fillStyle = '#5a4c3a';
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.68);
    ctx.quadraticCurveTo(w * 0.16, h * 0.1, w * 0.46, h * 0.12);
    ctx.quadraticCurveTo(w * 0.74, h * 0.14, w * 0.78, h * 0.68);
    ctx.closePath(); ctx.fill();
    // rocky texture
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.64);
    ctx.quadraticCurveTo(w * 0.22, h * 0.2, w * 0.4, h * 0.24);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.moveTo(w * 0.58, h * 0.66);
    ctx.quadraticCurveTo(w * 0.66, h * 0.24, w * 0.74, h * 0.62);
    ctx.closePath(); ctx.fill();
    // shaft entrance with heavy timber frame
    ctx.fillStyle = '#0f0d0a';
    rr(ctx, w * 0.28, h * 0.38, w * 0.24, h * 0.3, 5); ctx.fill();
    ctx.strokeStyle = '#7a5c34';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.27, h * 0.7); ctx.lineTo(w * 0.27, h * 0.4);
    ctx.lineTo(w * 0.53, h * 0.4); ctx.lineTo(w * 0.53, h * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.25, h * 0.4); ctx.lineTo(w * 0.55, h * 0.4);
    ctx.stroke();
    // lantern by the entrance
    ctx.fillStyle = '#ffcf5e';
    ctx.beginPath(); ctx.arc(w * 0.57, h * 0.46, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(getGlowSprite('rgba(255,200,90,0.5)', 32), w * 0.57 - 8, h * 0.46 - 8, 16, 16);
    // curved rails out of the shaft + cart in the yard
    ctx.strokeStyle = '#6a6258';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.68);
    ctx.quadraticCurveTo(w * 0.36, h * 0.86, w * 0.6, h * 0.88);
    ctx.moveTo(w * 0.46, h * 0.68);
    ctx.quadraticCurveTo(w * 0.47, h * 0.8, w * 0.62, h * 0.82);
    ctx.stroke();
    ctx.save();
    ctx.translate(w * 0.66, h * 0.85);
    ctx.rotate(-0.12);
    ctx.fillStyle = '#4c4c54';
    rr(ctx, -w * 0.1, -h * 0.05, w * 0.2, h * 0.09, 2); ctx.fill();
    ctx.fillStyle = '#c87c3c';
    ctx.beginPath(); ctx.arc(-w * 0.03, -h * 0.02, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.04, -h * 0.03, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

export function drawCrystalExtractor(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 53, 'rgba(52,42,66,0.5)');
    // glow
    ctx.drawImage(getGlowSprite('rgba(176,64,255,0.4)', 64), w / 2 - 30, h / 2 - 26, 60, 60);
    // crystal
    ctx.fillStyle = '#8a4ac8';
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 8, h * 0.72);
    ctx.lineTo(w * 0.5 - 4, h * 0.42);
    ctx.lineTo(w * 0.5 + 2, h * 0.36);
    ctx.lineTo(w * 0.5 + 8, h * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c88aff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 4, h * 0.42);
    ctx.lineTo(w * 0.5 + 2, h * 0.36);
    ctx.lineTo(w * 0.5 + 1, h * 0.7);
    ctx.lineTo(w * 0.5 - 2, h * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // drill rig frame
    ctx.strokeStyle = '#8a8a9a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.75); ctx.lineTo(w * 0.5, h * 0.18);
    ctx.lineTo(w * 0.7, h * 0.75);
    ctx.stroke();
    ctx.strokeStyle = '#5c5c6a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.52); ctx.lineTo(w * 0.62, h * 0.52);
    ctx.stroke();
    // drill bit
    ctx.fillStyle = '#c8c8d8';
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 3, h * 0.2);
    ctx.lineTo(w * 0.5 + 3, h * 0.2);
    ctx.lineTo(w * 0.5, h * 0.32);
    ctx.closePath(); ctx.fill();
}

export function drawPowerPlant(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 67, 'rgba(46,56,42,0.55)');

    // cooling towers: true cylinders with waisted profiles, lit rims, dark mouths
    const tower = (tx, baseY, tw, th) => {
        const top = baseY - th;
        ctx.fillStyle = '#242b20';
        ctx.beginPath(); ctx.ellipse(tx, baseY, tw, tw * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createLinearGradient(tx - tw, 0, tx + tw, 0);
        g.addColorStop(0, '#333e2f');
        g.addColorStop(0.3, '#66755d');
        g.addColorStop(0.72, '#49553f');
        g.addColorStop(1, '#28301f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(tx - tw, baseY);
        ctx.bezierCurveTo(tx - tw * 0.55, baseY - th * 0.55, tx - tw * 0.82, top + 2, tx - tw * 0.72, top);
        ctx.lineTo(tx + tw * 0.72, top);
        ctx.bezierCurveTo(tx + tw * 0.82, top + 2, tx + tw * 0.55, baseY - th * 0.55, tx + tw, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7f8e72';
        ctx.beginPath(); ctx.ellipse(tx, top, tw * 0.74, tw * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#141a10';
        ctx.beginPath(); ctx.ellipse(tx, top + 0.8, tw * 0.55, tw * 0.17, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(215,225,215,0.14)';
        ctx.beginPath(); ctx.arc(tx + tw * 0.2, top - 6, tw * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(tx - tw * 0.15, top - 11, tw * 0.34, 0, Math.PI * 2); ctx.fill();
    };
    tower(w * 0.76, h * 0.52, w * 0.115, h * 0.36);
    tower(w * 0.9, h * 0.54, w * 0.085, h * 0.26);

    // reactor: cylindrical skirt + shaded dome
    const cx = w * 0.38, cy = h * 0.5;
    const R = w * 0.27;
    ctx.fillStyle = '#232b1c';
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.62, R, R * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    let g2 = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    g2.addColorStop(0, '#354229');
    g2.addColorStop(0.42, '#5b6a4b');
    g2.addColorStop(1, '#2c3a26');
    ctx.fillStyle = g2;
    ctx.fillRect(cx - R, cy + R * 0.14, R * 2, R * 0.5);
    g2 = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.36, 2, cx, cy, R * 1.08);
    g2.addColorStop(0, '#87977c');
    g2.addColorStop(0.55, '#59684a');
    g2.addColorStop(1, '#333f2a');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(8,10,8,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(12,16,10,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.06, R * 0.66, R * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    // glowing core windows
    ctx.drawImage(getGlowSprite('rgba(255,238,51,0.55)', 48), cx - 18, cy - 15, 36, 32);
    ctx.fillStyle = '#ffee33';
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.45;
        rr(ctx, cx + Math.cos(a) * R * 0.52 - 1.6, cy + Math.sin(a) * R * 0.4 - 3, 3.2, 6, 1.5);
        ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(cx, cy, 3.6, 2.9, 0, 0, Math.PI * 2); ctx.fill();
    // pipe run with highlight
    ctx.strokeStyle = '#5c6a54';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.75, cy - 3);
    ctx.quadraticCurveTo(w * 0.62, h * 0.4, w * 0.71, h * 0.35);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.75, cy - 4.4);
    ctx.quadraticCurveTo(w * 0.62, h * 0.385, w * 0.71, h * 0.34);
    ctx.stroke();
    // service block: front face + lit top
    ctx.fillStyle = '#20271a';
    rr(ctx, w * 0.13, h * 0.78, w * 0.27, h * 0.09, 2.5); ctx.fill();
    ctx.fillStyle = '#3b462f';
    rr(ctx, w * 0.13, h * 0.72, w * 0.27, h * 0.09, 2.5); ctx.fill();
    hazardStripes(ctx, w * 0.155, h * 0.795, w * 0.22, 3.2);
}

export function drawBarracks(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 79, 'rgba(48,56,44,0.5)');

    // helper: cabin with shaded gable roof, eave shadow and wall faces
    const cabin = (x, y, cw, ch, roofH) => {
        // side wall (right, darker)
        ctx.fillStyle = '#3d4836';
        rr(ctx, x, y, cw, ch, 3); ctx.fill();
        // front wall (lit)
        const wg = ctx.createLinearGradient(0, y, 0, y + ch);
        wg.addColorStop(0, '#5d6a52');
        wg.addColorStop(1, '#48543f');
        ctx.fillStyle = wg;
        rr(ctx, x, y, cw * 0.97, ch, 3); ctx.fill();
        // eave shadow band
        ctx.fillStyle = 'rgba(14,18,10,0.35)';
        ctx.fillRect(x, y, cw, ch * 0.14);
        // gable roof: two slopes, sun side lighter
        const peakX = x + cw * 0.5, peakY = y - roofH;
        let rg = ctx.createLinearGradient(x, 0, peakX, 0);
        rg.addColorStop(0, '#55624a');
        rg.addColorStop(1, '#69775a');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(x - cw * 0.06, y + 2);
        ctx.lineTo(peakX, peakY);
        ctx.lineTo(peakX, peakY + 2.4);
        ctx.lineTo(x - cw * 0.06, y + 4.4);
        ctx.closePath(); ctx.fill();
        rg = ctx.createLinearGradient(peakX, 0, x + cw * 1.06, 0);
        rg.addColorStop(0, '#4a563f');
        rg.addColorStop(1, '#37422e');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(x + cw * 1.06, y + 2);
        ctx.lineTo(x + cw * 1.06, y + 4.4);
        ctx.lineTo(peakX, peakY + 2.4);
        ctx.closePath(); ctx.fill();
        // ridge highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - cw * 0.04, y + 2);
        ctx.lineTo(peakX, peakY);
        ctx.stroke();
    };

    // big bunkhouse (left)
    cabin(w * 0.1, h * 0.3, w * 0.48, h * 0.36, h * 0.2);
    ctx.fillStyle = '#28301f';
    rr(ctx, w * 0.27, h * 0.46, w * 0.11, h * 0.2, 2.5); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    rr(ctx, w * 0.14, h * 0.42, w * 0.09, h * 0.1, 2); ctx.fill();
    rr(ctx, w * 0.45, h * 0.42, w * 0.09, h * 0.1, 2); ctx.fill();

    // small annex cabin (bottom-right)
    cabin(w * 0.62, h * 0.54, w * 0.27, h * 0.24, h * 0.13);
    ctx.fillStyle = '#ffe9a8';
    rr(ctx, w * 0.72, h * 0.6, w * 0.08, h * 0.09, 2); ctx.fill();

    // tall flag pole between them
    ctx.strokeStyle = '#88a888';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w * 0.66, h * 0.5); ctx.lineTo(w * 0.66, h * 0.1); ctx.stroke();
    ctx.fillStyle = '#44cc88';
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.1); ctx.lineTo(w * 0.82, h * 0.15); ctx.lineTo(w * 0.66, h * 0.21);
    ctx.closePath(); ctx.fill();

    // training dummy in the yard
    ctx.strokeStyle = '#7a5c34';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.86); ctx.lineTo(w * 0.16, h * 0.74);
    ctx.moveTo(w * 0.1, h * 0.78); ctx.lineTo(w * 0.22, h * 0.78);
    ctx.stroke();
    ctx.fillStyle = '#c8a06a';
    ctx.beginPath(); ctx.arc(w * 0.16, h * 0.72, 2.6, 0, Math.PI * 2); ctx.fill();
}

export function drawUpgradeStation(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 91, 'rgba(44,44,64,0.5)');
    const cx = w / 2, cy = h * 0.55;
    const R = w * 0.34;
    const hex = (yoff, r) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * r, cy + yoff + Math.sin(a) * r * 0.8);
        }
        ctx.closePath();
    };

    // hex platform with real rim walls
    hex(6, R); ctx.fillStyle = '#191926'; ctx.fill();
    hex(3, R); ctx.fillStyle = '#232334'; ctx.fill();
    let g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#3c3c58');
    g.addColorStop(1, '#2c2c44');
    hex(0, R); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,22,0.6)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    g = ctx.createLinearGradient(0, cy - R * 0.8, 0, cy + R * 0.8);
    g.addColorStop(0, '#4a4a6c');
    g.addColorStop(1, '#38385a');
    hex(0, R * 0.78); ctx.fillStyle = g; ctx.fill();

    // glowing edge conduits
    ctx.strokeStyle = 'rgba(136,136,255,0.8)';
    ctx.lineWidth = 1.6;
    hex(0, R * 0.78);
    ctx.stroke();

    // emitter pylons with front faces
    for (const i of [0, 2, 4]) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        const px = cx + Math.cos(a) * R * 0.95;
        const py = cy + Math.sin(a) * R * 0.76;
        ctx.fillStyle = '#2c2c46';
        rr(ctx, px - 4, py - 7, 8, 12, 2.5); ctx.fill();
        ctx.fillStyle = '#4c4c74';
        rr(ctx, px - 4, py - 13, 8, 9, 2.5); ctx.fill();
        ctx.fillStyle = '#8888ff';
        ctx.beginPath(); ctx.arc(px, py - 13, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // central hologram arrow
    ctx.drawImage(getGlowSprite('rgba(136,136,255,0.5)', 56), cx - 24, cy - 40, 48, 48);
    ctx.fillStyle = 'rgba(160,160,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 34);
    ctx.lineTo(cx + 9, cy - 16);
    ctx.lineTo(cx + 3.6, cy - 16);
    ctx.lineTo(cx + 3.6, cy - 2);
    ctx.lineTo(cx - 3.6, cy - 2);
    ctx.lineTo(cx - 3.6, cy - 16);
    ctx.lineTo(cx - 9, cy - 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,160,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 12, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
}

export function drawRadar(ctx, w, h) {
    // Sturdy scanner installation; the dish itself is drawn dynamically
    // by the renderer so it can rotate.
    const cx = w / 2;
    // concrete pedestal
    ctx.fillStyle = '#4a5058';
    rr(ctx, w * 0.18, h * 0.72, w * 0.64, h * 0.2, 4); ctx.fill();
    ctx.fillStyle = '#5c646e';
    rr(ctx, w * 0.18, h * 0.72, w * 0.64, h * 0.08, 4); ctx.fill();
    hazardStripes(ctx, w * 0.22, h * 0.85, w * 0.56, 3.4);
    bolt(ctx, w * 0.24, h * 0.78, 1.5); bolt(ctx, w * 0.76, h * 0.78, 1.5);

    // tapered steel tower, two-tone with cross-brace
    ctx.fillStyle = '#38424c';
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.72);
    ctx.lineTo(w * 0.42, h * 0.3);
    ctx.lineTo(w * 0.58, h * 0.3);
    ctx.lineTo(w * 0.66, h * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4e5a66';
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.72);
    ctx.lineTo(w * 0.42, h * 0.3);
    ctx.lineTo(w * 0.5, h * 0.3);
    ctx.lineTo(w * 0.47, h * 0.72);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(16,22,28,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.37, h * 0.6); ctx.lineTo(w * 0.63, h * 0.44);
    ctx.moveTo(w * 0.63, h * 0.6); ctx.lineTo(w * 0.37, h * 0.44);
    ctx.stroke();
    // service ladder
    ctx.strokeStyle = 'rgba(150,170,185,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.56, h * (0.36 + i * 0.09));
        ctx.lineTo(w * 0.62, h * (0.36 + i * 0.09));
        ctx.stroke();
    }

    // platform disc with railing studs
    ctx.fillStyle = '#2c343c';
    ctx.beginPath(); ctx.ellipse(cx, h * 0.3, w * 0.24, w * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#41505c';
    ctx.beginPath(); ctx.ellipse(cx, h * 0.28, w * 0.24, w * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a7a88';
    for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i / 4) * Math.PI;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * w * 0.2, h * 0.28 + Math.sin(a) * w * 0.075, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    // pivot hub (dish mounts here)
    ctx.fillStyle = '#222a32';
    ctx.beginPath(); ctx.arc(cx, h * 0.26, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#44ccff';
    ctx.beginPath(); ctx.arc(cx, h * 0.26, 1.6, 0, Math.PI * 2); ctx.fill();
}

export function drawRepairStation(ctx, w, h) {
    drawGroundBlob(ctx, w, h, 103, 'rgba(42,54,46,0.55)');
    // slant-roofed garage (left ~2/3) with open bay
    ctx.fillStyle = '#3a4a3e';
    rr(ctx, w * 0.06, h * 0.3, w * 0.58, h * 0.44, 4); ctx.fill();
    // slanted roof
    ctx.fillStyle = '#2e3a32';
    ctx.beginPath();
    ctx.moveTo(w * 0.02, h * 0.34);
    ctx.lineTo(w * 0.1, h * 0.12);
    ctx.lineTo(w * 0.68, h * 0.2);
    ctx.lineTo(w * 0.68, h * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(140,180,150,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(w * (0.06 + i * 0.14), h * 0.15);
        ctx.lineTo(w * (0.06 + i * 0.14), h * 0.32);
        ctx.stroke();
    }
    // open dark bay with glowing weld light
    ctx.fillStyle = '#141a16';
    rr(ctx, w * 0.13, h * 0.4, w * 0.34, h * 0.34, 3); ctx.fill();
    ctx.drawImage(getGlowSprite('rgba(120,255,190,0.4)', 40), w * 0.22, h * 0.48, 22, 22);
    ctx.fillStyle = '#8affc4';
    ctx.beginPath(); ctx.arc(w * 0.3, h * 0.6, 2, 0, Math.PI * 2); ctx.fill();
    // crane arm reaching from the roof corner
    ctx.strokeStyle = '#5c6a5c';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(w * 0.64, h * 0.2);
    ctx.lineTo(w * 0.86, h * 0.34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,230,230,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w * 0.84, h * 0.34); ctx.lineTo(w * 0.84, h * 0.5); ctx.stroke();
    // hook + hanging gear plate
    ctx.fillStyle = '#8a9a8e';
    ctx.beginPath(); ctx.arc(w * 0.84, h * 0.53, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#44ff88';
    ctx.beginPath(); ctx.arc(w * 0.84, h * 0.53, 1.5, 0, Math.PI * 2); ctx.fill();
    // wrench emblem on the roof
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.245); ctx.lineTo(w * 0.4, h * 0.21);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(w * 0.27, h * 0.255, 3, -0.6, Math.PI + 0.6); ctx.stroke();
    ctx.lineCap = 'butt';
    // parts crates in the yard
    ctx.fillStyle = '#8a3c2c';
    rr(ctx, w * 0.68, h * 0.62, w * 0.15, h * 0.11, 2); ctx.fill();
    ctx.fillStyle = '#b85c40';
    rr(ctx, w * 0.68, h * 0.62, w * 0.15, h * 0.035, 2); ctx.fill();
    ctx.fillStyle = '#55605a';
    rr(ctx, w * 0.74, h * 0.76, w * 0.12, h * 0.1, 2); ctx.fill();
}

export function drawTeleporter(ctx, w, h) {
    // outer ring pad
    ctx.fillStyle = '#2c2c44';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(8,8,20,0.6)';
    ctx.lineWidth = 2; ctx.stroke();
    // concentric rings
    for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(204,68,255,${0.5 - i * 0.12})`;
        ctx.lineWidth = 2.4 - i * 0.5;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * (0.36 - i * 0.09), 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.drawImage(getGlowSprite('rgba(204,68,255,0.4)', 96), w / 2 - 44, h / 2 - 44, 88, 88);
    // emitter pylons at 4 corners
    for (const ang of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
        const px = w / 2 + Math.cos(ang) * w * 0.4;
        const py = h / 2 + Math.sin(ang) * w * 0.4;
        ctx.fillStyle = '#44446a';
        rr(ctx, px - 6, py - 6, 12, 12, 3); ctx.fill();
        ctx.fillStyle = '#cc44ff';
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // center vortex core
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w * 0.14);
    g.addColorStop(0, '#f0d0ff');
    g.addColorStop(0.5, '#b040ff');
    g.addColorStop(1, '#3c1060');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.14, 0, Math.PI * 2); ctx.fill();
}

// ---------- ENEMIES (all drawn facing +X) ----------
export function drawEnemySprite(ctx, w, h, type) {
    const cx = w / 2, cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    const u = w / 48; // unit scale

    if (type === 'scout') {
        // sleek dart
        ctx.fillStyle = '#8a2020';
        ctx.beginPath();
        ctx.moveTo(14 * u, 0);
        ctx.lineTo(-8 * u, -8 * u);
        ctx.lineTo(-4 * u, 0);
        ctx.lineTo(-8 * u, 8 * u);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#cc4444';
        ctx.beginPath();
        ctx.moveTo(12 * u, 0);
        ctx.lineTo(-6 * u, -5.5 * u);
        ctx.lineTo(-2.5 * u, 0);
        ctx.lineTo(-6 * u, 5.5 * u);
        ctx.closePath(); ctx.fill();
        // cockpit
        ctx.fillStyle = '#ffd28a';
        ctx.beginPath(); ctx.ellipse(4 * u, 0, 3 * u, 1.8 * u, 0, 0, Math.PI * 2); ctx.fill();
        // fins
        ctx.fillStyle = '#701818';
        ctx.beginPath();
        ctx.moveTo(-6 * u, -6 * u); ctx.lineTo(-12 * u, -10 * u); ctx.lineTo(-8 * u, -3 * u);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-6 * u, 6 * u); ctx.lineTo(-12 * u, 10 * u); ctx.lineTo(-8 * u, 3 * u);
        ctx.closePath(); ctx.fill();
    } else if (type === 'infantry') {
        // six-legged bug
        ctx.strokeStyle = '#6a2a1a';
        ctx.lineWidth = 2 * u;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 5 * u, -6 * u); ctx.lineTo(i * 5 * u - 3 * u, -11 * u);
            ctx.moveTo(i * 5 * u, 6 * u); ctx.lineTo(i * 5 * u - 3 * u, 11 * u);
            ctx.stroke();
        }
        ctx.fillStyle = '#a84a2a';
        ctx.beginPath(); ctx.ellipse(0, 0, 10 * u, 8 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cc6644';
        ctx.beginPath(); ctx.ellipse(1.5 * u, -1 * u, 7.5 * u, 5.5 * u, 0, 0, Math.PI * 2); ctx.fill();
        // head + eyes
        ctx.fillStyle = '#7a3018';
        ctx.beginPath(); ctx.arc(9 * u, 0, 4.4 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffdd44';
        ctx.beginPath(); ctx.arc(10.5 * u, -1.8 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(10.5 * u, 1.8 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
        // shell seam
        ctx.strokeStyle = 'rgba(60,20,10,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-7 * u, 0); ctx.lineTo(6 * u, 0); ctx.stroke();
    } else if (type === 'heavy') {
        // armored beetle
        ctx.fillStyle = '#4a2222';
        ctx.beginPath(); ctx.ellipse(0, 0, 13 * u, 11 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a3232';
        ctx.beginPath(); ctx.ellipse(0.5 * u, -0.5 * u, 11 * u, 9 * u, 0, 0, Math.PI * 2); ctx.fill();
        // armor plates
        ctx.strokeStyle = '#3a1a1a';
        ctx.lineWidth = 1.6 * u;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.arc(-14 * u, 0, (16 + i * 4) * u, -0.5, 0.5);
            ctx.stroke();
        }
        // rivets
        ctx.fillStyle = '#8a5252';
        for (const [rx, ry] of [[-4, -5], [-4, 5], [3, -6], [3, 6], [7, 0]]) {
            ctx.beginPath(); ctx.arc(rx * u, ry * u, 1.3 * u, 0, Math.PI * 2); ctx.fill();
        }
        // visor
        ctx.fillStyle = '#ff8844';
        rr(ctx, 8 * u, -3 * u, 5 * u, 6 * u, 2 * u); ctx.fill();
    } else if (type === 'demolisher') {
        // bulky with blade arms
        ctx.fillStyle = '#7a5210';
        ctx.beginPath(); ctx.ellipse(0, 0, 11 * u, 9.5 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cc8800';
        ctx.beginPath(); ctx.ellipse(1 * u, -0.8 * u, 8.5 * u, 7 * u, 0, 0, Math.PI * 2); ctx.fill();
        // blade arms
        ctx.fillStyle = '#a8a8b0';
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(4 * u, s * 7 * u);
            ctx.lineTo(15 * u, s * 11 * u);
            ctx.lineTo(16 * u, s * 6 * u);
            ctx.lineTo(7 * u, s * 4 * u);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#606068';
            ctx.lineWidth = u;
            ctx.stroke();
        }
        // warning core
        ctx.fillStyle = '#2c1c04';
        ctx.beginPath(); ctx.arc(0, 0, 4 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(0, 0, 2 * u, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'swarmDrone') {
        // quad rotor X
        ctx.strokeStyle = '#8a2a5a';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(-8 * u, -8 * u); ctx.lineTo(8 * u, 8 * u);
        ctx.moveTo(-8 * u, 8 * u); ctx.lineTo(8 * u, -8 * u);
        ctx.stroke();
        // rotors
        ctx.fillStyle = 'rgba(220,120,190,0.35)';
        for (const [rx, ry] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
            ctx.beginPath(); ctx.arc(rx * u, ry * u, 5 * u, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#cc4488';
        ctx.beginPath(); ctx.arc(0, 0, 4.5 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff88bb';
        ctx.beginPath(); ctx.arc(1 * u, -1 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'tank') {
        // treads
        ctx.fillStyle = '#2e2e24';
        rr(ctx, -13 * u, -12 * u, 26 * u, 7 * u, 3 * u); ctx.fill();
        rr(ctx, -13 * u, 5 * u, 26 * u, 7 * u, 3 * u); ctx.fill();
        ctx.fillStyle = '#4a4a3a';
        for (let i = 0; i < 6; i++) {
            rr(ctx, (-11 + i * 4) * u, -11 * u, 2 * u, 5 * u, u); ctx.fill();
            rr(ctx, (-11 + i * 4) * u, 6 * u, 2 * u, 5 * u, u); ctx.fill();
        }
        // hull
        ctx.fillStyle = '#565640';
        rr(ctx, -11 * u, -7 * u, 22 * u, 14 * u, 3 * u); ctx.fill();
        ctx.fillStyle = '#6a6a4e';
        rr(ctx, -9 * u, -5.5 * u, 18 * u, 11 * u, 2.5 * u); ctx.fill();
        // turret + barrel
        ctx.fillStyle = '#44442f';
        ctx.beginPath(); ctx.arc(-1 * u, 0, 5.5 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2c2c1e';
        rr(ctx, 3 * u, -1.6 * u, 13 * u, 3.2 * u, 1.4 * u); ctx.fill();
        ctx.fillStyle = '#8a8a66';
        ctx.beginPath(); ctx.arc(-1 * u, 0, 2.6 * u, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'siegeMech') {
        // four splayed legs
        ctx.strokeStyle = '#5a1414';
        ctx.lineWidth = 3.5 * u;
        ctx.lineCap = 'round';
        for (const [lx, ly] of [[-10, -12], [-10, 12], [8, -13], [8, 13]]) {
            ctx.beginPath();
            ctx.moveTo(lx * 0.4 * u, ly * 0.3 * u);
            ctx.quadraticCurveTo(lx * u, ly * 0.6 * u, lx * u * 1.3, ly * u);
            ctx.stroke();
            ctx.fillStyle = '#3c0e0e';
            ctx.beginPath(); ctx.arc(lx * u * 1.3, ly * u, 2.5 * u, 0, Math.PI * 2); ctx.fill();
        }
        ctx.lineCap = 'butt';
        // hex torso
        ctx.fillStyle = '#7a1a1a';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * 11 * u, Math.sin(a) * 11 * u);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a82a2a';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * 8.5 * u, Math.sin(a) * 8.5 * u);
        }
        ctx.closePath(); ctx.fill();
        // twin cannons
        ctx.fillStyle = '#2c0a0a';
        rr(ctx, 6 * u, -6 * u, 12 * u, 3.4 * u, 1.5 * u); ctx.fill();
        rr(ctx, 6 * u, 2.6 * u, 12 * u, 3.4 * u, 1.5 * u); ctx.fill();
        // glowing core
        ctx.fillStyle = '#ffde8a';
        ctx.beginPath(); ctx.arc(0, 0, 3.6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff8830';
        ctx.beginPath(); ctx.arc(0, 0, 2 * u, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'voidWalker') {
        // ethereal ring creature
        ctx.strokeStyle = 'rgba(150,80,255,0.35)';
        ctx.lineWidth = 3 * u;
        ctx.beginPath(); ctx.arc(0, 0, 13 * u, 0, Math.PI * 2); ctx.stroke();
        // tentacle stubs
        ctx.strokeStyle = '#4a1a8a';
        ctx.lineWidth = 2.6 * u;
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + 0.5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u);
            ctx.quadraticCurveTo(Math.cos(a + 0.3) * 12 * u, Math.sin(a + 0.3) * 12 * u,
                Math.cos(a + 0.15) * 15 * u, Math.sin(a + 0.15) * 15 * u);
            ctx.stroke();
        }
        ctx.lineCap = 'butt';
        // body
        ctx.fillStyle = '#3c1470';
        ctx.beginPath(); ctx.arc(0, 0, 9.5 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6622cc';
        ctx.beginPath(); ctx.arc(0.8 * u, -0.8 * u, 7 * u, 0, Math.PI * 2); ctx.fill();
        // void core
        const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 5 * u);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, '#cc88ff');
        g.addColorStop(1, '#3c1470');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 4.5 * u, 0, Math.PI * 2); ctx.fill();
        // eye slits
        ctx.fillStyle = '#f0d0ff';
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(6 * u, s * 3 * u, 2.2 * u, u, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

// ---------- WORKER (fully dynamic, side-view chibi) ----------
// opts: { facing: 1|-1, walkPhase, action: 'idle'|'walk'|'build'|'mine'|'carry',
//         actionPhase, carryColor, selected }
export function drawWorkerSprite(ctx, x, y, opts) {
    const {
        facing = 1, walkPhase = 0, action = 'idle',
        actionPhase = 0, carryColor = null, selected = false
    } = opts;

    const moving = action === 'walk' || action === 'carry';
    const legSwing = moving ? Math.sin(walkPhase) * 3.2 : 0;
    const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.6 : Math.sin(walkPhase * 0.28) * 0.5;

    ctx.save();
    ctx.translate(x, y);

    // shadow
    drawShadowBlob(ctx, 0, 1.5, 7.5, 2.8, 0.3);

    if (selected) {
        ctx.strokeStyle = 'rgba(0,255,136,0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, 1.5, 9.5, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,255,136,0.25)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.ellipse(0, 1.5, 9.5, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.scale(facing, 1);
    ctx.translate(0, -bob);

    // legs (dark blue work pants + boots)
    for (const s of [-1, 1]) {
        const lx = s * 2.4 + legSwing * s;
        ctx.strokeStyle = '#33415c';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 1.8, -7);
        ctx.lineTo(lx, -1);
        ctx.stroke();
        // boot
        ctx.fillStyle = '#26221c';
        ctx.beginPath();
        ctx.ellipse(lx + 0.8, -0.5, 2.2, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // carrying: sack on back (behind torso)
    if (action === 'carry' && carryColor) {
        ctx.fillStyle = '#6b5233';
        ctx.beginPath();
        ctx.ellipse(-4.6, -11.5, 3.6, 4.4, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = carryColor;
        ctx.beginPath();
        ctx.ellipse(-5.2, -14.2, 2.2, 1.6, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,15,0.7)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(-4.6, -11.5, 3.6, 4.4, -0.35, 0, Math.PI * 2);
        ctx.stroke();
    }

    // torso: orange hi-vis vest
    const lean = action === 'carry' ? 0.16 : (moving ? 0.06 : 0);
    ctx.save();
    ctx.rotate(lean);
    ctx.fillStyle = '#e87820';
    rr(ctx, -3.6, -14.5, 7.2, 8, 2.5);
    ctx.fill();
    // hi-vis stripe
    ctx.fillStyle = '#f5e13a';
    ctx.fillRect(-3.6, -11.8, 7.2, 1.7);
    // vest shading
    ctx.fillStyle = 'rgba(120,50,10,0.35)';
    ctx.fillRect(-3.6, -8.4, 7.2, 1.9);

    // back arm (swings opposite legs, or works)
    const armSwing = moving ? -legSwing * 0.28 : 0;
    ctx.strokeStyle = '#c96415';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';

    let toolAngle = null;
    if (action === 'build' || action === 'mine' || action === 'chop') {
        // swing cycle: raise then strike
        const t = actionPhase % 1;
        toolAngle = t < 0.4 ? -1.5 + (t / 0.4) * 0.4 : -1.1 + ((t - 0.4) / 0.6) * 2.0;
    }

    ctx.beginPath();
    ctx.moveTo(-2.6, -13);
    ctx.lineTo(-4 + armSwing, -8.5);
    ctx.stroke();

    // head + hard hat
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(0.4, -17.2, 3.4, 0, Math.PI * 2); ctx.fill();
    // eye
    ctx.fillStyle = '#26221c';
    ctx.beginPath(); ctx.arc(1.9, -17.5, 0.65, 0, Math.PI * 2); ctx.fill();
    // hard hat
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(0.4, -18.2, 3.7, Math.PI, 0); ctx.fill();
    rr(ctx, -3.8, -18.6, 8.4, 1.6, 0.8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(-0.8, -19.6, 1.1, 0, Math.PI * 2); ctx.fill();

    // front arm (with tool when working)
    if (toolAngle !== null) {
        ctx.save();
        ctx.translate(2.4, -12.6);
        ctx.rotate(toolAngle);
        // arm
        ctx.strokeStyle = '#e8801e';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(4.6, 1);
        ctx.stroke();
        // tool
        ctx.translate(4.6, 1);
        ctx.rotate(0.5);
        ctx.strokeStyle = '#8a6234';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6.5); ctx.stroke();
        if (action === 'build') {
            // hammer head
            ctx.fillStyle = '#9aa2a8';
            rr(ctx, -2.8, -8.8, 5.6, 2.8, 1);
            ctx.fill();
        } else if (action === 'chop') {
            // axe: wedge blade on one side
            ctx.fillStyle = '#aab2b8';
            ctx.beginPath();
            ctx.moveTo(0.4, -7.6);
            ctx.lineTo(4.6, -6.8);
            ctx.quadraticCurveTo(5.4, -5.2, 4.4, -3.6);
            ctx.lineTo(0.4, -4.6);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.moveTo(4.6, -6.8);
            ctx.quadraticCurveTo(5.4, -5.2, 4.4, -3.6);
            ctx.lineTo(3.8, -4.2);
            ctx.quadraticCurveTo(4.5, -5.3, 3.9, -6.4);
            ctx.closePath(); ctx.fill();
        } else {
            // pickaxe head
            ctx.strokeStyle = '#7d8286';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, -5.4, 4.2, Math.PI + 0.5, Math.PI * 2 - 0.5);
            ctx.stroke();
        }
        ctx.restore();
    } else {
        ctx.strokeStyle = '#e8801e';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(2.6, -13);
        ctx.lineTo(4 - armSwing, -8.5);
        ctx.stroke();
    }

    ctx.restore(); // lean
    ctx.restore(); // main
}

// ---------- EFFECTS ----------
export function getMuzzleFlashSprite(color = '#ffdd66') {
    return getSprite(`muzzle_${color}`, (ctx, w, h) => {
        const cx = w / 2, cy = h / 2;
        ctx.translate(cx, cy);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, color);
        g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = g;
        // 4-point star
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r = i % 2 === 0 ? w / 2 : w / 7;
            ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
    }, 28, 28);
}

export function drawScaffold(ctx, w, h) {
    // wooden corner posts + cross braces over a dirt patch
    ctx.fillStyle = 'rgba(60,48,30,0.5)';
    rr(ctx, 3, 3, w - 6, h - 6, 5);
    ctx.fill();
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 3;
    const p = 6;
    // corner posts
    for (const [x, y] of [[p, p], [w - p, p], [p, h - p], [w - p, h - p]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
        ctx.stroke();
    }
    // frame
    ctx.strokeStyle = 'rgba(138,106,58,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(p, p, w - p * 2, h - p * 2);
    // cross braces
    ctx.strokeStyle = 'rgba(138,106,58,0.45)';
    ctx.beginPath();
    ctx.moveTo(p, p); ctx.lineTo(w - p, h - p);
    ctx.moveTo(w - p, p); ctx.lineTo(p, h - p);
    ctx.stroke();
}
