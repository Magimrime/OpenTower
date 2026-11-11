// ===== SAVE / LOAD =====
// Full game-state serialization to localStorage.
const SAVE_KEY = 'openTowerSave';

export function serializeGame(game) {
    return {
        version: 2,
        savedAt: Date.now(),
        mode: game.gameMode,
        campaignLevel: game.waveMgr.campaignLevel,
        time: game.time,
        resources: { ...game.resourceMgr.resources },
        stats: { ...game.stats },
        workerUpgrades: { ...game.workerMgr.upgrades },
        workers: game.workerMgr.workers.map(w => ({
            x: Math.round(w.worldX), y: Math.round(w.worldY), hp: Math.round(w.hp)
        })),
        buildings: game.buildingMgr.buildings.map(b => ({
            type: b.type, gx: b.gx, gy: b.gy, level: b.level,
            hp: Math.round(b.hp), built: b.built,
            progress: b.buildProgress,
            workersGranted: b.workersGranted || 0,
            soldiersGranted: b.soldiersGranted || 0,
            mountedWeapon: b.mountedWeapon || null
        })),
        soldiers: game.soldierMgr.soldiers.map(s => ({
            x: Math.round(s.worldX), y: Math.round(s.worldY),
            gx: Math.round(s.guardX), gy: Math.round(s.guardY),
            hp: Math.round(s.hp)
        })),
        wires: [...game.wireSystem.wires.values()].map(w => ({
            gx: w.gx, gy: w.gy, type: w.type
        })),
        nodes: game.resourceMgr.nodes.map(n => ({
            type: n.type, gx: n.gx, gy: n.gy,
            amount: Math.round(n.amount), maxAmount: Math.round(n.maxAmount),
            isStump: n.isStump || false,
            regrowAt: n.regrowAt !== undefined ? Math.round(n.regrowAt) : undefined
        })),
        respawns: game.resourceMgr.pendingRespawns.map(r => ({
            type: r.type, gx: r.gx, gy: r.gy, at: Math.round(r.at)
        })),
        generatedRadius: game.resourceMgr.generatedRadius || 28,
        enemies: game.enemyMgr.enemies.map(e => ({
            type: e.type, x: Math.round(e.worldX), y: Math.round(e.worldY), hp: Math.round(e.hp)
        })),
        wave: {
            currentWave: game.waveMgr.currentWave,
            waveTimer: game.waveMgr.waveTimer,
            waveActive: game.waveMgr.waveActive,
            wavesThisLevel: game.waveMgr.wavesThisLevel,
            score: game.waveMgr.score,
            spawnQueue: game.waveMgr.spawnQueue,
            pendingQueue: game.waveMgr.pendingQueue
        }
    };
}

export function saveGame(game) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(serializeGame(game)));
        return true;
    } catch {
        return false;
    }
}

export function loadSaveData() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.version !== 2) return null;
        return data;
    } catch {
        return null;
    }
}

export function hasSave() {
    return loadSaveData() !== null;
}

export function deleteSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* no-op */ }
}
