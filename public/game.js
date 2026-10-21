/* =========================================================
   GLASS SHUFFLE — BETTING LOGIC (frontend / localStorage demo)
   ========================================================= */

const Core = (typeof window !== 'undefined' && window.GlassShuffleCore)
    || (typeof require === 'function' ? require('./game-core') : null);

if (!Core) throw new Error('GLASS SHUFFLE core helpers are unavailable.');

const STORAGE = Core.STORAGE;
const browserStorage = (() => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
})();

const persisted = Core.loadPersistedState(browserStorage);

const gameState = {
    phase: 'idle',          // idle | countdown | reveal | shuffle | guess | result
    tokenPosition: 1,
    balance: persisted.balance,
    netProfit: persisted.netProfit,
    currentBet: 0,
    isRunning: false,
    soundMuted: persisted.soundMuted,
    roundToken: 0
};

const stats = persisted.stats;
let history = persisted.history;

const els = {
    // HUD
    balance: document.getElementById('balance-display'),
    bet: document.getElementById('bet-display'),
    lastResult: document.getElementById('last-result-display'),
    netProfit: document.getElementById('net-profit-display'),
    navBalance: document.getElementById('nav-balance-value'),

    status: document.getElementById('status-message'),
    gameContainer: document.getElementById('game-container'),

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
    topupBtn: document.getElementById('topup-btn'),
    soundToggle: document.getElementById('sound-toggle'),
    soundIcon: document.querySelector('#sound-toggle .sound-icon'),

    // Top-up modal
    topupModal: document.getElementById('topup-modal'),
    topupClose: document.getElementById('topup-close'),
    topupDismiss: document.getElementById('topup-dismiss'),
    topupOptions: document.querySelectorAll('.topup-option[data-amount]'),

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
let audioCtx = null;
let roundSerial = 0;
let topupRestoreFocus = null;
const pendingTimers = new Map();

const fmt = Core.formatCurrency;
const fmtSigned = Core.formatSignedCurrency;

/* ---------- STORAGE ---------- */
function safeStorageSet(key, value) {
    if (!browserStorage || typeof browserStorage.setItem !== 'function') return;

    try {
        browserStorage.setItem(key, value);
    } catch {
        // Private browsing, disabled storage, and quota failures should not stop play.
    }
}

function saveState() {
    safeStorageSet(STORAGE.balance, String(gameState.balance));
    safeStorageSet(STORAGE.net, String(gameState.netProfit));
    safeStorageSet(STORAGE.stats, JSON.stringify(stats));
    safeStorageSet(STORAGE.history, JSON.stringify(history.slice(0, Core.MAX_HISTORY)));
    safeStorageSet(STORAGE.soundMuted, String(gameState.soundMuted));
}

/* ---------- AUDIO ---------- */
function initAudio() {
    if (gameState.soundMuted) return false;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (typeof AudioContextCtor !== 'function') return false;

    try {
        if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextCtor();
        if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
            const resumeResult = audioCtx.resume();
            if (resumeResult && typeof resumeResult.catch === 'function') resumeResult.catch(() => {});
        }
        return true;
    } catch {
        audioCtx = null;
        return false;
    }
}

function playSound(type) {
    if (gameState.soundMuted || !audioCtx || audioCtx.state === 'closed') return;

    const presets = {
        tick:    { type: 'sine',     f1: 800, f2: 800, dur: 0.10, vol: 0.08 },
        reveal:  { type: 'square',   f1: 400, f2: 800, dur: 0.30, vol: 0.05 },
        win:     { type: 'triangle', f1: 600, f2: 900, dur: 0.30, vol: 0.10 },
        lose:    { type: 'sawtooth', f1: 300, f2: 100, dur: 0.40, vol: 0.10 },
        shuffle: { type: 'sine',     f1: 200, f2: 200, dur: 0.05, vol: 0.02 }
    };
    const preset = presets[type];
    if (!preset) return;

    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = preset.type;
        osc.frequency.setValueAtTime(preset.f1, now);
        if (preset.f1 !== preset.f2) {
            osc.frequency.linearRampToValueAtTime(preset.f2, now + preset.dur);
        }
        gain.gain.setValueAtTime(preset.vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + preset.dur);
        osc.start(now);
        osc.stop(now + preset.dur);
    } catch {
        // Audio is an enhancement. Unsupported or blocked Web Audio must not halt a round.
    }
}

function renderSoundToggle() {
    if (!els.soundToggle) return;

    const muted = gameState.soundMuted;
    els.soundToggle.classList.toggle('muted', muted);
    els.soundToggle.setAttribute('aria-pressed', String(muted));
    els.soundToggle.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    if (els.soundIcon) els.soundIcon.textContent = muted ? '🔇' : '🔊';
}

function toggleSound() {
    gameState.soundMuted = !gameState.soundMuted;
    saveState();
    renderSoundToggle();

    if (gameState.soundMuted) {
        if (audioCtx && typeof audioCtx.suspend === 'function') {
            try {
                const suspendResult = audioCtx.suspend();
                if (suspendResult && typeof suspendResult.catch === 'function') suspendResult.catch(() => {});
            } catch {
                // A closed or unavailable context is already effectively muted.
            }
        }
    } else {
        initAudio();
    }
    setStatus(gameState.soundMuted ? 'SOUND MUTED' : 'SOUND ENABLED');
}

/* ---------- POSITIONING ---------- */
function getSlotX(slotIndex) {
    const spacing = 240;
    return (slotIndex - 1) * spacing;
}

function updateVaultPositions(instant = false) {
    const reduced = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* ---------- ROUND TIMER LIFECYCLE ---------- */
function createHaltError() {
    const error = new Error('Game halted');
    error.code = 'GAME_HALTED';
    return error;
}

function isHaltError(error) {
    return Boolean(error && error.code === 'GAME_HALTED');
}

function isRoundActive(roundToken) {
    return gameState.isRunning && gameState.roundToken === roundToken;
}

function delay(ms) {
    return new Promise((resolve, reject) => {
        const timerId = window.setTimeout(() => {
            pendingTimers.delete(timerId);
            resolve();
        }, Math.max(0, ms));
        pendingTimers.set(timerId, { reject });
    });
}

function cancelPendingTimers() {
    for (const [timerId, timer] of pendingTimers) {
        window.clearTimeout(timerId);
        pendingTimers.delete(timerId);
        timer.reject(createHaltError());
    }
}

function assertRoundActive(roundToken) {
    if (!isRoundActive(roundToken)) throw createHaltError();
}

async function pauseSafeDelay(ms, roundToken) {
    let remaining = ms;
    const step = 20;

    while (remaining > 0) {
        assertRoundActive(roundToken);
        const wait = Math.min(step, remaining);
        await delay(wait);
        remaining -= wait;
    }

    assertRoundActive(roundToken);
}

function resetRoundVisuals() {
    els.vaults.forEach(vault => {
        vault.classList.remove('correct', 'wrong', 'lifted');
        vault.style.zIndex = 1;
        vault.disabled = true;
    });
    els.token.classList.add('hidden');
    updateVaultPositions(true);
}

function haltRound(message = 'ROUND HALTED — PLACE A NEW BET') {
    const hadActiveRound = gameState.isRunning || gameState.phase !== 'idle';
    cancelPendingTimers();
    gameState.roundToken = ++roundSerial;
    gameState.phase = 'idle';
    gameState.isRunning = false;
    gameState.currentBet = 0;
    resetRoundVisuals();
    if (els.resultPanel) els.resultPanel.classList.add('hidden');
    renderUI();
    if (hadActiveRound) setStatus(message);
}

/* ---------- UI ---------- */
function setStatus(message) {
    if (els.status) els.status.textContent = message;
}

function isRoundBusy() {
    return gameState.isRunning || gameState.phase !== 'idle';
}

function renderUI() {
    els.balance.textContent = fmt(gameState.balance);
    els.bet.textContent = fmt(gameState.currentBet);
    els.netProfit.textContent = fmtSigned(gameState.netProfit);
    els.netProfit.classList.toggle('win', gameState.netProfit > 0);
    els.netProfit.classList.toggle('lose', gameState.netProfit < 0);
    els.navBalance.textContent = Number(gameState.balance).toLocaleString('en-IN');

    renderProfile();
    renderSoundToggle();

    const busy = isRoundBusy();
    if (els.gameContainer) {
        els.gameContainer.dataset.phase = gameState.phase;
        els.gameContainer.setAttribute('aria-busy', String(busy));
    }
    els.startBtn.disabled = busy;
    els.betInput.disabled = busy;
    els.quickBtns.forEach(button => { button.disabled = busy; });
    els.resetProfileBtn.disabled = busy;
    els.clearHistoryBtn.disabled = busy;
    els.topupBtn.disabled = busy;
    els.vaults.forEach(vault => { vault.disabled = gameState.phase !== 'guess'; });

    if (busy && !els.topupModal.classList.contains('hidden')) {
        closeTopup({ restoreFocus: false });
    }
}

function renderProfile() {
    els.pUsername.textContent = 'PLAYER';
    els.pBalance.textContent = fmt(gameState.balance);
    els.pGames.textContent = stats.games;
    els.pWins.textContent = stats.wins;
    els.pLosses.textContent = stats.losses;
    els.pWagered.textContent = fmt(stats.wagered);
    els.pWon.textContent = fmt(stats.won);
    els.pLost.textContent = fmt(stats.lost);
    els.pNet.textContent = fmtSigned(gameState.netProfit);
}

function renderHistory() {
    if (!history.length) {
        els.historyBody.innerHTML = '<tr><td colspan="7" class="empty">No rounds yet.</td></tr>';
        return;
    }

    els.historyBody.innerHTML = history.map(record => {
        const date = new Date(record.date);
        const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
            date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const cls = record.won ? 'win' : 'lose';
        const resultLabel = record.won ? 'WIN' : 'LOSS';
        const payoutStr = record.won ? fmt(record.payout) : fmt(0);
        const profitStr = fmtSigned(record.profit);

        return `<tr>
            <td>#${Core.escapeHtml(String(record.roundId).slice(-5))}</td>
            <td>${Core.escapeHtml(dateStr)}</td>
            <td>${fmt(record.bet)}</td>
            <td>V${record.chosen + 1}</td>
            <td class="${cls}">${resultLabel}</td>
            <td>${payoutStr}</td>
            <td class="${cls}">${profitStr}</td>
        </tr>`;
    }).join('');
}

/* ---------- VALIDATION ---------- */
function readBetInput() {
    return Core.validateBet(els.betInput.value, gameState.balance);
}

function isIdle() {
    return gameState.phase === 'idle' && !gameState.isRunning;
}

function blockedDuringRound(action) {
    setStatus(`${action} AVAILABLE BETWEEN ROUNDS`);
}

/* ---------- NAVBAR ---------- */
els.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        els.navTabs.forEach(currentTab => {
            const selected = currentTab === tab;
            currentTab.classList.toggle('active', selected);
            currentTab.setAttribute('aria-selected', String(selected));
        });
        els.pages.forEach(page => page.classList.remove('active'));
        const page = document.getElementById(`page-${tab.dataset.page}`);
        if (page) page.classList.add('active');
        if (tab.dataset.page === 'history') renderHistory();
        if (tab.dataset.page === 'profile') renderProfile();
    });
});

/* ---------- QUICK BET BUTTONS ---------- */
els.quickBtns.forEach(button => {
    button.addEventListener('click', () => {
        if (!isIdle()) return;
        els.betInput.value = button.dataset.amt;
    });
});

/* ---------- PROFILE / HISTORY ACTIONS ---------- */
els.resetProfileBtn.addEventListener('click', () => {
    if (!isIdle()) {
        blockedDuringRound('ACCOUNT RESET');
        return;
    }
    if (!window.confirm('Reset your account? Balance goes back to ₹1,000 and history is cleared.')) return;

    cancelPendingTimers();
    gameState.roundToken = ++roundSerial;
    gameState.balance = 1000;
    gameState.netProfit = 0;
    gameState.currentBet = 0;
    stats.games = stats.wins = stats.losses = 0;
    stats.wagered = stats.won = stats.lost = 0;
    history = [];
    saveState();
    renderUI();
    renderHistory();
    els.resultPanel.classList.add('hidden');
    els.lastResult.textContent = '—';
    els.lastResult.className = 'value';
    setStatus('ACCOUNT RESET TO LOCAL DEMO DEFAULTS');
});

els.clearHistoryBtn.addEventListener('click', () => {
    if (!isIdle()) {
        blockedDuringRound('HISTORY CLEAR');
        return;
    }
    if (!window.confirm('Clear all betting history?')) return;

    history = [];
    saveState();
    renderHistory();
    setStatus('HISTORY CLEARED');
});

/* ---------- TOP-UP MODAL ---------- */
function isTopupOpen() {
    return Boolean(els.topupModal && !els.topupModal.classList.contains('hidden'));
}

function allowedTopupAmounts() {
    return Array.from(els.topupOptions).map(option => option.dataset.amount);
}

function openTopup() {
    if (!isIdle()) {
        blockedDuringRound('TOP UP');
        return;
    }

    topupRestoreFocus = document.activeElement;
    els.topupModal.classList.remove('hidden');
    els.topupModal.setAttribute('aria-hidden', 'false');
    els.topupBtn.setAttribute('aria-expanded', 'true');
    const firstOption = Array.from(els.topupOptions).find(option => !option.disabled);
    if (firstOption) firstOption.focus();
}

function closeTopup({ restoreFocus = true } = {}) {
    if (!els.topupModal) return;

    els.topupModal.classList.add('hidden');
    els.topupModal.setAttribute('aria-hidden', 'true');
    els.topupBtn.setAttribute('aria-expanded', 'false');

    const focusTarget = topupRestoreFocus;
    topupRestoreFocus = null;
    if (restoreFocus && focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
}

function applyTopup(rawAmount) {
    const validation = Core.validateTopupAmount(rawAmount, allowedTopupAmounts());
    if (!validation.ok) {
        setStatus(validation.error.toUpperCase());
        return;
    }
    if (!isIdle()) {
        closeTopup({ restoreFocus: false });
        blockedDuringRound('TOP UP');
        return;
    }

    const previousBalance = gameState.balance;
    gameState.balance = Core.addDemoCredits(gameState.balance, validation.amount);
    const addedAmount = gameState.balance - previousBalance;
    saveState();
    renderUI();
    closeTopup();
    setStatus(addedAmount > 0
        ? `${fmt(addedAmount)} DEMO CREDITS ADDED — NO PAYMENT PROCESSED`
        : 'DEMO BALANCE LIMIT REACHED');
}

els.topupBtn.addEventListener('click', openTopup);
els.topupClose.addEventListener('click', () => closeTopup());
els.topupDismiss.addEventListener('click', () => closeTopup());
els.topupOptions.forEach(option => {
    option.addEventListener('click', () => applyTopup(option.dataset.amount));
});
els.topupModal.addEventListener('click', event => {
    if (event.target === els.topupModal) closeTopup();
});

/* ---------- GAME FLOW ---------- */
async function startRound() {
    if (!isIdle()) return;

    const check = readBetInput();
    if (!check.ok) {
        setStatus(check.error.toUpperCase());
        return;
    }

    closeTopup({ restoreFocus: false });
    initAudio();

    const roundToken = ++roundSerial;
    gameState.roundToken = roundToken;
    gameState.currentBet = check.amount;
    gameState.balance -= check.amount;
    gameState.isRunning = true;
    gameState.phase = 'countdown';

    // Stats: wagered & games counted when round starts.
    stats.games += 1;
    stats.wagered += check.amount;

    gameState.tokenPosition = Math.floor(Math.random() * 3);
    vaultSlots = [0, 1, 2];
    saveState();
    renderUI();
    els.resultPanel.classList.add('hidden');
    setStatus('SYSTEM ONLINE');
    resetRoundVisuals();

    try {
        await runCountdown(roundToken);
        assertRoundActive(roundToken);
        await runReveal(roundToken);
        assertRoundActive(roundToken);
        await runShuffle(roundToken);
        assertRoundActive(roundToken);
        gameState.phase = 'guess';
        setStatus('CHOOSE THE VAULT!');
        renderUI();
    } catch (error) {
        if (!isHaltError(error)) console.error(error);
        if (isRoundActive(roundToken)) haltRound('ROUND INTERRUPTED — PLACE A NEW BET');
    }
}

async function runCountdown(roundToken) {
    gameState.phase = 'countdown';
    for (let i = 3; i > 0; i--) {
        assertRoundActive(roundToken);
        setStatus(`SYNCING IN ${i}...`);
        playSound('tick');
        await pauseSafeDelay(550, roundToken);
    }
    setStatus('WATCH CLOSELY!');
}

async function runReveal(roundToken) {
    assertRoundActive(roundToken);
    gameState.phase = 'reveal';
    playSound('reveal');

    const vaultEl = els.vaults[vaultSlots[gameState.tokenPosition]];
    vaultEl.classList.add('lifted');
    updateVaultPositions();

    await pauseSafeDelay(400, roundToken);
    els.token.classList.remove('hidden');
    await pauseSafeDelay(950, roundToken);

    vaultEl.classList.remove('lifted');
    els.token.classList.add('hidden');
    updateVaultPositions();
    await pauseSafeDelay(280, roundToken);
}

async function runShuffle(roundToken) {
    assertRoundActive(roundToken);
    gameState.phase = 'shuffle';
    setStatus('SHUFFLING...');

    const numSwaps = 18;
    const speed = 0.18;
    document.documentElement.style.setProperty('--speed', `${speed}s`);

    for (let i = 0; i < numSwaps; i++) {
        await pauseSafeDelay(20, roundToken);

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
        await pauseSafeDelay(speed * 1000, roundToken);
    }
}

async function handleVaultChoice(vaultIndex) {
    const roundToken = gameState.roundToken;
    if (gameState.phase !== 'guess' || !isRoundActive(roundToken)) return;

    gameState.phase = 'result';
    els.vaults.forEach(vault => { vault.blur(); vault.disabled = true; });

    const chosenSlot = vaultSlots.indexOf(vaultIndex);
    if (chosenSlot < 0) {
        gameState.phase = 'guess';
        renderUI();
        return;
    }
    const won = chosenSlot === gameState.tokenPosition;

    // Reveal token under the correct vault.
    updateVaultPositions(true);
    els.token.classList.remove('hidden');

    const chosenEl = els.vaults[vaultIndex];
    chosenEl.classList.add('lifted');

    const outcome = Core.calculateRoundOutcome(gameState.currentBet, won);
    const payout = outcome.payout;
    const profit = outcome.profit;

    if (won) {
        // User bet is already deducted. Winning returns 2x total, so credit 2x.
        gameState.balance += payout;
        gameState.netProfit += profit;
        stats.wins += 1;
        stats.won += payout;

        playSound('win');
        setStatus('YOU WIN!');
        chosenEl.classList.add('correct');
        els.lastResult.textContent = fmtSigned(profit);
        els.lastResult.className = 'value win';
    } else {
        gameState.netProfit -= gameState.currentBet;
        stats.losses += 1;
        stats.lost += gameState.currentBet;

        playSound('lose');
        setStatus('YOU LOSE!');
        chosenEl.classList.add('wrong');

        const correctEl = els.vaults[vaultSlots[gameState.tokenPosition]];
        correctEl.classList.add('lifted', 'correct');

        els.lastResult.textContent = fmtSigned(-gameState.currentBet);
        els.lastResult.className = 'value lose';
    }

    // Result panel.
    els.resultBet.textContent = fmt(gameState.currentBet);
    els.resultOutcome.textContent = won ? 'WIN' : 'LOSS';
    els.resultOutcome.className = won ? 'win' : 'lose';
    els.resultPayout.textContent = fmt(payout);
    els.resultProfit.textContent = fmtSigned(profit);
    els.resultProfit.className = profit >= 0 ? 'win' : 'lose';
    els.resultPanel.classList.remove('hidden');

    // Save history record.
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
    history = history.slice(0, Core.MAX_HISTORY);

    saveState();
    renderUI();
    renderHistory();

    let halted = false;
    try {
        await pauseSafeDelay(2200, roundToken);
    } catch (error) {
        halted = true;
        if (!isHaltError(error)) console.error(error);
    } finally {
        if (!isRoundActive(roundToken)) return;

        resetRoundVisuals();
        gameState.phase = 'idle';
        gameState.isRunning = false;
        gameState.currentBet = 0;
        renderUI();
        setStatus(halted ? 'ROUND HALTED — PLACE A NEW BET' : 'PLACE YOUR BET TO PLAY AGAIN');
    }
}

/* ---------- EVENTS ---------- */
els.vaults.forEach((vault, index) => {
    vault.addEventListener('click', () => { void handleVaultChoice(index); });
});

els.startBtn.addEventListener('click', () => { void startRound(); });
els.soundToggle.addEventListener('click', toggleSound);

function isTypingTarget(target) {
    return Boolean(target && typeof target.closest === 'function'
        && target.closest('input, textarea, select, [contenteditable="true"]'));
}

function isInteractiveTarget(target) {
    return isTypingTarget(target) || Boolean(target && typeof target.closest === 'function'
        && target.closest('button, a, [role="button"]'));
}

function trapModalFocus(event) {
    const focusable = Array.from(els.topupModal.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
    ));
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

document.addEventListener('keydown', event => {
    if (isTopupOpen()) {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeTopup();
        } else if (event.key === 'Tab') {
            trapModalFocus(event);
        }
        return;
    }

    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isInteractiveTarget(event.target)) return;

    if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        if (isIdle() && !els.startBtn.disabled) void startRound();
    }

    if (gameState.phase === 'guess') {
        if (event.key === '1') void handleVaultChoice(vaultSlots[0]);
        if (event.key === '2') void handleVaultChoice(vaultSlots[1]);
        if (event.key === '3') void handleVaultChoice(vaultSlots[2]);
    }
});

window.addEventListener('pagehide', () => {
    if (gameState.isRunning || gameState.phase !== 'idle') {
        haltRound('ROUND HALTED — PLACE A NEW BET');
    } else {
        cancelPendingTimers();
    }
});

/* ---------- BOOT ---------- */
els.topupModal.classList.add('hidden');
els.topupModal.setAttribute('aria-hidden', 'true');
els.topupBtn.setAttribute('aria-expanded', 'false');
renderUI();
renderHistory();
updateVaultPositions(true);
