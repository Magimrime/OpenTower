// ===== PROCEDURAL AUDIO =====
// All SFX are synthesized with WebAudio — no asset files.
// AudioContext is created lazily on first user gesture.

class AudioManager {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.enabled = true;
        this.volume = 0.5;
        this.lastPlayed = new Map(); // rate limiting per sound
        this._noiseBuffer = null;

        try {
            const saved = JSON.parse(localStorage.getItem('openTowerAudio') || '{}');
            if (saved.volume !== undefined) this.volume = saved.volume;
            if (saved.enabled !== undefined) this.enabled = saved.enabled;
        } catch { /* defaults */ }

        const unlock = () => this._ensureCtx();
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
    }

    _ensureCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setVolume(v) {
        this.volume = v;
        if (this.master) this.master.gain.value = v;
        this._save();
    }

    setEnabled(on) {
        this.enabled = on;
        this._save();
    }

    _save() {
        try {
            localStorage.setItem('openTowerAudio', JSON.stringify({ volume: this.volume, enabled: this.enabled }));
        } catch { /* full/blocked storage is non-fatal */ }
    }

    _noise() {
        if (!this._noiseBuffer) {
            const len = this.ctx.sampleRate * 0.5;
            this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = this._noiseBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        return this._noiseBuffer;
    }

    // Simple envelope oscillator voice
    _tone({ type = 'sine', freq = 440, freqEnd = null, time = 0.15, vol = 0.3, attack = 0.005, delay = 0 }) {
        const t0 = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + time);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
        osc.connect(gain).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + time + 0.02);
    }

    _noiseBurst({ time = 0.2, vol = 0.3, filterFreq = 2000, filterEnd = null, filterType = 'lowpass', delay = 0 }) {
        const t0 = this.ctx.currentTime + delay;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noise();
        src.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFreq, t0);
        if (filterEnd !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(30, filterEnd), t0 + time);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
        src.connect(filter).connect(gain).connect(this.master);
        src.start(t0);
        src.stop(t0 + time + 0.02);
    }

    play(name, opts = {}) {
        if (!this.enabled) return;
        this._ensureCtx();
        if (!this.ctx || this.ctx.state !== 'running') return;

        // rate limit rapid-fire sounds
        const now = performance.now();
        const minGap = RATE_LIMITS[name] ?? 40;
        const last = this.lastPlayed.get(name) || 0;
        if (now - last < minGap) return;
        this.lastPlayed.set(name, now);

        const fn = SOUNDS[name];
        if (fn) fn(this, opts);
    }
}

const RATE_LIMITS = {
    shoot_mg: 55, hit: 50, hammer: 90, harvest: 120,
    explosion_small: 60, laser: 200, deposit: 80, enemy_die: 50
};

const SOUNDS = {
    click: (a) => a._tone({ type: 'square', freq: 660, freqEnd: 520, time: 0.06, vol: 0.12 }),
    hover: (a) => a._tone({ type: 'sine', freq: 880, time: 0.04, vol: 0.05 }),
    invalid: (a) => {
        a._tone({ type: 'square', freq: 190, time: 0.12, vol: 0.14 });
        a._tone({ type: 'square', freq: 140, time: 0.14, vol: 0.14, delay: 0.09 });
    },
    place: (a) => {
        a._noiseBurst({ time: 0.12, vol: 0.16, filterFreq: 900, filterEnd: 300 });
        a._tone({ type: 'sine', freq: 200, freqEnd: 120, time: 0.15, vol: 0.22 });
    },
    hammer: (a) => {
        a._noiseBurst({ time: 0.05, vol: 0.1, filterFreq: 2600, filterEnd: 1000 });
        a._tone({ type: 'triangle', freq: 310 + Math.random() * 60, freqEnd: 180, time: 0.07, vol: 0.12 });
    },
    complete: (a) => {
        a._tone({ type: 'sine', freq: 523, time: 0.1, vol: 0.16 });
        a._tone({ type: 'sine', freq: 659, time: 0.1, vol: 0.16, delay: 0.08 });
        a._tone({ type: 'sine', freq: 784, time: 0.18, vol: 0.16, delay: 0.16 });
    },
    harvest: (a) => a._noiseBurst({ time: 0.06, vol: 0.06, filterFreq: 3200, filterEnd: 1600, filterType: 'bandpass' }),
    deposit: (a) => {
        a._tone({ type: 'sine', freq: 940, freqEnd: 1180, time: 0.08, vol: 0.1 });
        a._tone({ type: 'sine', freq: 1420, time: 0.06, vol: 0.07, delay: 0.05 });
    },
    shoot_mg: (a) => {
        a._noiseBurst({ time: 0.05, vol: 0.09, filterFreq: 1800, filterEnd: 700 });
        a._tone({ type: 'square', freq: 220 + Math.random() * 40, freqEnd: 90, time: 0.05, vol: 0.08 });
    },
    shoot_cannon: (a) => {
        a._tone({ type: 'sine', freq: 110, freqEnd: 45, time: 0.28, vol: 0.34 });
        a._noiseBurst({ time: 0.22, vol: 0.2, filterFreq: 1100, filterEnd: 160 });
    },
    laser: (a) => {
        a._tone({ type: 'sawtooth', freq: 1150, freqEnd: 820, time: 0.12, vol: 0.06 });
        a._tone({ type: 'sine', freq: 2300, freqEnd: 1700, time: 0.1, vol: 0.04 });
    },
    shoot_missile: (a) => {
        a._noiseBurst({ time: 0.4, vol: 0.16, filterFreq: 500, filterEnd: 2600 });
        a._tone({ type: 'sawtooth', freq: 150, freqEnd: 380, time: 0.35, vol: 0.07 });
    },
    hit: (a) => a._tone({ type: 'triangle', freq: 480 + Math.random() * 120, freqEnd: 220, time: 0.05, vol: 0.06 }),
    explosion_small: (a) => {
        a._noiseBurst({ time: 0.3, vol: 0.2, filterFreq: 1400, filterEnd: 120 });
        a._tone({ type: 'sine', freq: 130, freqEnd: 40, time: 0.3, vol: 0.22 });
    },
    explosion_big: (a) => {
        a._noiseBurst({ time: 0.7, vol: 0.32, filterFreq: 1600, filterEnd: 60 });
        a._tone({ type: 'sine', freq: 90, freqEnd: 28, time: 0.65, vol: 0.4 });
        a._tone({ type: 'sine', freq: 55, freqEnd: 24, time: 0.8, vol: 0.28, delay: 0.05 });
    },
    enemy_die: (a) => {
        a._noiseBurst({ time: 0.16, vol: 0.1, filterFreq: 1200, filterEnd: 200 });
        a._tone({ type: 'square', freq: 300, freqEnd: 70, time: 0.16, vol: 0.09 });
    },
    building_destroyed: (a) => {
        a._noiseBurst({ time: 0.5, vol: 0.26, filterFreq: 900, filterEnd: 80 });
        a._tone({ type: 'sine', freq: 100, freqEnd: 35, time: 0.5, vol: 0.3 });
    },
    base_hit: (a) => {
        a._tone({ type: 'square', freq: 220, freqEnd: 110, time: 0.2, vol: 0.2 });
        a._tone({ type: 'sine', freq: 80, freqEnd: 50, time: 0.3, vol: 0.28 });
    },
    wave_start: (a) => {
        a._tone({ type: 'sawtooth', freq: 175, time: 0.4, vol: 0.14 });
        a._tone({ type: 'sawtooth', freq: 220, time: 0.4, vol: 0.14, delay: 0.02 });
        a._tone({ type: 'sawtooth', freq: 175 * 1.5, time: 0.55, vol: 0.14, delay: 0.35 });
    },
    wave_clear: (a) => {
        [523, 659, 784, 1047].forEach((f, i) =>
            a._tone({ type: 'triangle', freq: f, time: 0.16, vol: 0.14, delay: i * 0.09 }));
    },
    victory: (a) => {
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
            a._tone({ type: 'triangle', freq: f, time: 0.22, vol: 0.16, delay: i * 0.13 }));
    },
    defeat: (a) => {
        [392, 330, 262, 196].forEach((f, i) =>
            a._tone({ type: 'sawtooth', freq: f, time: 0.4, vol: 0.14, delay: i * 0.22 }));
    },
    upgrade: (a) => {
        a._tone({ type: 'sine', freq: 420, freqEnd: 940, time: 0.22, vol: 0.16 });
        a._tone({ type: 'sine', freq: 1200, time: 0.12, vol: 0.1, delay: 0.18 });
    },
    sell: (a) => {
        a._tone({ type: 'sine', freq: 700, freqEnd: 330, time: 0.18, vol: 0.14 });
        a._noiseBurst({ time: 0.1, vol: 0.06, filterFreq: 2000, filterEnd: 500 });
    },
    teleport: (a) => {
        a._tone({ type: 'sine', freq: 300, freqEnd: 1500, time: 0.4, vol: 0.14 });
        a._tone({ type: 'sine', freq: 1500, freqEnd: 300, time: 0.4, vol: 0.12, delay: 0.35 });
    },
    boss_warning: (a) => {
        a._tone({ type: 'sawtooth', freq: 130, time: 0.5, vol: 0.2 });
        a._tone({ type: 'sawtooth', freq: 123, time: 0.5, vol: 0.2, delay: 0.02 });
        a._tone({ type: 'sawtooth', freq: 130, time: 0.5, vol: 0.2, delay: 0.6 });
        a._tone({ type: 'sawtooth', freq: 123, time: 0.5, vol: 0.2, delay: 0.62 });
    }
};

export const audio = new AudioManager();
