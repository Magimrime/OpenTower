// ===== OPEN TOWER — GAME CONFIGURATION =====

export const GRID_SIZE = 48;
export const HALF_GRID = GRID_SIZE / 2;

// Camera
export const CAMERA_SPEED = 400;
export const CAMERA_ZOOM_MIN = 0.55;
export const CAMERA_ZOOM_MAX = 3.0;
export const CAMERA_ZOOM_STEP = 0.1;
export const CAMERA_LERP = 0.12;

// Starting resources
export const STARTING_RESOURCES = {
    wood: 150,
    stone: 100,
    copper: 30,
    iron: 50,
    gold: 0,
    crystal: 0,
    obsidian: 0,
    darkMatter: 0,
    energy: 0
};

export const STARTING_WORKERS = 6;
export const MAX_WORKERS = 30;

// Worker behavior tuning
export const WORKER_CONFIG = {
    baseSpeed: 2.6,          // grid cells per second
    baseCarryMax: 10,        // units carried before deposit run
    harvestRate: 4,          // units harvested per second
    buildRange: 1.6,         // cells from building edge to work
    autoGatherDelay: 3,      // idle seconds before auto-gathering
    autoGatherRange: 26,     // max cells away to auto-gather
    maxGatherersPerNode: 3,  // soft cap so workers spread out
    repairRate: 14,          // hp per second when repairing
    hp: 50,                  // workers can be killed by enemies
    fleeRadius: 6.5,         // cells: enemy this close -> run home
    fleeSpeedMult: 1.2,      // adrenaline
    retrainTime: 18          // seconds per replacement worker at the base
};

// Feel / juice tuning
export const JUICE = {
    shakeSmall: 3,
    shakeBig: 9,
    turretTurnSpeed: 7,      // rad per second
    recoilDecay: 8,
    hitFlashTime: 0.12
};

// Resource node types that appear on the map
export const RESOURCE_NODES = {
    tree: { resource: 'wood', amount: 80, stumpAmount: 40, respawnTime: 75, color: '#2d7a2d', size: 1 },
    stoneDeposit: { resource: 'stone', amount: 500, regen: 0, color: '#8a8a8a', size: 1 },
    copperOre: { resource: 'copper', amount: 450, regen: 0, color: '#3ec9a7', size: 1 },
    ironOre: { resource: 'iron', amount: 400, regen: 0, color: '#b87333', size: 1 },
    goldOre: { resource: 'gold', amount: 250, regen: 0, color: '#ffd700', size: 1 },
    crystalNode: { resource: 'crystal', amount: 160, regen: 0, color: '#b040ff', size: 1 },
    obsidianShard: { resource: 'obsidian', amount: 200, regen: 0, color: '#8f7bd8', size: 1 }
};

// Building definitions
export const BUILDINGS = {
    base: {
        name: 'Command Bunker',
        category: 'core',
        size: 3,
        hp: 2000,
        cost: { wood: 150, stone: 100, iron: 50 }, // upgrade pricing (never placed)
        buildTime: 0,
        description: 'Your main base. Protect at all costs! Upgrade it and mount a weapon on top.',
        powerDraw: 0,
        color: '#4a6a4a',
        accentColor: '#00ff88',
        unlocked: true
    },
    machineGun: {
        name: 'Machine Gun Turret',
        weapon: 'mg',
        category: 'defense',
        size: 1,
        hp: 150,
        cost: { wood: 50, iron: 30 },
        buildTime: 8,
        damage: 8,
        range: 5,
        fireRate: 4,
        projectileSpeed: 12,
        description: 'Fast-firing, low damage turret.',
        powerDraw: 5,
        color: '#5a6a5a',
        accentColor: '#ffaa00',
        unlocked: true
    },
    cannon: {
        requires: { quarry: 1 },
        name: 'Cannon Turret',
        weapon: 'shell',
        category: 'defense',
        size: 2,
        hp: 300,
        cost: { stone: 80, iron: 50 },
        buildTime: 15,
        damage: 40,
        range: 7,
        fireRate: 0.8,
        splashRadius: 2,
        projectileSpeed: 8,
        description: 'Slow but devastating. Splash damage.',
        powerDraw: 10,
        color: '#6a5a4a',
        accentColor: '#ff4400',
        unlocked: true
    },
    laser: {
        requires: { radar: 1, crystalExtractor: 1 },
        name: 'Laser Turret',
        category: 'defense',
        size: 1,
        hp: 120,
        cost: { iron: 100, crystal: 50 },
        buildTime: 20,
        damage: 45,
        range: 8,
        fireRate: 10,
        isBeam: true,
        description: 'Continuous beam weapon. 45 dmg/sec, pierces armor.',
        powerDraw: 20,
        color: '#4a5a6a',
        accentColor: '#00ccff',
        unlocked: false,
    },
    missile: {
        requires: { radar: 1, armory: 1 },
        name: 'Missile Launcher',
        weapon: 'missile',
        category: 'defense',
        size: 2,
        hp: 250,
        cost: { iron: 150, gold: 80 },
        buildTime: 25,
        damage: 80,
        range: 12,
        fireRate: 0.4,
        splashRadius: 3,
        projectileSpeed: 6,
        isHoming: true,
        description: 'Long-range homing missiles.',
        powerDraw: 15,
        color: '#5a5a6a',
        accentColor: '#ff6600',
        unlocked: false,
    },
    wall: {
        name: 'Wall',
        category: 'defense',
        size: 1,
        hp: 200,
        cost: { wood: 10 },
        buildTime: 3,
        description: 'Blocks enemy paths. Cheap and quick.',
        powerDraw: 0,
        color: '#6a6a6a',
        accentColor: '#888888',
        unlocked: true
    },
    reinforcedWall: {
        requires: { mine: 1 },
        name: 'Reinforced Wall',
        category: 'defense',
        size: 1,
        hp: 600,
        cost: { stone: 30, iron: 10 },
        buildTime: 6,
        description: 'Heavy-duty wall. Very durable.',
        powerDraw: 0,
        color: '#5a5a5a',
        accentColor: '#aabbcc',
        unlocked: true
    },
    gate: {
        name: 'Gate',
        category: 'defense',
        size: 1,
        hp: 320,
        cost: { wood: 25, stone: 10 },
        buildTime: 5,
        description: 'A wall your workers can walk through. Enemies must break it down.',
        powerDraw: 0,
        color: '#6b665c',
        accentColor: '#ffcc66',
        unlocked: true
    },
    armory: {
        requires: { workerBarracks: 1 },
        name: 'Armory',
        category: 'defense',
        size: 2,
        hp: 350,
        cost: { wood: 80, iron: 60 },
        buildTime: 15,
        soldiersProvided: 2,
        powerDraw: 5,
        description: 'Trains 2 soldiers per level. Soldiers guard, chase, and shoot enemies.',
        color: '#4c5844',
        accentColor: '#c84a3a',
        unlocked: true
    },
    lumberMill: {
        name: 'Lumber Mill',
        category: 'economy',
        size: 2,
        hp: 200,
        cost: { wood: 30 },
        buildTime: 10,
        gatherRate: 2,
        gatherResource: 'wood',
        gatherRadius: 5,
        description: 'Harvests wood from nearby trees.',
        powerDraw: 3,
        color: '#7a5a3a',
        accentColor: '#44aa44',
        unlocked: true
    },
    quarry: {
        name: 'Quarry',
        category: 'economy',
        size: 2,
        hp: 250,
        cost: { wood: 20, stone: 40 },
        buildTime: 12,
        gatherRate: 1.5,
        gatherResource: 'stone',
        gatherRadius: 5,
        description: 'Extracts stone from nearby deposits.',
        powerDraw: 5,
        color: '#8a7a6a',
        accentColor: '#aaaaaa',
        unlocked: true
    },
    mine: {
        requires: { quarry: 1 },
        name: 'Mine',
        category: 'economy',
        size: 2,
        hp: 250,
        cost: { wood: 50, stone: 30 },
        buildTime: 15,
        gatherRate: 1,
        gatherResource: 'iron',
        gatherRadius: 5,
        description: 'Mines iron and gold from ore deposits.',
        powerDraw: 8,
        color: '#5a4a3a',
        accentColor: '#cc8844',
        unlocked: true
    },
    crystalExtractor: {
        requires: { mine: 1, powerPlant: 1 },
        name: 'Crystal Extractor',
        category: 'economy',
        size: 2,
        hp: 200,
        cost: { iron: 80, gold: 40 },
        buildTime: 20,
        gatherRate: 0.5,
        gatherResource: 'crystal',
        gatherRadius: 5,
        description: 'Extracts rare crystals.',
        powerDraw: 12,
        color: '#5a4a6a',
        accentColor: '#cc44ff',
        unlocked: false,
    },
    powerPlant: {
        name: 'Power Plant',
        category: 'infrastructure',
        size: 2,
        hp: 300,
        cost: { stone: 40, copper: 20 },
        buildTime: 10,
        powerOutput: 50,
        description: 'Generates energy. Connect with wires.',
        powerDraw: 0,
        color: '#4a5a4a',
        accentColor: '#ffff00',
        unlocked: true
    },
    workerBarracks: {
        requires: { lumberMill: 1 },
        name: 'Worker Barracks',
        category: 'infrastructure',
        size: 2,
        hp: 250,
        cost: { wood: 100, stone: 50 },
        buildTime: 18,
        workersProvided: 2,
        description: 'Trains 2 additional workers.',
        powerDraw: 5,
        color: '#5a6a5a',
        accentColor: '#44cc88',
        unlocked: true
    },
    upgradeStation: {
        requires: { workerBarracks: 1, powerPlant: 1 },
        name: 'Worker Upgrade Station',
        category: 'infrastructure',
        size: 2,
        hp: 200,
        cost: { iron: 80, gold: 60 },
        buildTime: 20,
        description: 'Select it to buy global worker upgrades.',
        powerDraw: 10,
        color: '#5a5a7a',
        accentColor: '#8888ff',
        unlocked: false,
    },
    radar: {
        requires: { powerPlant: 1 },
        name: 'Radar Tower',
        category: 'infrastructure',
        size: 1,
        hp: 100,
        cost: { copper: 40, iron: 30 },
        buildTime: 10,
        visionRadius: 15,
        description: 'Reveals next wave composition and spawn warnings.',
        powerDraw: 8,
        color: '#5a6a7a',
        accentColor: '#44ccff',
        unlocked: true
    },
    repairStation: {
        requires: { mine: 1 },
        name: 'Repair Station',
        category: 'infrastructure',
        size: 2,
        hp: 200,
        cost: { copper: 30, stone: 30 },
        buildTime: 12,
        repairRate: 5,
        repairRadius: 6,
        description: 'Auto-repairs nearby buildings.',
        powerDraw: 8,
        color: '#5a7a5a',
        accentColor: '#44ff88',
        unlocked: true
    },
    teleporter: {
        requires: { upgradeStation: 1, crystalExtractor: 1 },
        name: 'Teleporter',
        category: 'infrastructure',
        size: 3,
        hp: 500,
        cost: { crystal: 200, darkMatter: 100 },
        buildTime: 40,
        description: 'Select it to relocate buildings across the map.',
        powerDraw: 30,
        color: '#3a3a5a',
        accentColor: '#cc44ff',
        unlocked: false,
    }
};

// Building categories for menu
export const BUILD_CATEGORIES = [
    { id: 'defense', name: 'Defense' },
    { id: 'economy', name: 'Economy' },
    { id: 'infrastructure', name: 'Infrastructure' }
];

// Upgrade definitions per level (multipliers). Tiers change the look:
// Mk I-III basic (gold trim), IV-VI hardened (cyan), VII-IX elite (violet).
export const UPGRADE_LEVELS = {
    1: { costMult: 1, statMult: 1, name: 'Mk I' },
    2: { costMult: 2, statMult: 1.5, name: 'Mk II' },
    3: { costMult: 3.5, statMult: 2.1, name: 'Mk III' },
    4: { costMult: 6, statMult: 2.7, name: 'Mk IV' },
    5: { costMult: 9, statMult: 3.3, name: 'Mk V' },
    6: { costMult: 14, statMult: 3.9, name: 'Mk VI' },
    7: { costMult: 21, statMult: 4.5, name: 'Mk VII' },
    8: { costMult: 30, statMult: 5.2, name: 'Mk VIII' },
    9: { costMult: 42, statMult: 6, name: 'Mk IX' }
};
export const MAX_UPGRADE_LEVEL = 9;
export const UPGRADE_TIER_COLORS = ['#ffd700', '#7de0ff', '#ff7dff'];

// Worker upgrade types
export const WORKER_UPGRADES = {
    speed: { name: 'Move Speed', levels: [1.0, 1.2, 1.5, 2.0], cost: [0, { iron: 40, gold: 20 }, { iron: 80, gold: 50 }, { iron: 150, gold: 100 }] },
    buildSpeed: { name: 'Build Speed', levels: [1.0, 1.25, 1.6, 2.0], cost: [0, { iron: 50, gold: 30 }, { iron: 100, gold: 60 }, { iron: 200, gold: 120 }] },
    carryCapacity: { name: 'Carry Capacity', levels: [1, 2, 3, 5], cost: [0, { iron: 30, gold: 15 }, { iron: 60, gold: 40 }, { iron: 120, gold: 80 }] }
};

// Enemy definitions
export const ENEMIES = {
    scout: {
        name: 'Scout',
        hp: 30,
        speed: 2.5,
        damage: 5,
        attackSpeed: 1,
        reward: { wood: 5, stone: 3 },
        color: '#cc4444',
        size: 0.6
    },
    infantry: {
        name: 'Infantry',
        hp: 80,
        speed: 1.5,
        damage: 10,
        attackSpeed: 0.8,
        reward: { wood: 8, stone: 5, iron: 3 },
        color: '#cc6644',
        size: 0.7
    },
    heavy: {
        name: 'Heavy',
        hp: 200,
        speed: 0.8,
        damage: 20,
        attackSpeed: 0.6,
        armor: 5,
        reward: { stone: 15, iron: 10 },
        color: '#884444',
        size: 0.9
    },
    demolisher: {
        name: 'Demolisher',
        hp: 150,
        speed: 0.9,
        damage: 50,
        attackSpeed: 0.5,
        buildingDamageMult: 3,
        reward: { iron: 15, gold: 5 },
        color: '#cc8800',
        size: 0.85
    },
    swarmDrone: {
        name: 'Swarm Drone',
        hp: 15,
        speed: 3.5,
        damage: 3,
        attackSpeed: 2,
        reward: { wood: 2 },
        color: '#cc4488',
        size: 0.4
    },
    tank: {
        name: 'Tank',
        hp: 500,
        speed: 0.5,
        damage: 40,
        attackSpeed: 0.4,
        armor: 10,
        splashDamage: true,
        reward: { iron: 25, gold: 15 },
        color: '#666644',
        size: 1.0
    },
    siegeMech: {
        name: 'Siege Mech',
        hp: 2000,
        speed: 0.6,
        damage: 80,
        attackSpeed: 0.3,
        armor: 15,
        isBoss: true,
        reward: { gold: 50, crystal: 20, darkMatter: 10 },
        color: '#aa2222',
        size: 1.5
    },
    voidWalker: {
        name: 'Void Walker',
        hp: 5000,
        speed: 1.0,
        damage: 120,
        attackSpeed: 0.5,
        armor: 20,
        isBoss: true,
        canTeleport: true,
        reward: { crystal: 50, darkMatter: 30 },
        color: '#6622cc',
        size: 1.8
    }
};

// Wire definitions
export const WIRE_CONFIG = {
    costPerSegment: { iron: 5 },
    maxPowerPerWire: 25,
    upgradedMaxPower: 50,
    superConductorMaxPower: 999,
    wireTypes: {
        copper: { name: 'Copper Wire', maxPower: 25, cost: { copper: 4 }, color: '#cc7733' },
        fiber: { name: 'Fiber Optic', maxPower: 50, cost: { copper: 8, gold: 5 }, color: '#33cccc' },
        superConductor: { name: 'Superconductor', maxPower: 999, cost: { gold: 20, crystal: 10 }, color: '#ffcc00' }
    }
};

// Campaign waves - 30 levels, 5 chapters
export const CAMPAIGN = {
    chapters: [
        { name: 'First Contact', levels: [1,2,3,4,5,6] },
        { name: 'Escalation', levels: [7,8,9,10,11,12] },
        { name: 'Siege Warfare', levels: [13,14,15,16,17,18] },
        { name: 'Dark Frontier', levels: [19,20,21,22,23,24] },
        { name: 'Final Stand', levels: [25,26,27,28,29,30] }
    ]
};

// Wave generation function parameters
export const WAVE_CONFIG = {
    baseEnemyCount: 5,
    enemyCountScale: 1.18,
    baseTimeBetweenWaves: 90,
    minTimeBetweenWaves: 40,
    timeBetweenWavesReduction: 1.5,
    spawnInterval: 1.5,
    earlyWaveSpawnInterval: 3.5,
    bossWaveInterval: 6,
    infiniteScaleRate: 1.05
};

// Teleporter config
export const TELEPORTER_CONFIG = {
    darkMatterPerCell: 2,
    minDistance: 20,
    animationDuration: 3000,
    cooldown: 60
};

// Map generation
export const MAP_CONFIG = {
    initialResourceRadius: 25,
    treeCount: 80,
    stoneCount: 40,
    copperCount: 22,
    ironCount: 25,
    goldCount: 12,
    crystalCount: 6,
    resourceClusterSize: 5,
    enemySpawnDistance: 30
};

// Game speed settings
export const GAME_SPEEDS = [0.5, 1, 2, 3];

// Weapons mountable on top of the Command Bunker (base Mk II+)
export const BASE_MOUNTS = {
    gun: {
        name: 'Autogun Mount', weapon: 'mg',
        cost: { iron: 120, copper: 80 },
        damage: 10, range: 6, fireRate: 5, projectileSpeed: 12,
        accentColor: '#ffaa00'
    },
    cannon: {
        name: 'Siege Cannon Mount', weapon: 'shell',
        cost: { stone: 150, iron: 150 },
        damage: 50, range: 8, fireRate: 0.7, splashRadius: 2.2, projectileSpeed: 8,
        accentColor: '#ff5522'
    }
};

// Soldiers
export const MAX_SOLDIERS = 20;
export const SOLDIER_CONFIG = {
    hp: 120,
    speed: 2.9,          // cells per second
    damage: 7,
    range: 3.4,          // firing range in cells
    fireRate: 1.4,       // shots per second
    engageRange: 7,      // cells: enemies this close get attacked
    leash: 11,           // max cells from guard post before returning
    retrainTime: 25      // seconds per replacement soldier
};
