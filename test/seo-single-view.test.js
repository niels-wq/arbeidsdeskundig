'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const VIEW_OPEN_RE = /<div class="(view(?: active)?)" id="(view-[^"]+)"( hidden)?>/g;

const ROUTES = [
    { path: '/', view: 'view-home' },
    { path: '/rekentool', view: 'view-calculator' },
    { path: '/keuzehulp', view: 'view-advies' },
    { path: '/veelgestelde-vragen', view: 'view-faq' },
    { path: '/over-ons', view: 'view-over' },
    { path: '/offerte-aanvragen', view: 'view-offerte', also: ['view-fysiek-tarief'] },
    { path: '/aanmelden', view: 'view-aanmelden' },
    { path: '/arbeidsdeskundige-met-tolk', view: 'view-tolk' },
    { path: '/kennisbank', view: 'view-kennisbank' },
    { path: '/voor/hr-adviseur', view: 'view-persona' },
    { path: '/voor/werknemer', view: 'view-persona' },
    { path: '/kennisbank/tips-werknemer-arbeidsdeskundig-onderzoek', view: 'view-artikel', article: true },
    { path: '/kennisbank/voorbereiden-gesprek-arbeidsdeskundige', view: 'view-artikel', article: true },
    { path: '/kennisbank/werknemer-zelf-aanvragen', view: 'view-artikel', article: true },
    { path: '/kennisbank/arbeidsdeskundig-onderzoek-gids', view: 'view-artikel', article: true },
];

const FOREIGN_VIEWS = [
    'view-home',
    'view-calculator',
    'view-offerte',
    'view-aanmelden',
    'view-faq',
    'view-kennisbank',
    'view-artikel',
    'view-persona',
    'view-advies',
    'view-over',
    'view-tolk',
    'view-fysiek-tarief',
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
        views.push({ id: m[2], hidden: Boolean(m[3]), active: m[1].includes('active') });
    }
    return views;
}

describe('SEO: one view per URL', () => {
    for (const spec of ROUTES) {
        it(`GET ${spec.path} returns only its own view, one h1, and conversion links`, async () => {
            const res = await fetch(base + spec.path);
            assert.equal(res.status, 200);
            const html = await res.text();
            const views = parseViews(html);
            const expected = [spec.view, ...(spec.also || [])];
            assert.deepEqual(views.map((v) => v.id), expected);
            assert.equal(views[0].active, true);
            assert.equal(views[0].hidden, false);
            for (const id of FOREIGN_VIEWS) {
                if (expected.includes(id)) continue;
                assert.equal(html.includes(`id="${id}"`), false, `${spec.path} still contains ${id}`);
            }
            if (spec.article) {
                assert.equal(html.includes('id="view-home"'), false);
                assert.equal(html.includes('id="view-offerte"'), false);
                assert.equal(html.includes('id="of-naam"'), false);
                assert.equal(html.includes('id="form-step-1"'), false);
                assert.equal(html.includes('id="view-aanmelden"'), false);
            }
            if (spec.view !== 'view-offerte') {
                assert.equal(html.includes('id="of-naam"'), false);
            } else {
                assert.match(html, /id="of-naam"/);
                assert.match(html, /id="btn-of-direct"/);
            }
            if (spec.view !== 'view-aanmelden') {
                assert.equal(html.includes('id="form-step-1"'), false);
            } else {
                assert.match(html, /id="form-step-1"/);
                assert.match(html, /id="form-step-6"/);
            }
            const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) || [];
            assert.equal(h1s.length, 1, h1s.join(' | '));
            assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${spec.path === '/' ? '/' : spec.path}">`));
            assert.match(html, /<title>[^<]+ \| Arbeidsdeskundig\.com<\/title>/);
            assert.match(html, /<meta name="description" content="[^"]+">/);
            assert.match(html, /<script type="application\/ld\+json">/);
            assert.match(html, /<header class="site">/);
            assert.match(html, /<footer class="site">/);
            assert.match(html, /<a\b[^>]*\bhref="\/offerte-aanvragen"/);
            assert.match(html, /<a\b[^>]*\bhref="\/aanmelden"/);
        });
    }
});
