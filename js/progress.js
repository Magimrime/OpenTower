// ===== PERSISTENT PROGRESSION =====
// Campaign stars, level unlocks, building unlocks, infinite-mode records.
import { BUILDINGS } from './config.js';

const KEY = 'openTowerProgress';

class Progress {
    constructor() {
        this.data = {
            levelStars: {},          // { "1": 3, "2": 2, ... }
            maxLevelCompleted: 0,
            bestInfiniteWave: 0,
            bestInfiniteScore: 0
        };
        this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) Object.assign(this.data, JSON.parse(raw));
        } catch { /* corrupted -> defaults */ }
    }

    _save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(this.data));
        } catch { /* storage unavailable */ }
    }

    getStars(level) { return this.data.levelStars[level] || 0; }

    isLevelUnlocked(level) {
        return level <= this.data.maxLevelCompleted + 1;
    }

    completeLevel(level, stars) {
        const prev = this.data.levelStars[level] || 0;
        if (stars > prev) this.data.levelStars[level] = stars;
        if (level > this.data.maxLevelCompleted) this.data.maxLevelCompleted = level;
        this._save();
    }

    recordInfinite(wave, score) {
        let changed = false;
        if (wave > this.data.bestInfiniteWave) { this.data.bestInfiniteWave = wave; changed = true; }
        if (score > this.data.bestInfiniteScore) { this.data.bestInfiniteScore = score; changed = true; }
        if (changed) this._save();
    }

    // Is a building available in the current run?
    isBuildingUnlocked(type, gameMode, currentLevel, currentWave) {
        const def = BUILDINGS[type];
        if (!def) return false;
        if (def.unlocked) return true;
        const req = def.unlockAt;
        if (!req) return true;
        // beating the required campaign level unlocks it everywhere, permanently
        if (this.data.maxLevelCompleted >= req.level) return true;
        if (gameMode === 'campaign') return currentLevel >= req.level;
        return currentWave + 1 >= req.wave;
    }

    // Human-readable unlock hint
    unlockHint(type) {
        const def = BUILDINGS[type];
        if (!def || !def.unlockAt) return '';
        return `Unlocks at level ${def.unlockAt.level} (or wave ${def.unlockAt.wave} in Infinite)`;
    }

    totalStars() {
        return Object.values(this.data.levelStars).reduce((a, b) => a + b, 0);
    }

    resetAll() {
        this.data = { levelStars: {}, maxLevelCompleted: 0, bestInfiniteWave: 0, bestInfiniteScore: 0 };
        this._save();
    }
}

export const progress = new Progress();
