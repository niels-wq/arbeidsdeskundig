'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const VIEW_OPEN_RE = /<div class="(view(?: active)?)" id="(view-[^"]+)"( hidden)?>/g;

const PROBLEM_PATHS = [
    { path: '/kennisbank/wat-doet-arbeidsdeskundige', active: 'view-artikel', titleH1: /Wat doet een arbeidsdeskundige precies/ },
    { path: '/kennisbank/arbeidsdeskundig-onderzoek-gids', active: 'view-artikel', titleH1: /Alles over arbeidsdeskundig onderzoek: de gids/ },
    { path: '/offerte-aanvragen', active: 'view-offerte', titleH1: /Vraag je offerte aan — vanaf €1\.095,-/ },
    { path: '/aanmelden', active: 'view-aanmelden', titleH1: /Meld je onderzoek aan — vanaf €1\.095,-/ },
];

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

function parseViews(html) {
    const views = [];
    VIEW_OPEN_RE.lastIndex = 0;
    let m;
    while ((m = VIEW_OPEN_RE.exec(html))) {
        views.push({
            className: m[1],
            id: m[2],
            hidden: Boolean(m[3]),
            active: m[1].includes('active'),
        });
    }
    return views;
}

function assertOutline(html, activeId) {
    const views = parseViews(html);
    assert.ok(views.length >= 10, `expected the SPA views, got ${views.length}`);
    const active = views.filter((v) => v.active);
    assert.equal(active.length, 1, `expected exactly one .view.active, got ${active.map((v) => v.id).join(',')}`);
    assert.equal(active[0].id, activeId);
    assert.equal(active[0].hidden, false, `${activeId} must not have hidden`);
    for (const view of views) {
        if (view.id === activeId) continue;
        assert.equal(view.active, false, `${view.id} must not be active`);
        assert.equal(view.hidden, true, `${view.id} must have hidden`);
    }
}

describe('SEO: hidden inactive views + sitemap', () => {
    it('static homepage shell already hides inactive views', () => {
        assertOutline(INDEX_HTML, 'view-home');
    });

    it('setView toggles hidden together with active', () => {
        const start = INDEX_HTML.indexOf('function setView(view, opts){');
        assert.notEqual(start, -1);
        const src = INDEX_HTML.slice(start, start + 450);
        assert.match(src, /setAttribute\('hidden'/);
        assert.match(src, /removeAttribute\('hidden'\)/);
        assert.match(src, /classList\.add\('active'\)/);
    });

    for (const spec of PROBLEM_PATHS) {
        it(`GET ${spec.path} hides inactive views and keeps one outline H1`, async () => {
            const res = await fetch(base + spec.path);
            assert.equal(res.status, 200);
            const html = await res.text();

            assertOutline(html, spec.active);
            assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${spec.path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}">`));
            assert.match(html, /<meta name="robots" content="index, follow">/);
            assert.match(html, new RegExp(`<meta property="og:url" content="https://www\\.arbeidsdeskundig\\.com${spec.path.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}">`));
            assert.match(html, spec.titleH1);
            assert.match(html, /id="cookie-banner"/);
            assert.match(html, /--ink:\s*#12203A/);
            assert.match(html, /--amber:\s*#D8A03D/);
        });
    }

    it('GET / also hides inactive views', async () => {
        const res = await fetch(base + '/');
        assert.equal(res.status, 200);
        const html = await res.text();
        assertOutline(html, 'view-home');
        assert.match(html, /<link rel="canonical" href="https:\/\/www\.arbeidsdeskundig\.com\/">/);
    });

    it('sitemap still lists kennisbank + offerte + aanmelden as absolute https www URLs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /application\/xml/);
        const xml = await res.text();
        for (const loc of [
            'https://www.arbeidsdeskundig.com/kennisbank/wat-doet-arbeidsdeskundige',
            'https://www.arbeidsdeskundig.com/kennisbank/arbeidsdeskundig-onderzoek-gids',
            'https://www.arbeidsdeskundig.com/offerte-aanvragen',
            'https://www.arbeidsdeskundig.com/aanmelden',
        ]) {
            assert.match(xml, new RegExp(`<loc>${loc.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}</loc>`));
        }
        assert.doesNotMatch(xml, /http:\/\/arbeidsdeskundig\.com/);
        assert.doesNotMatch(xml, /https:\/\/arbeidsdeskundig\.com\//);
    });

    it('does not gut offerte/aanmelden conversion copy', async () => {
        const offerte = await (await fetch(base + '/offerte-aanvragen')).text();
        assert.match(offerte, /<div class="view active" id="view-offerte">/);
        assert.match(offerte, /Vraag je offerte aan — vanaf €1\.095,-/);
        assert.match(offerte, /id="btn-of-direct"[^>]*>Offerte aanvragen</);
        assert.match(offerte, /Liever eerst kennismaken of bellen/);
        assert.match(offerte, /calendly\.com\/matchvermogen\/call-15-min/);

        const aanmeld = await (await fetch(base + '/aanmelden')).text();
        assert.match(aanmeld, /<div class="view active" id="view-aanmelden">/);
        assert.match(aanmeld, /Meld je onderzoek aan — vanaf €1\.095,-/);
        assert.match(aanmeld, /id="form-step-1"/);
        assert.match(aanmeld, /id="form-step-6"/);
        assert.match(aanmeld, /Liever eerst kennismaken of bellen/);
    });
});
