/* =========================================================
   GLASS SHUFFLE — BETTING LOGIC (frontend / localStorage demo)
   ========================================================= */

const STORAGE = {
    balance: 'glassShuffleBalance',
    net: 'glassShuffleNetProfit',
    history: 'glassShuffleHistory',
    stats: 'glassShuffleStats'
};

const gameState = {
    phase: 'idle',          // idle | countdown | reveal | shuffle | guess | result
    tokenPosition: 1,
    balance: parseFloat(localStorage.getItem(STORAGE.balance) ?? '1000'),
    netProfit: parseFloat(localStorage.getItem(STORAGE.net) ?? '0'),
    currentBet: 0,
    isRunning: false
};

const stats = JSON.parse(localStorage.getItem(STORAGE.stats) || JSON.stringify({
    games: 0, wins: 0, losses: 0,
    wagered: 0, won: 0, lost: 0
}));

let history = JSON.parse(localStorage.getItem(STORAGE.history) || '[]');

const els = {
    // HUD
    balance: document.getElementById('balance-display'),
    bet: document.getElementById('bet-display'),
    lastResult: document.getElementById('last-result-display'),
    netProfit: document.getElementById('net-profit-display'),
    navBalance: document.getElementById('nav-balance-value'),

    status: document.getElementById('status-message'),

    vaults: [
        document.getElementById('vault-0'),
        document.getElementById('vault-1'),
        document.getElementById('vault-2')
    ],

    token: document.getElementById('token'),

    betInput: document.getElementById('bet-input'),
    quickBtns: document.querySelectorAll('.quick-btn'),
    startBtn: document.getElementById('start-btn'),

    resultPanel: document.getElementById('result-panel'),
    resultBet: document.getElementById('result-bet'),
    resultOutcome: document.getElementById('result-outcome'),
    resultPayout: document.getElementById('result-payout'),
    resultProfit: document.getElementById('result-profit'),

    // Navbar
    navTabs: document.querySelectorAll('.nav-tab'),
    pages: document.querySelectorAll('.page'),

    // Profile
    pUsername: document.getElementById('p-username'),
    pBalance:  document.getElementById('p-balance'),
    pGames:    document.getElementById('p-games'),
    pWins:     document.getElementById('p-wins'),
    pLosses:   document.getElementById('p-losses'),
    pWagered:  document.getElementById('p-wagered'),
    pWon:      document.getElementById('p-won'),
    pLost:     document.getElementById('p-lost'),
    pNet:      document.getElementById('p-net'),
    resetProfileBtn: document.getElementById('reset-profile-btn'),

    // History
    historyBody: document.getElementById('history-body'),
    clearHistoryBtn: document.getElementById('clear-history-btn')
};

let vaultSlots = [0, 1, 2];
let pendingTimeout = null;
let audioCtx = null;

/* ---------- AUDIO ---------- */
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playSound(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const presets = {
        tick:    { type: 'sine',     f1: 800, f2: 800, dur: 0.10, vol: 0.08 },
        reveal:  { type: 'square',   f1: 400, f2: 800, dur: 0.30, vol: 0.05 },
        win:     { type: 'triangle', f1: 600, f2: 900, dur: 0.30, vol: 0.10 },
        lose:    { type: 'sawtooth', f1: 300, f2: 100, dur: 0.40, vol: 0.10 },
        shuffle: { type: 'sine',     f1: 200, f2: 200, dur: 0.05, vol: 0.02 }
    };
    const p = presets[type]; if (!p) return;
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f1, now);
    if (p.f1 !== p.f2) osc.frequency.linearRampToValueAtTime(p.f2, now + p.dur);
    gain.gain.setValueAtTime(p.vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);
    osc.start(now); osc.stop(now + p.dur);
}

/* ---------- POSITIONING ---------- */
function getSlotX(slotIndex) {
    const spacing = 240;
    return (slotIndex - 1) * spacing;
}

function updateVaultPositions(instant = false) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    vaultSlots.forEach((vaultIdx, slotIdx) => {
        const el = els.vaults[vaultIdx];
        const x = getSlotX(slotIdx);
        const lifted = el.classList.contains('lifted');
        const y = lifted ? -75 : 0;
        const scale = lifted ? 1.06 : 1;
        el.style.transition = (instant || reduced) ? 'none' : 'transform var(--speed, 0.25s) ease-in-out';
        el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    });
    const tokenX = getSlotX(gameState.tokenPosition);
    els.token.style.transition = (instant || reduced) ? 'none' : 'transform 0.15s ease';
    els.token.style.transform = `translateX(${tokenX}px)`;
}

/* ---------- DELAYS ---------- */
function delay(ms) { return new Promise(r => { pendingTimeout = setTimeout(r, ms); }); }
async function pauseSafeDelay(ms) {
    let remaining = ms;
    const step = 20;
    while (remaining > 0) {
        if (!gameState.isRunning) throw new Error('Game halted');
        remaining -= step;
        await delay(step);
    }
}

/* ---------- PERSISTENCE ---------- */
function saveState() {
    localStorage.setItem(STORAGE.balance, String(gameState.balance));
    localStorage.setItem(STORAGE.net, String(gameState.netProfit));
    localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
    localStorage.setItem(STORAGE.history, JSON.stringify(history.slice(0, 100)));
}

/* ---------- UI ---------- */
function fmt(n) { return `₹${Number(n).toLocaleString('en-IN')}`; }

function renderUI() {
    els.balance.innerText    = fmt(gameState.balance);
    els.bet.innerText        = fmt(gameState.currentBet);
    els.netProfit.innerText  = (gameState.netProfit >= 0 ? '+' : '') + fmt(gameState.netProfit);
    els.netProfit.classList.toggle('win',  gameState.netProfit > 0);
    els.netProfit.classList.toggle('lose', gameState.netProfit < 0);
    els.navBalance.innerText = Number(gameState.balance).toLocaleString('en-IN');
    renderProfile();
}

function renderProfile() {
    els.pUsername.innerText = 'PLAYER';
    els.pBalance.innerText  = fmt(gameState.balance);
    els.pGames.innerText    = stats.games;
    els.pWins.innerText     = stats.wins;
    els.pLosses.innerText   = stats.losses;
    els.pWagered.innerText  = fmt(stats.wagered);
    els.pWon.innerText      = fmt(stats.won);
    els.pLost.innerText     = fmt(stats.lost);
    els.pNet.innerText      = (gameState.netProfit >= 0 ? '+' : '') + fmt(gameState.netProfit);
}

function renderHistory() {
    if (!history.length) {
        els.historyBody.innerHTML = `<tr><td colspan="7" class="empty">No rounds yet.</td></tr>`;
        return;
    }
    els.historyBody.innerHTML = history.map(h => {
        const d = new Date(h.date);
        const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
                        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const cls = h.won ? 'win' : 'lose';
        const resultLabel = h.won ? 'WIN' : 'LOSS';
        const payoutStr = h.won ? fmt(h.payout) : fmt(0);
        const profitStr = (h.profit >= 0 ? '+' : '') + fmt(h.profit);
        return `<tr>
            <td>#${String(h.roundId).slice(-5)}</td>
            <td>${dateStr}</td>
            <td>${fmt(h.bet)}</td>
            <td>V${h.chosen + 1}</td>
            <td class="${cls}">${resultLabel}</td>
            <td>${payoutStr}</td>
            <td class="${cls}">${profitStr}</td>
        </tr>`;
    }).join('');
}

/* ---------- VALIDATION ---------- */
function readBetInput() {
    const v = parseInt(els.betInput.value, 10);
    if (!Number.isFinite(v) || v < 10) return { ok: false, error: 'Minimum bet is ₹10' };
    if (v > 10000)                return { ok: false, error: 'Maximum bet is ₹10,000' };
    if (v > gameState.balance)    return { ok: false, error: 'Insufficient balance' };
    return { ok: true, amount: v };
}

/* ---------- NAVBAR ---------- */
els.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        els.navTabs.forEach(t => t.classList.remove('active'));
        els.pages.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`page-${tab.dataset.page}`).classList.add('active');
        if (tab.dataset.page === 'history') renderHistory();
        if (tab.dataset.page === 'profile') renderProfile();
    });
});

/* ---------- QUICK BET BUTTONS ---------- */
els.quickBtns.forEach(b => {
    b.addEventListener('click', () => {
        els.betInput.value = b.dataset.amt;
    });
});

/* ---------- PROFILE / HISTORY ACTIONS ---------- */
els.resetProfileBtn.addEventListener('click', () => {
    if (!confirm('Reset your account? Balance goes back to ₹1,000 and history is cleared.')) return;
    gameState.balance = 1000;
    gameState.netProfit = 0;
    stats.games = stats.wins = stats.losses = 0;
    stats.wagered = stats.won = stats.lost = 0;
    history = [];
    saveState();
    renderUI();
    renderHistory();
    els.lastResult.innerText = '—';
    els.lastResult.className = 'value';
});

els.clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('Clear all betting history?')) return;
    history = [];
    saveState();
    renderHistory();
});

/* ---------- GAME FLOW ---------- */
async function startRound() {
    const check = readBetInput();
    if (!check.ok) {
        els.status.innerText = check.error.toUpperCase();
        return;
    }

    initAudio();
    gameState.currentBet = check.amount;
    gameState.balance -= check.amount;
    gameState.isRunning = true;

    // Stats: wagered & games counted when round starts
    stats.games += 1;
    stats.wagered += check.amount;

    saveState();
    renderUI();

    els.startBtn.disabled = true;
    els.resultPanel.classList.add('hidden');
    els.status.innerText = 'SYSTEM ONLINE';

    // Reset vaults
    els.vaults.forEach(v => {
        v.classList.remove('correct', 'wrong', 'lifted');
        v.style.zIndex = 1;
        v.disabled = true;
    });

    gameState.tokenPosition = Math.floor(Math.random() * 3);
    vaultSlots = [0, 1, 2];
    updateVaultPositions(true);

    try {
        await runCountdown();
        if (!gameState.isRunning) return;
        await runReveal();
        if (!gameState.isRunning) return;
        await runShuffle();
        if (!gameState.isRunning) return;
        gameState.phase = 'guess';
        els.status.innerText = 'CHOOSE THE VAULT!';
        els.vaults.forEach(v => v.disabled = false);
    } catch (e) {
        if (e.message !== 'Game halted') console.error(e);
    }
}

async function runCountdown() {
    gameState.phase = 'countdown';
    for (let i = 3; i > 0; i--) {
        els.status.innerText = `SYNCING IN ${i}...`;
        playSound('tick');
        await pauseSafeDelay(550);
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
    await pauseSafeDelay(950);

    vaultEl.classList.remove('lifted');
    els.token.classList.add('hidden');
    updateVaultPositions();
    await pauseSafeDelay(280);
}

async function runShuffle() {
    gameState.phase = 'shuffle';
    els.status.innerText = 'SHUFFLING...';

    const numSwaps = 18;
    const speed = 0.18;
    document.documentElement.style.setProperty('--speed', `${speed}s`);

    for (let i = 0; i < numSwaps; i++) {
        await pauseSafeDelay(20);

        let a = Math.floor(Math.random() * 3);
        let b = Math.floor(Math.random() * 3);
        while (a === b) b = Math.floor(Math.random() * 3);

        playSound('shuffle');

        [vaultSlots[a], vaultSlots[b]] = [vaultSlots[b], vaultSlots[a]];

        if (gameState.tokenPosition === a) gameState.tokenPosition = b;
        else if (gameState.tokenPosition === b) gameState.tokenPosition = a;

        els.vaults[vaultSlots[a]].style.zIndex = 5;
        els.vaults[vaultSlots[b]].style.zIndex = 4;

        updateVaultPositions();
        await pauseSafeDelay(speed * 1000);
    }
}

async function handleVaultChoice(vaultIndex) {
    if (gameState.phase !== 'guess') return;
    gameState.phase = 'result';

    els.vaults.forEach(v => { v.blur(); v.disabled = true; });

    const chosenSlot = vaultSlots.indexOf(vaultIndex);
    const won = chosenSlot === gameState.tokenPosition;

    // Reveal token under the correct vault
    updateVaultPositions(true);
    els.token.classList.remove('hidden');

    const chosenEl = els.vaults[vaultIndex];
    chosenEl.classList.add('lifted');

    let payout = 0;
    let profit = -gameState.currentBet;

    if (won) {
        // User bet is already deducted. Winning returns 2x total, so credit 2x.
        payout = gameState.currentBet * 2;
        profit = gameState.currentBet;               // net win = +bet
        gameState.balance += payout;
        gameState.netProfit += profit;
        stats.wins += 1;
        stats.won += payout;

        playSound('win');
        els.status.innerText = 'YOU WIN!';
        chosenEl.classList.add('correct');
        els.lastResult.innerText = `+${fmt(profit)}`;
        els.lastResult.className = 'value win';
    } else {
        gameState.netProfit -= gameState.currentBet;
        stats.losses += 1;
        stats.lost += gameState.currentBet;

        playSound('lose');
        els.status.innerText = 'YOU LOSE!';
        chosenEl.classList.add('wrong');

        const correctEl = els.vaults[vaultSlots[gameState.tokenPosition]];
        correctEl.classList.add('lifted', 'correct');

        els.lastResult.innerText = `-${fmt(gameState.currentBet)}`;
        els.lastResult.className = 'value lose';
    }

    // Result panel
    els.resultBet.innerText = fmt(gameState.currentBet);
    els.resultOutcome.innerText = won ? 'WIN' : 'LOSS';
    els.resultOutcome.className = won ? 'win' : 'lose';
    els.resultPayout.innerText = fmt(payout);
    els.resultProfit.innerText = (profit >= 0 ? '+' : '') + fmt(profit);
    els.resultProfit.className = profit >= 0 ? 'win' : 'lose';
    els.resultPanel.classList.remove('hidden');

    // Save history record
    history.unshift({
        roundId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: new Date().toISOString(),
        bet: gameState.currentBet,
        chosen: vaultIndex,
        correct: vaultSlots[gameState.tokenPosition],
        won,
        payout,
        profit
    });
    history = history.slice(0, 100);

    saveState();
    renderUI();
    renderHistory();

    await pauseSafeDelay(2200);

    // Reset for next round
    els.vaults.forEach(v => {
        v.classList.remove('correct', 'wrong', 'lifted');
        v.style.zIndex = 1;
        v.disabled = true;
    });
    els.token.classList.add('hidden');
    updateVaultPositions(true);

    gameState.phase = 'idle';
    gameState.isRunning = false;
    gameState.currentBet = 0;
    els.startBtn.disabled = false;
    els.status.innerText = 'PLACE YOUR BET TO PLAY AGAIN';
    renderUI();
}

/* ---------- EVENTS ---------- */
els.vaults.forEach((v, idx) => {
    v.addEventListener('click', () => handleVaultChoice(idx));
});

els.startBtn.addEventListener('click', () => {
    if (gameState.phase !== 'idle') return;
    startRound();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (gameState.phase === 'idle' && !els.startBtn.disabled) startRound();
    }
    if (gameState.phase === 'guess') {
        if (e.key === '1') handleVaultChoice(vaultSlots[0]);
        if (e.key === '2') handleVaultChoice(vaultSlots[1]);
        if (e.key === '3') handleVaultChoice(vaultSlots[2]);
    }
});

/* ---------- BOOT ---------- */
renderUI();
renderHistory();
updateVaultPositions(true);