'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const SLUG = 'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte';
const PATH = '/kennisbank/' + SLUG;

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

describe('kennisbank article: wanneer AD na 1 jaar ziekte', () => {
    it('serves unique article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Wanneer een arbeidsdeskundig onderzoek \(na 1 jaar ziekte\)\? Timing en valkuilen — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Wanneer een arbeidsdeskundig onderzoek na 1 jaar ziekte\? Week 42–52 vs eerder inzetten, valkuilen bij wachten\. Vraag een offerte of kennismaking\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${PATH}">`));
        assert.match(html, /Wanneer een arbeidsdeskundig onderzoek na 1 jaar ziekte\?/);
        assert.match(html, /ijkpunt, geen startsein/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/fml-izp-lezen-belastbaarheid/);
        assert.match(html, /kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/poortwachter-tijdlijn/);
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);
        assert.doesNotMatch(html, /Dit artikel wordt binnenkort toegevoegd/);
    });

    it('is listed in sitemap.xml', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${PATH}`));
    });
});
