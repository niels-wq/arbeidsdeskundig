'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

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

async function get(path) {
    const res = await fetch(base + path);
    const html = await res.text();
    return { status: res.status, html };
}

async function post(path, body) {
    const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, json };
}

function sliceView(html, id) {
    const open = html.indexOf(`id="${id}"`);
    assert.notEqual(open, -1, `missing #${id}`);
    const start = html.lastIndexOf('<div', open);
    const marker = `id="${id}"`;
    let depth = 0;
    let i = start;
    while (i < html.length) {
        if (html.startsWith('<div', i)) depth += 1;
        else if (html.startsWith('</div>', i)) {
            depth -= 1;
            if (depth === 0) return html.slice(start, i + 6);
        }
        i += 1;
    }
    return html.slice(start);
}

describe('conversion pages: offerte and aanmelden', () => {
    it('GET /offerte-aanvragen is 200 with offerte-first CTA and value proof', async () => {
        const { status, html } = await get('/offerte-aanvragen');
        assert.equal(status, 200);
        assert.match(html, /<body class="conv-page conv-offerte">/);
        assert.match(html, /<div class="view active" id="view-offerte">/);

        const view = sliceView(html, 'view-offerte');
        assert.match(view, /<h1[^>]*>Vraag je offerte aan — vanaf €1\.095,-<\/h1>/);
        assert.match(view, /Vanaf €1\.095,-/);
        assert.match(view, /Binnen 24 uur/);
        assert.match(view, /4,9\/5/);
        assert.match(view, /id="btn-of-direct"[^>]*>Offerte aanvragen</);
        assert.match(view, /binnen 24 uur/);
        assert.match(view, /id="of-naam"/);
        assert.match(view, /id="of-email"/);
        assert.match(view, /id="of-telefoon"/);
        assert.match(view, /of-naam-msg/);
        assert.match(view, /Liever eerst kennismaken of bellen/);
        assert.match(view, /calendly\.com\/matchvermogen\/call-15-min/);
        assert.match(view, /openCalendlyPopup\(\)/);
        assert.match(view, /openBelTerugModal\(\)/);

        const formStart = view.indexOf('id="offerte-form-step"');
        const twijfelStart = view.indexOf('id="offerte-twijfel"');
        assert.ok(formStart > -1 && twijfelStart > formStart, 'form must appear before the kennismaking path');
    });

    it('GET /aanmelden is 200 with 6-step flow, value proof and twijfel-pad', async () => {
        const { status, html } = await get('/aanmelden');
        assert.equal(status, 200);
        assert.match(html, /<body class="conv-page conv-aanmelden">/);
        assert.match(html, /<div class="view active" id="view-aanmelden">/);

        const view = sliceView(html, 'view-aanmelden');
        assert.match(view, /<h1[^>]*>Meld je onderzoek aan — vanaf €1\.095,-<\/h1>/);
        assert.match(view, /Vanaf €1\.095,-/);
        assert.match(view, /Binnen 24 uur/);
        assert.match(view, /4,9\/5/);
        assert.match(view, /id="form-step-1"/);
        assert.match(view, /id="form-step-6"/);
        assert.match(view, /Stap 1 van 6/);
        assert.match(view, /inp-aanvrager-naam/);
        assert.match(view, /inp-aanvrager-email/);
        assert.match(view, /inp-aanvrager-tel/);
        assert.match(view, /Liever eerst kennismaken of bellen/);
        assert.match(view, /calendly\.com\/matchvermogen\/call-15-min/);
        assert.match(view, /binnen 24 uur/);
        assert.match(view, /id="btn-to-step7"/);
    });

    it('empty POSTs still return 400 and never accept onbekend', async () => {
        const emptyOfferte = await post('/api/offerte', {});
        assert.equal(emptyOfferte.status, 400);
        assert.equal(emptyOfferte.json.ok, false);
        assert.match(emptyOfferte.json.error, /naam|e-mail|telefoon/i);

        const emptyAanmeld = await post('/api/aanmelden', {});
        assert.equal(emptyAanmeld.status, 400);
        assert.equal(emptyAanmeld.json.ok, false);

        const onbekend = await post('/api/offerte', {
            naam: 'onbekend',
            email: 'jan@bedrijf.nl',
            telefoon: '0612345678',
        });
        assert.equal(onbekend.status, 400);
        assert.equal(onbekend.json.ok, false);
    });
});
