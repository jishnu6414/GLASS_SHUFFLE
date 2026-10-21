const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server.js');

let server;
let baseUrl;

test.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function request(path, options, responseType = 'json') {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = responseType === 'text' ? await response.text() : await response.json();
    return { response, body };
}

test('health endpoint keeps its response shape', async () => {
    const { response, body } = await request('/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok' });
});

test('score endpoint accepts finite non-negative scores and preserves its payload', async () => {
    const { response, body } = await request('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score: 1250, level: 3 })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
        success: true,
        score: 1250,
        level: 3,
        message: 'Score saved securely.'
    });
});

test('score endpoint rejects malformed payloads with the existing error shape', async () => {
    const { response, body } = await request('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score: -1, level: 1 })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: 'Invalid score or level provided.' });
});

test('score endpoint treats an empty JSON object as invalid instead of throwing', async () => {
    const { response, body } = await request('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
    });

    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: 'Invalid score or level provided.' });
});

test('server can serve the existing frontend without listening on require', async () => {
    const { response, body } = await request('/', undefined, 'text');
    assert.equal(response.status, 200);
    assert.match(body, /GLASS SHUFFLE/);
});
