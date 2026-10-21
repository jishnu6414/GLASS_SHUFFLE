/* =========================================================
   GLASS SHUFFLE — PURE GAME / STORAGE HELPERS
   CommonJS and browser compatible.
   ========================================================= */

(function exposeCore(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
        return;
    }

    if (root) root.GlassShuffleCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCore() {
    'use strict';

    const STORAGE = Object.freeze({
        balance: 'glassShuffleBalance',
        net: 'glassShuffleNetProfit',
        history: 'glassShuffleHistory',
        stats: 'glassShuffleStats',
        soundMuted: 'glassShuffleSoundMuted'
    });

    const DEFAULT_BALANCE = 1000;
    const MAX_HISTORY = 100;
    const MAX_BALANCE = 1_000_000_000_000;
    const MAX_TOTAL = 1_000_000_000_000;

    const DEFAULT_STATS = Object.freeze({
        games: 0,
        wins: 0,
        losses: 0,
        wagered: 0,
        won: 0,
        lost: 0
    });

    function readStorageValue(storage, key) {
        if (!storage || typeof storage.getItem !== 'function') return null;

        try {
            return storage.getItem(key);
        } catch {
            return null;
        }
    }

    function parseStoredJson(raw, fallback) {
        if (raw === null || raw === undefined || raw === '') return fallback;
        if (typeof raw === 'object') return raw;
        if (typeof raw !== 'string') return fallback;

        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function parseStoredNumber(raw, fallback, options = {}) {
        const value = typeof raw === 'number'
            ? raw
            : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN);

        if (!Number.isFinite(value)) return fallback;
        if (Number.isFinite(options.min) && value < options.min) return fallback;
        if (Number.isFinite(options.max) && value > options.max) return fallback;
        return value;
    }

    function parseStoredInteger(raw, fallback, options = {}) {
        const value = parseStoredNumber(raw, NaN, options);
        return Number.isInteger(value) ? value : fallback;
    }

    function parseStoredBoolean(raw, fallback) {
        if (typeof raw === 'boolean') return raw;
        if (typeof raw === 'number') {
            if (raw === 1) return true;
            if (raw === 0) return false;
            return fallback;
        }
        if (typeof raw !== 'string') return fallback;

        const normalized = raw.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;

        const parsed = parseStoredJson(normalized, null);
        return typeof parsed === 'boolean' ? parsed : fallback;
    }

    function sanitizeText(value, maxLength = 120) {
        if (value === null || value === undefined) return '';

        return String(value)
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, maxLength);
    }

    function sanitizeStats(value) {
        const raw = value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {};

        return {
            games: parseStoredInteger(raw.games, DEFAULT_STATS.games, { min: 0, max: MAX_TOTAL }),
            wins: parseStoredInteger(raw.wins, DEFAULT_STATS.wins, { min: 0, max: MAX_TOTAL }),
            losses: parseStoredInteger(raw.losses, DEFAULT_STATS.losses, { min: 0, max: MAX_TOTAL }),
            wagered: parseStoredNumber(raw.wagered, DEFAULT_STATS.wagered, { min: 0, max: MAX_TOTAL }),
            won: parseStoredNumber(raw.won, DEFAULT_STATS.won, { min: 0, max: MAX_TOTAL }),
            lost: parseStoredNumber(raw.lost, DEFAULT_STATS.lost, { min: 0, max: MAX_TOTAL })
        };
    }

    function sanitizeHistory(value, maxEntries = MAX_HISTORY) {
        if (!Array.isArray(value)) return [];

        const sanitized = [];
        value.forEach((record, index) => {
            if (!record || typeof record !== 'object' || Array.isArray(record)) return;

            const date = new Date(record.date);
            const bet = parseStoredNumber(record.bet, NaN, { min: 10, max: 10000 });
            const chosen = parseStoredInteger(record.chosen, NaN, { min: 0, max: 2 });
            const correct = parseStoredInteger(record.correct, NaN, { min: 0, max: 2 });
            const payout = parseStoredNumber(record.payout, NaN, { min: 0, max: 20000 });
            const profit = parseStoredNumber(record.profit, NaN, { min: -10000, max: 10000 });
            const won = parseStoredBoolean(record.won, null);

            if (!Number.isFinite(date.getTime())) return;
            if (!Number.isFinite(bet) || !Number.isInteger(chosen) || !Number.isInteger(correct)) return;
            if (!Number.isFinite(payout) || !Number.isFinite(profit) || won === null) return;

            sanitized.push({
                roundId: sanitizeText(record.roundId, 80) || `stored-${index + 1}`,
                date: date.toISOString(),
                bet,
                chosen,
                correct,
                won,
                payout,
                profit
            });
        });

        return sanitized.slice(0, Math.max(0, maxEntries));
    }

    function loadPersistedState(storage) {
        const stats = parseStoredJson(readStorageValue(storage, STORAGE.stats), null);
        const storedHistory = parseStoredJson(readStorageValue(storage, STORAGE.history), []);

        return {
            balance: parseStoredNumber(
                readStorageValue(storage, STORAGE.balance),
                DEFAULT_BALANCE,
                { min: 0, max: MAX_BALANCE }
            ),
            netProfit: parseStoredNumber(
                readStorageValue(storage, STORAGE.net),
                0,
                { min: -MAX_TOTAL, max: MAX_TOTAL }
            ),
            stats: sanitizeStats(stats),
            history: sanitizeHistory(storedHistory, MAX_HISTORY),
            soundMuted: parseStoredBoolean(readStorageValue(storage, STORAGE.soundMuted), false)
        };
    }

    function formatCurrency(value) {
        const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
        return `₹${safeValue.toLocaleString('en-IN')}`;
    }

    function formatSignedCurrency(value) {
        const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
        return safeValue >= 0
            ? `+${formatCurrency(safeValue)}`
            : `-${formatCurrency(Math.abs(safeValue))}`;
    }

    function validateBet(rawValue, balance) {
        const amount = Number.parseInt(String(rawValue ?? ''), 10);
        if (!Number.isFinite(amount) || amount < 10) {
            return { ok: false, error: 'Minimum bet is ₹10' };
        }
        if (amount > 10000) {
            return { ok: false, error: 'Maximum bet is ₹10,000' };
        }
        if (!Number.isFinite(balance) || amount > balance) {
            return { ok: false, error: 'Insufficient balance' };
        }
        return { ok: true, amount };
    }

    function validateTopupAmount(rawValue, allowedAmounts) {
        const normalized = String(rawValue ?? '').trim();
        const amount = normalized === '' ? NaN : Number(normalized);
        const allowed = Array.isArray(allowedAmounts)
            ? allowedAmounts.map(value => Number(String(value).trim())).filter(Number.isFinite)
            : [];

        if (!Number.isInteger(amount) || amount <= 0 || !allowed.includes(amount)) {
            return { ok: false, error: 'Choose a preset demo amount.' };
        }
        return { ok: true, amount };
    }

    function addDemoCredits(balance, amount) {
        const currentBalance = parseStoredNumber(balance, DEFAULT_BALANCE, {
            min: 0,
            max: MAX_BALANCE
        });
        const credits = parseStoredNumber(amount, 0, { min: 0, max: MAX_BALANCE });
        return Math.min(MAX_BALANCE, currentBalance + credits);
    }

    function calculateRoundOutcome(bet, won) {
        const safeBet = Number.isFinite(Number(bet)) ? Number(bet) : 0;
        return won
            ? { payout: safeBet * 2, profit: safeBet }
            : { payout: 0, profit: -safeBet };
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return Object.freeze({
        STORAGE,
        DEFAULT_STATS,
        DEFAULT_BALANCE,
        MAX_HISTORY,
        MAX_BALANCE,
        readStorageValue,
        parseStoredJson,
        parseStoredNumber,
        parseStoredInteger,
        parseStoredBoolean,
        sanitizeText,
        sanitizeStats,
        sanitizeHistory,
        loadPersistedState,
        formatCurrency,
        formatSignedCurrency,
        validateBet,
        validateTopupAmount,
        addDemoCredits,
        calculateRoundOutcome,
        escapeHtml
    });
});
