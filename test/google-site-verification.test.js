'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');

const VERIFICATION_PATH = '/googleac4843348bb6bad7.html';
const VERIFICATION_BODY = 'google-site-verification: googleac4843348bb6bad7.html';

let server;
let base;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('Google Search Console verification file', () => {
    it('GET /googleac4843348bb6bad7.html returns 200 and the exact body', async () => {
        const onDisk = fs.readFileSync(path.join(__dirname, '..', 'public', 'googleac4843348bb6bad7.html'), 'utf8');
        assert.equal(onDisk, VERIFICATION_BODY);

        const res = await fetch(base + VERIFICATION_PATH, { redirect: 'manual' });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('location'), null);
        const body = await res.text();
        assert.equal(body, VERIFICATION_BODY);
    });
});
