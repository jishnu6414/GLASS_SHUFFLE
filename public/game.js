// Game State
const gameState = {
    phase: "ready", 
    tokenPosition: 1, 
    score: 0,
    level: 1,
    lives: 3,
    combo: 0,
    bestScore: localStorage.getItem('cyberMonteBest') || 0,
    soundEnabled: localStorage.getItem('cyberMonteSound') !== 'false',
    isRunning: false,
    isPaused: false
};

// DOM Elements
const els = {
    score: document.getElementById('score-display'),
    level: document.getElementById('level-display'),
    lives: document.getElementById('lives-display'),
    combo: document.getElementById('combo-display'),
    bestScore: document.getElementById('best-score-display'),
    status: document.getElementById('status-message'),
    vaults: [
        document.getElementById('vault-0'),
        document.getElementById('vault-1'),
        document.getElementById('vault-2')
    ],
    token: document.getElementById('token'),
    btns: {
        start: document.getElementById('start-btn'),
        pause: document.getElementById('pause-btn'),
        restart: document.getElementById('restart-btn'),
        mute: document.getElementById('mute-btn'),
        playAgain: document.getElementById('play-again-btn')
    },
    gameOver: document.getElementById('game-over-screen'),
    gameOverTitle: document.getElementById('game-over-title'),
    finalScore: document.getElementById('final-score'),
    bestScoreOverlay: document.getElementById('best-score-overlay'),
    serverMsg: document.getElementById('server-status')
};

let vaultSlots = [0, 1, 2]; 
let pendingTimeout = null;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
    if (!gameState.soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'tick') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'reveal') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'win') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(900, now + 0.1);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'lose') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(100, now + 0.4);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'shuffle') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.02, now); gain.gain.linearRampToValueAtTime(0, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    }
}

function getSlotX(slotIndex) {
    return (slotIndex - 1) * 140; // Spacing adjusted for wider vaults
}

function updateVaultPositions(instant = false) {
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    vaultSlots.forEach((vaultIdx, slotIdx) => {
        const el = els.vaults[vaultIdx];
        const x = getSlotX(slotIdx);
        el.style.transition = (instant || isReduced) ? 'none' : 'transform var(--speed) ease-in-out';
        const y = el.classList.contains('lifted') ? '-75px' : '0px';
        const scale = el.classList.contains('lifted') ? '1.06' : '1';
        el.style.transform = `translate(${x}px, ${y}) scale(${scale})`;
    });
    
    const tokenX = getSlotX(gameState.tokenPosition);
    els.token.style.transition = (instant || isReduced) ? 'none' : 'transform 0.1s';
    els.token.style.transform = `translateX(${tokenX}px)`;
}

function delay(ms) {
    return new Promise(resolve => { pendingTimeout = setTimeout(resolve, ms); });
}

async function pauseSafeDelay(ms) {
    let remaining = ms;
    const step = 20; 
    while (remaining > 0) {
        if (!gameState.isPaused) remaining -= step;
        if (!gameState.isRunning) throw new Error("Game halted");
        await delay(step);
    }
}

els.btns.mute.innerText = gameState.soundEnabled ? '🔊 SOUND: ON' : '🔇 SOUND: OFF';
els.btns.mute.addEventListener('click', () => {
    initAudio();
    gameState.soundEnabled = !gameState.soundEnabled;
    localStorage.setItem('cyberMonteSound', gameState.soundEnabled);
    els.btns.mute.innerText = gameState.soundEnabled ? '🔊 SOUND: ON' : '🔇 SOUND: OFF';
});

els.btns.start.addEventListener('click', startGame);
els.btns.restart.addEventListener('click', resetGame);
els.btns.playAgain.addEventListener('click', resetGame);
els.btns.pause.addEventListener('click', togglePause);

els.vaults.forEach((v, idx) => {
    v.addEventListener('click', () => handleVaultChoice(idx));
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !els.btns.pause.disabled) {
        e.preventDefault();
        togglePause();
    }
    if (gameState.phase === 'guess' && !gameState.isPaused) {
        if (e.key === '1') handleVaultChoice(vaultSlots[0]);
        if (e.key === '2') handleVaultChoice(vaultSlots[1]);
        if (e.key === '3') handleVaultChoice(vaultSlots[2]);
    }
});

function togglePause() {
    if (gameState.phase === 'gameOver' || gameState.phase === 'ready') return;
    gameState.isPaused = !gameState.isPaused;
    els.btns.pause.innerText = gameState.isPaused ? 'RESUME (SPACE)' : 'PAUSE (SPACE)';
    els.status.innerText = gameState.isPaused ? 'SYSTEM PAUSED' : 'RESUMING...';
}

function resetGame() {
    clearTimeout(pendingTimeout);
    gameState.isRunning = false;
    gameState.isPaused = false;
    gameState.score = 0;
    gameState.level = 1;
    gameState.lives = 3;
    gameState.combo = 0;
    gameState.phase = 'ready';
    els.gameOver.classList.add('hidden');
    renderUI();
    startGame();
}

async function startGame() {
    initAudio();
    gameState.isRunning = true;
    els.btns.start.disabled = true;
    els.btns.pause.disabled = false;
    els.btns.restart.disabled = false;
    els.status.innerText = "INITIALIZING SEQUENCE...";
    renderUI();
    
    try { await startRound(); } catch (e) { if (e.message !== "Game halted") console.error(e); }
}

async function startRound() {
    gameState.phase = 'countdown';
    els.token.classList.add('hidden');
    els.vaults.forEach(v => {
        v.classList.remove('correct', 'wrong', 'lifted');
        v.style.zIndex = 1;
        v.disabled = true; 
    });

    gameState.tokenPosition = Math.floor(Math.random() * 3);
    vaultSlots = [0, 1, 2];
    updateVaultPositions(true);

    await runCountdown();
    if(!gameState.isRunning) return;
    
    await runReveal();
    if(!gameState.isRunning) return;

    await createAndRunShufflePlan();
}

async function runCountdown() {
    for (let i = 3; i > 0; i--) {
        els.status.innerText = `SYNCING IN ${i}...`;
        playSound('tick');
        await pauseSafeDelay(600);
    }
    els.status.innerText = 'WATCH CLOSELY!';
}

async function runReveal() {
    gameState.phase = 'reveal';
    playSound('reveal');
    const vaultEl = els.vaults[vaultSlots[gameState.tokenPosition]];
    vaultEl.classList.add('lifted');
    updateVaultPositions(); 
    
    await pauseSafeDelay(400);
    els.token.classList.remove('hidden');
    await pauseSafeDelay(1000);
    
    vaultEl.classList.remove('lifted');
    els.token.classList.add('hidden');
    updateVaultPositions();
    await pauseSafeDelay(300);
}

function getShuffleSpeed() {
    return Math.max(0.08, 0.25 - (gameState.level * 0.02));
}

async function createAndRunShufflePlan() {
    gameState.phase = 'shuffle';
    els.status.innerText = 'SHUFFLING (SHUFFLING)...';
    
    const numSwaps = Math.min(15 + gameState.level * 5, 45);
    const speed = getShuffleSpeed();
    document.documentElement.style.setProperty('--speed', `${speed}s`);

    for (let i = 0; i < numSwaps; i++) {
        await pauseSafeDelay(20); 
        
        const isFakeOut = Math.random() < 0.3; 
        
        let slotA = Math.floor(Math.random() * 3);
        let slotB = Math.floor(Math.random() * 3);
        while (slotA === slotB) slotB = Math.floor(Math.random() * 3);

        playSound('shuffle');

        if (isFakeOut) {
            const vaultA = els.vaults[vaultSlots[slotA]];
            const vaultB = els.vaults[vaultSlots[slotB]];
            vaultA.style.zIndex = 5; vaultB.style.zIndex = 4;
            
            const midX_A = getSlotX(slotA) + (getSlotX(slotB) - getSlotX(slotA)) * 0.5;
            const midX_B = getSlotX(slotB) + (getSlotX(slotA) - getSlotX(slotB)) * 0.5;
            
            vaultA.style.transform = `translateX(${midX_A}px) scale(0.9)`;
            vaultB.style.transform = `translateX(${midX_B}px) scale(1.1)`;
            
            await pauseSafeDelay(speed * 500);
            updateVaultPositions(); 
            await pauseSafeDelay(speed * 500);
        } else {
            const vaultA = els.vaults[vaultSlots[slotA]];
            const vaultB = els.vaults[vaultSlots[slotB]];
            vaultA.style.zIndex = 5; vaultB.style.zIndex = 4;

            const temp = vaultSlots[slotA];
            vaultSlots[slotA] = vaultSlots[slotB];
            vaultSlots[slotB] = temp;

            if (gameState.tokenPosition === slotA) gameState.tokenPosition = slotB;
            else if (gameState.tokenPosition === slotB) gameState.tokenPosition = slotA;

            updateVaultPositions();
            await pauseSafeDelay(speed * 1000);
        }
    }

    gameState.phase = 'guess';
    els.status.innerText = 'CHOOSE THE GLASS!';
    els.vaults.forEach(v => v.disabled = false);
}

async function handleVaultChoice(vaultIndex) {
    if (gameState.phase !== 'guess' || gameState.isPaused) return;
    gameState.phase = 'result';
    
    els.vaults.forEach(v => {
        v.blur();
        v.disabled = true;
    });

    const chosenSlot = vaultSlots.indexOf(vaultIndex);
    
    // Rigged 45% win / 55% loss logic
    const forceWin = Math.random() < 0.45;

    if (forceWin) {
        gameState.tokenPosition = chosenSlot;
    } else {
        let availableSlots = [0, 1, 2].filter(s => s !== chosenSlot);
        gameState.tokenPosition = availableSlots[Math.floor(Math.random() * availableSlots.length)];
    }

    updateVaultPositions(true);
    els.token.classList.remove('hidden'); 

    const chosenVaultEl = els.vaults[vaultIndex];
    chosenVaultEl.classList.add('lifted');
    updateVaultPositions();

    if (forceWin) {
        playSound('win');
        els.status.innerText = 'YOU WIN!'; // Explicit win status text
        chosenVaultEl.classList.add('correct');
        gameState.score += (100 * gameState.level) + (gameState.combo * 50);
        gameState.combo++;
        if (gameState.score > gameState.bestScore) {
            gameState.bestScore = gameState.score;
            localStorage.setItem('cyberMonteBest', gameState.bestScore);
        }
        if (gameState.combo % 3 === 0) gameState.level++; 
    } else {
        playSound('lose');
        els.status.innerText = 'YOU LOSE!'; // Explicit lose status text
        chosenVaultEl.classList.add('wrong');
        
        const correctVaultEl = els.vaults[vaultSlots[gameState.tokenPosition]];
        correctVaultEl.classList.add('lifted', 'correct');
        updateVaultPositions();

        gameState.lives--;
        gameState.combo = 0;
    }

    renderUI();
    await pauseSafeDelay(2500);
    
    if (gameState.lives > 0) {
        startRound();
    } else {
        triggerGameOver();
    }
}

function renderUI() {
    els.score.innerText = gameState.score;
    els.level.innerText = gameState.level;
    els.lives.innerText = gameState.lives;
    els.combo.innerText = gameState.combo;
    els.bestScore.innerText = gameState.bestScore;
}

async function triggerGameOver() {
    gameState.phase = 'gameOver';
    gameState.isRunning = false;
    els.btns.pause.disabled = true;
    
    els.gameOverTitle.innerText = "SYSTEM FAILURE";
    els.finalScore.innerText = gameState.score;
    els.bestScoreOverlay.innerText = gameState.bestScore;
    els.gameOver.classList.remove('hidden');
    els.serverMsg.innerText = 'Transmitting score to mainframe...';

    try {
        const res = await fetch('/api/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: gameState.score, level: gameState.level })
        });
        if (res.ok) els.serverMsg.innerText = 'Score successfully logged on server.';
        else els.serverMsg.innerText = 'Server rejected transmission.';
    } catch (err) {
        els.serverMsg.innerText = 'Network error. Score saved locally only.';
    }
}

renderUI();
updateVaultPositions(true);