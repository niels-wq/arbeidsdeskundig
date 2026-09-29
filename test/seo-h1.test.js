'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const ROUTES = [
    { path: '/', h1: 'Arbeidsdeskundig onderzoek. Vanaf €1.095,-.' },
    { path: '/aanmelden', h1: 'Meld je onderzoek aan — vanaf €1.095,-' },
    { path: '/offerte-aanvragen', h1: 'Vraag je offerte aan — vanaf €1.095,-' },
    { path: '/kennisbank', h1: 'Alles over arbeidsdeskundig onderzoek' },
    { path: '/rekentool', h1: 'Eerder starten = eerder klaar' },
    { path: '/keuzehulp', h1: 'Waar wil je hulp bij?' },
    { path: '/veelgestelde-vragen', h1: 'Alles wat je wilt weten over arbeidsdeskundig onderzoek' },
    { path: '/over-ons', h1: 'Onderdeel van Matchvermogen B.V.' },
    { path: '/voor/hr-adviseur', h1: 'Arbeidsdeskundig onderzoek voor HR-adviseurs' },
    {
        path: '/kennisbank/wat-doet-arbeidsdeskundige',
        h1: 'Wat doet een arbeidsdeskundige precies? (en wat niet)',
        article: true,
    },
    {
        path: '/kennisbank/kosten-arbeidsdeskundig-onderzoek',
        h1: 'Kosten arbeidsdeskundig onderzoek: tarieven en wat je krijgt (2026)',
        article: true,
    },
    {
        path: '/kennisbank/arbeidsdeskundig-onderzoek-gids',
        h1: 'Alles over arbeidsdeskundig onderzoek: de gids',
        article: true,
    },
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

function h1Tags(html) {
    return [...html.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/g)].map((m) => m[0]);
}

function h1Text(tag) {
    return tag.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

describe('SEO: exactly one h1 per route', () => {
    for (const spec of ROUTES) {
        it(`GET ${spec.path} serves exactly one h1`, async () => {
            const res = await fetch(base + spec.path);
            assert.equal(res.status, 200);
            const html = await res.text();
            const tags = h1Tags(html);
            assert.equal(tags.length, 1, `expected 1 <h1>, got ${tags.length}: ${tags.join(' | ')}`);
            assert.equal((html.match(/<h1/g) || []).length, 1);
            assert.equal(h1Text(tags[0]), spec.h1);
            if (spec.article) {
                assert.match(tags[0], /id="artikel-titel"/);
                assert.doesNotMatch(tags[0], /Arbeidsdeskundig onderzoek\. Vanaf €1\.095,-/);
            }
            assert.match(html, /id="navToggle"/);
            assert.match(html, /id="cookie-banner"/);
            assert.match(html, /href="\/aanmelden"/);
            assert.match(html, /href="\/offerte-aanvragen"/);
        });
    }

    it('inactive view titles are h2, not a second h1', async () => {
        const html = await (await fetch(base + '/')).text();
        assert.match(html, /<h2[^>]*class="[^"]*\broute-h1\b[^"]*"[^>]*>Eerder starten = eerder klaar<\/h2>/);
        assert.match(html, /<h2[^>]*class="[^"]*\broute-h1\b[^"]*"[^>]*>Vraag je offerte aan — vanaf €1\.095,-<\/h2>/);
        assert.match(html, /<h2[^>]*id="artikel-titel"[^>]*>Titel<\/h2>/);
        assert.doesNotMatch(html, /<h1[^>]*>Eerder starten = eerder klaar<\/h1>/);
        assert.doesNotMatch(html, /<h1[^>]*>Waar wil je hulp bij\?<\/h1>/);
    });
});
