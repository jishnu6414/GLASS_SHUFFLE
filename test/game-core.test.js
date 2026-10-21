const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../public/game-core.js');

function makeStorage(values = {}, { throwOnRead = false } = {}) {
    return {
        getItem(key) {
            if (throwOnRead) throw new Error('storage unavailable');
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        }
    };
}

test('loadPersistedState falls back safely for malformed browser storage', () => {
    const storage = makeStorage({
        [core.STORAGE.balance]: 'not-a-number',
        [core.STORAGE.net]: 'Infinity',
        [core.STORAGE.stats]: '{broken json',
        [core.STORAGE.history]: JSON.stringify([
            {
                roundId: '<script>alert(1)</script>',
                date: '2026-10-21T12:00:00.000Z',
                bet: 100,
                chosen: 1,
                correct: 2,
                won: true,
                payout: 200,
                profit: 100
            },
            { date: 'not-a-date', bet: 100, chosen: 0, correct: 1, won: false, payout: 0, profit: -100 }
        ]),
        [core.STORAGE.soundMuted]: 'not-a-boolean'
    });

    const state = core.loadPersistedState(storage);

    assert.equal(state.balance, 1000);
    assert.equal(state.netProfit, 0);
    assert.deepEqual(state.stats, core.DEFAULT_STATS);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].roundId, '<script>alert(1)</script>');
    assert.equal(state.soundMuted, false);
});

test('loadPersistedState tolerates storage access failures', () => {
    assert.deepEqual(core.loadPersistedState(makeStorage({}, { throwOnRead: true })), {
        balance: 1000,
        netProfit: 0,
        stats: { ...core.DEFAULT_STATS },
        history: [],
        soundMuted: false
    });
});

test('validateBet preserves the established limits and balance check', () => {
    assert.deepEqual(core.validateBet('100', 1000), { ok: true, amount: 100 });
    assert.equal(core.validateBet('9', 1000).ok, false);
    assert.equal(core.validateBet('10001', 100000).ok, false);
    assert.equal(core.validateBet('500', 100).error, 'Insufficient balance');
});

test('validateTopupAmount accepts only local preset amounts', () => {
    assert.deepEqual(core.validateTopupAmount('500', [100, 500, 1000]), { ok: true, amount: 500 });
    assert.equal(core.validateTopupAmount('250', [100, 500, 1000]).ok, false);
    assert.equal(core.validateTopupAmount('500junk', [500]).ok, false);
    assert.equal(core.validateTopupAmount('5000', undefined).ok, false);
});

test('addDemoCredits caps transparent local credits at the safe balance ceiling', () => {
    assert.equal(core.addDemoCredits(1000, 500), 1500);
    assert.equal(core.addDemoCredits(core.MAX_BALANCE, 500), core.MAX_BALANCE);
    assert.equal(core.addDemoCredits('not-a-number', 500), 1500);
});

test('calculateRoundOutcome keeps the 2x win payout and net profit rules', () => {
    assert.deepEqual(core.calculateRoundOutcome(100, true), { payout: 200, profit: 100 });
    assert.deepEqual(core.calculateRoundOutcome(100, false), { payout: 0, profit: -100 });
});

test('formatting and HTML escaping are deterministic', () => {
    assert.equal(core.formatCurrency(1234567), '₹12,34,567');
    assert.equal(core.formatSignedCurrency(25), '+₹25');
    assert.equal(core.formatSignedCurrency(-25), '-₹25');
    assert.equal(core.escapeHtml('<img src="x">'), '&lt;img src=&quot;x&quot;&gt;');
});
