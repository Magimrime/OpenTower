// ===== MAIN ENTRY POINT =====
import { Game } from './game.js';
import { UIManager } from './ui.js';
import { CAMPAIGN } from './config.js';
import { progress } from './progress.js';
import { audio } from './audio.js';
import { saveGame, loadSaveData, deleteSave } from './saveload.js';

const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);
game.ui = new UIManager(game);
window.game = game; // console access for debugging

// ===== GAME LOOP =====
// A thrown exception must never kill the RAF chain — that would freeze
// the game permanently. Log, skip the frame, keep running.
let lastTime = 0;
let loopErrors = 0;
function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    try {
        if (game.state === 'playing') {
            game.update(dt);
            game.render();
        } else if (game.state === 'paused' || game.state === 'victory' || game.state === 'gameover') {
            game.render(); // keep the world visible behind overlays
        }
        game.input.endFrame();
    } catch (err) {
        if (loopErrors++ < 10) console.error('frame error (recovered):', err);
    }
    requestAnimationFrame(gameLoop);
}

// ===== MENU HELPERS =====
function refreshMenuInfo() {
    const stars = progress.totalStars();
    document.getElementById('campaignProgress').textContent =
        stars > 0 ? `${progress.data.maxLevelCompleted}/30 done · ${stars}★` : '30 Levels · 5 Chapters';
    document.getElementById('infiniteBest').textContent =
        progress.data.bestInfiniteWave > 0
            ? `Best: wave ${progress.data.bestInfiniteWave}`
            : 'Endless Waves · High Score';

    const save = loadSaveData();
    const btn = document.getElementById('btnLoadGame');
    const info = document.getElementById('saveInfo');
    if (save) {
        btn.disabled = false;
        const when = new Date(save.savedAt);
        info.textContent = save.mode === 'campaign'
            ? `Level ${save.campaignLevel} · wave ${save.wave.currentWave}`
            : `Infinite · wave ${save.wave.currentWave}`;
    } else {
        btn.disabled = true;
        info.textContent = 'No saved game';
    }
}

function showMainMenu() {
    game.state = 'menu';
    game.hideAllOverlays();
    game.ui.setVisible(false);
    document.getElementById('mainMenu').classList.add('active');
    refreshMenuInfo();
}

// ===== MAIN MENU =====
document.getElementById('btnCampaign').addEventListener('click', () => {
    audio.play('click');
    showLevelSelect();
});
document.getElementById('btnInfinite').addEventListener('click', () => {
    audio.play('click');
    game.startGame('infinite');
});
document.getElementById('btnLoadGame').addEventListener('click', () => {
    const save = loadSaveData();
    if (save) {
        audio.play('click');
        game.loadFromSave(save);
    } else {
        game.toast('No saved game found', 'warning');
    }
});
document.getElementById('btnSettings').addEventListener('click', () => {
    audio.play('click');
    document.getElementById('settingsMenu').classList.add('active');
});

// ===== PAUSE MENU =====
document.getElementById('btnResume').addEventListener('click', () => { audio.play('click'); game.resume(); });
document.getElementById('btnSave').addEventListener('click', () => {
    if (saveGame(game)) game.toast('Game saved', 'success');
    else game.toast('Save failed — storage unavailable', 'error');
    audio.play('click');
});
document.getElementById('btnPauseSettings').addEventListener('click', () => {
    audio.play('click');
    document.getElementById('settingsMenu').classList.add('active');
});
document.getElementById('btnPauseHelp').addEventListener('click', () => {
    audio.play('click');
    document.getElementById('pauseMenu').classList.remove('active');
    // show help over the paused game; Esc/close returns to pause menu
    const help = document.getElementById('keybindsOverlay');
    help.classList.add('active');
    help.dataset.returnToPause = '1';
});
document.getElementById('btnQuit').addEventListener('click', () => {
    audio.play('click');
    saveGame(game); // never lose progress on quit
    showMainMenu();
});

// ===== VICTORY / GAME OVER =====
document.getElementById('btnNextLevel').addEventListener('click', () => {
    audio.play('click');
    game.startGame('campaign', Math.min(30, game.waveMgr.campaignLevel + 1));
});
document.getElementById('btnReplayLevel').addEventListener('click', () => {
    audio.play('click');
    game.startGame('campaign', game.waveMgr.campaignLevel);
});
document.getElementById('btnVictoryMenu').addEventListener('click', () => { audio.play('click'); showMainMenu(); });
document.getElementById('btnRetry').addEventListener('click', () => {
    audio.play('click');
    game.startGame(game.gameMode, game.waveMgr.campaignLevel);
});
document.getElementById('btnMainMenu').addEventListener('click', () => { audio.play('click'); showMainMenu(); });

// ===== LEVEL SELECT =====
function showLevelSelect() {
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('levelSelect').classList.add('active');

    const tabsEl = document.getElementById('chapterTabs');
    const gridEl = document.getElementById('levelGrid');
    tabsEl.innerHTML = '';

    // open the chapter containing the next uncompleted level
    const nextLevel = Math.min(30, progress.data.maxLevelCompleted + 1);
    let activeChapter = CAMPAIGN.chapters.findIndex(ch => ch.levels.includes(nextLevel));
    if (activeChapter < 0) activeChapter = 0;

    CAMPAIGN.chapters.forEach((ch, ci) => {
        const tab = document.createElement('button');
        tab.className = `chapter-tab${ci === activeChapter ? ' active' : ''}`;
        tab.textContent = ch.name;
        tab.addEventListener('click', () => {
            audio.play('click');
            document.querySelectorAll('.chapter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderLevels(ch.levels);
        });
        tabsEl.appendChild(tab);
    });

    renderLevels(CAMPAIGN.chapters[activeChapter].levels);

    function renderLevels(levels) {
        gridEl.innerHTML = '';
        for (const lvl of levels) {
            const unlocked = progress.isLevelUnlocked(lvl);
            const stars = progress.getStars(lvl);
            const btn = document.createElement('button');
            btn.className = 'level-btn' + (unlocked ? '' : ' locked');
            const starsHtml = [1, 2, 3].map(i =>
                `<span class="${i <= stars ? '' : 'off'}">&#9733;</span>`).join('');
            btn.innerHTML = `<span>${lvl}</span><span class="stars">${starsHtml}</span>` +
                (unlocked ? '' : '<span class="lock-ico"><i class="lock-icon"></i></span>');
            if (unlocked) {
                btn.addEventListener('click', () => {
                    audio.play('click');
                    document.getElementById('levelSelect').classList.remove('active');
                    game.startGame('campaign', lvl);
                });
            }
            gridEl.appendChild(btn);
        }
    }
}

document.getElementById('btnBackFromLevels').addEventListener('click', () => {
    audio.play('click');
    document.getElementById('levelSelect').classList.remove('active');
    document.getElementById('mainMenu').classList.add('active');
});

// ===== HELP OVERLAY =====
document.getElementById('btnCloseKeybinds').addEventListener('click', () => {
    const help = document.getElementById('keybindsOverlay');
    help.classList.remove('active');
    if (help.dataset.returnToPause) {
        delete help.dataset.returnToPause;
        if (game.state === 'paused') document.getElementById('pauseMenu').classList.add('active');
    }
});

// ===== GLOBAL KEYS (menus & paused states) =====
window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && game.state !== 'playing') {
        document.getElementById('keybindsOverlay').classList.toggle('active');
    }
    if (e.code === 'Escape') {
        const help = document.getElementById('keybindsOverlay');
        const settings = document.getElementById('settingsMenu');
        if (settings.classList.contains('active')) {
            settings.classList.remove('active');
            return;
        }
        if (help.classList.contains('active')) {
            help.classList.remove('active');
            if (help.dataset.returnToPause) {
                delete help.dataset.returnToPause;
                if (game.state === 'paused') document.getElementById('pauseMenu').classList.add('active');
            }
            return;
        }
        if (game.state === 'paused') {
            game.resume();
            // eat the keypress so the in-game handler doesn't instantly re-pause
            game.input.keyJustPressed['Escape'] = false;
        }
    }
});

// ===== START =====
refreshMenuInfo();
requestAnimationFrame(gameLoop);
