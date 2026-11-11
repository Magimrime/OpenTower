// ===== WAVE SYSTEM =====
import { WAVE_CONFIG, MAP_CONFIG, ENEMIES } from './config.js';
import { randomInt, randomChoice } from './utils/math.js';
import { audio } from './audio.js';

const SIDE_NAMES = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export class WaveManager {
    constructor() {
        this.currentWave = 0;
        this.waveTimer = WAVE_CONFIG.baseTimeBetweenWaves;
        this.waveActive = false;
        this.spawnQueue = [];
        this.pendingQueue = null;      // pre-generated next wave (for radar preview)
        this.spawnTimer = 0;
        this.mode = 'campaign';
        this.campaignLevel = 1;
        this.wavesThisLevel = 0;
        this.maxWavesThisLevel = 3;
        this.levelComplete = false;
        this.score = 0;
        this.spawnWarnings = [];       // [{side, expires}] for edge arrows
    }

    init(mode, level = 1) {
        this.mode = mode;
        this.currentWave = 0;
        this.waveTimer = WAVE_CONFIG.baseTimeBetweenWaves;
        this.waveActive = false;
        this.spawnQueue = [];
        this.campaignLevel = level;
        this.wavesThisLevel = 0;
        this.levelComplete = false;
        this.score = 0;
        this.spawnWarnings = [];
        this.maxWavesThisLevel = mode === 'campaign' ? this.getWavesForLevel(level) : Infinity;
        this.pendingQueue = this.generateWave(1);
    }

    getWavesForLevel(level) {
        return 3 + Math.floor(level / 3);
    }

    update(dt, game) {
        if (this.levelComplete) return;

        // expire spawn warnings
        for (let i = this.spawnWarnings.length - 1; i >= 0; i--) {
            this.spawnWarnings[i].expires -= dt;
            if (this.spawnWarnings[i].expires <= 0) this.spawnWarnings.splice(i, 1);
        }

        if (!this.waveActive) {
            this.waveTimer -= dt;
            if (this.waveTimer <= 0) this.startNextWave(game);
            return;
        }

        // spawn from queue
        if (this.spawnQueue.length > 0) {
            this.spawnTimer += dt;
            const interval = this.currentWave <= 3
                ? WAVE_CONFIG.earlyWaveSpawnInterval
                : WAVE_CONFIG.spawnInterval;
            if (this.spawnTimer >= interval) {
                this.spawnTimer = 0;
                this.spawnEnemy(this.spawnQueue.shift(), game);
            }
        }

        // wave cleared? (stacked waves all count — currentWave already advanced)
        if (this.spawnQueue.length === 0 && game.enemyMgr.activeCount === 0) {
            this.waveActive = false;
            this.wavesThisLevel = this.currentWave;
            audio.play('wave_clear');

            if (this.mode === 'campaign' && this.wavesThisLevel >= this.maxWavesThisLevel) {
                this.levelComplete = true;
                game.victory();
            } else {
                this.waveTimer = Math.max(
                    WAVE_CONFIG.minTimeBetweenWaves,
                    WAVE_CONFIG.baseTimeBetweenWaves - this.currentWave * WAVE_CONFIG.timeBetweenWavesReduction
                );
                game.toast(`Wave ${this.currentWave} cleared!`, 'success');
                game.onWaveCleared();
            }
        }
    }

    startNextWave(game) {
        this.currentWave++;
        this.waveActive = true;
        this.spawnTimer = 0;
        this.spawnQueue = this.pendingQueue || this.generateWave(this.currentWave);
        this.pendingQueue = this.generateWave(this.currentWave + 1);

        // warnings for the sides enemies will pour from
        const sides = new Set(this.spawnQueue.map(s => s.side));
        for (const side of sides) {
            this.spawnWarnings.push({ side, expires: 7 });
        }

        const hasBoss = this.spawnQueue.some(s => ENEMIES[s.type].isBoss);
        audio.play(hasBoss ? 'boss_warning' : 'wave_start');
        game.announceWave(this.currentWave, hasBoss, [...sides].map(s => SIDE_NAMES[s]));
    }

    startEarly(game) {
        if (this.levelComplete) return;

        if (this.waveActive) {
            // calling DURING a wave stacks the next wave on top of it
            if (this.mode === 'campaign' && this.currentWave >= this.maxWavesThisLevel) return;
            const skipped = Math.max(
                WAVE_CONFIG.minTimeBetweenWaves,
                WAVE_CONFIG.baseTimeBetweenWaves - this.currentWave * WAVE_CONFIG.timeBetweenWavesReduction
            );
            const bonus = Math.ceil(skipped * 2);
            game.resourceMgr.add('wood', bonus);
            game.resourceMgr.add('stone', Math.ceil(bonus / 2));
            this.currentWave++;
            this.spawnQueue.push(...(this.pendingQueue || this.generateWave(this.currentWave)));
            this.pendingQueue = this.generateWave(this.currentWave + 1);
            const sides = new Set(this.spawnQueue.map(s => s.side));
            for (const side of sides) this.spawnWarnings.push({ side, expires: 7 });
            const hasBoss = this.spawnQueue.some(s => ENEMIES[s.type].isBoss);
            audio.play(hasBoss ? 'boss_warning' : 'wave_start');
            game.announceWave(this.currentWave, hasBoss, [...sides].map(s => SIDE_NAMES[s]));
            game.toast(`Wave ${this.currentWave} joins the assault! +${bonus} wood, +${Math.ceil(bonus / 2)} stone`, 'warning');
            return;
        }

        if (this.waveTimer <= 0) return;
        const bonus = Math.ceil(this.waveTimer * 2);
        game.resourceMgr.add('wood', bonus);
        game.resourceMgr.add('stone', Math.ceil(bonus / 2));
        game.toast(`Early wave bonus: +${bonus} wood, +${Math.ceil(bonus / 2)} stone`, 'success');
        this.waveTimer = 0.01;
    }

    generateWave(waveNum) {
        const queue = [];
        const difficulty = this.mode === 'infinite'
            ? Math.pow(WAVE_CONFIG.infiniteScaleRate, waveNum)
            : 1 + (waveNum - 1) * 0.22 + (this.campaignLevel - 1) * 0.4;

        const baseCount = Math.ceil(
            WAVE_CONFIG.baseEnemyCount *
            Math.pow(WAVE_CONFIG.enemyCountScale, waveNum - 1) *
            (difficulty * 0.5)
        );

        const types = this.getTypesForWave(waveNum);
        // waves come from 1-2 sides early, more later — feels coordinated
        const sideCount = waveNum <= 2 ? 1 : waveNum <= 6 ? 2 : waveNum <= 12 ? 3 : 4;
        const sides = [];
        while (sides.length < sideCount) {
            const s = randomInt(0, 3);
            if (!sides.includes(s)) sides.push(s);
        }

        for (let i = 0; i < baseCount; i++) {
            queue.push({ type: randomChoice(types), side: randomChoice(sides) });
        }

        if (waveNum % WAVE_CONFIG.bossWaveInterval === 0 && waveNum >= 5) {
            const bossType = waveNum >= 20 ? 'voidWalker' : 'siegeMech';
            queue.push({ type: bossType, side: randomChoice(sides) });
        }
        return queue;
    }

    getTypesForWave(waveNum) {
        if (waveNum <= 3) return ['scout'];
        if (waveNum <= 6) return ['scout', 'scout', 'infantry'];
        if (waveNum <= 10) return ['scout', 'infantry', 'infantry'];
        if (waveNum <= 14) return ['infantry', 'heavy', 'swarmDrone'];
        if (waveNum <= 20) return ['infantry', 'heavy', 'demolisher', 'swarmDrone'];
        if (waveNum <= 27) return ['heavy', 'demolisher', 'tank', 'swarmDrone'];
        return ['heavy', 'demolisher', 'tank', 'swarmDrone', 'tank'];
    }

    // Composition summary of the upcoming wave: [{type, name, count, isBoss}]
    nextWaveComposition() {
        if (!this.pendingQueue && !this.waveActive) return [];
        const source = this.waveActive ? this.spawnQueue : this.pendingQueue;
        if (!source) return [];
        const counts = new Map();
        for (const s of source) {
            counts.set(s.type, (counts.get(s.type) || 0) + 1);
        }
        return [...counts.entries()].map(([type, count]) => ({
            type, count,
            name: ENEMIES[type].name,
            color: ENEMIES[type].color,
            isBoss: !!ENEMIES[type].isBoss
        }));
    }

    spawnEnemy(spawn, game) {
        const dist = MAP_CONFIG.enemySpawnDistance;
        const base = game.buildingMgr.base;
        if (!base) return;

        let gx, gy;
        const centerGx = base.gx + 1;
        const centerGy = base.gy + 1;
        switch (spawn.side) {
            case 0: gx = centerGx + randomInt(-10, 10); gy = centerGy - dist; break;
            case 1: gx = centerGx + dist; gy = centerGy + randomInt(-10, 10); break;
            case 2: gx = centerGx + randomInt(-10, 10); gy = centerGy + dist; break;
            case 3: gx = centerGx - dist; gy = centerGy + randomInt(-10, 10); break;
        }
        game.enemyMgr.spawn(spawn.type, gx, gy);
    }

    get timeUntilWave() { return this.waveActive ? 0 : Math.max(0, this.waveTimer); }
}
