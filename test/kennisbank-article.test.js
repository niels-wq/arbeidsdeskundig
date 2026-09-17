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
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Wanneer een arbeidsdeskundig onderzoek na 1 jaar ziekte\?<\/h2>/);
        assert.match(body, /ijkpunt, geen startsein/);
        assert.match(body, /kennisbank\/poortwachter-tijdlijn/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);

        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/fml-izp-lezen-belastbaarheid/);
        assert.match(html, /kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
    });

    it('is listed in sitemap.xml', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${PATH}`));
    });
});

const VERPLICHT_SLUG = 'verplicht-arbeidsdeskundig-onderzoek';
const VERPLICHT_PATH = '/kennisbank/' + VERPLICHT_SLUG;

describe('kennisbank article: is AD onderzoek verplicht', () => {
    it('serves unique article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + VERPLICHT_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Is een arbeidsdeskundig onderzoek verplicht\? Wat de wet wel en niet zegt — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Is een arbeidsdeskundig onderzoek verplicht\? Wet Poortwachter vs UWV-praktijk, mythes en risico van overslaan\. Vraag een offerte of kennismaking\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${VERPLICHT_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Is een arbeidsdeskundig onderzoek verplicht\?<\/h2>/);
        assert.match(body, /verplicht arbeidsdeskundig onderzoek/);
        assert.match(body, /niet in elk dossier letterlijk/);
        assert.match(body, /kennisbank\/poortwachter-tijdlijn/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);

        assert.match(html, /kennisbank\/arbeidsdeskundig-onderzoek-na-1-jaar-ziekte/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
    });

    it('is listed in sitemap.xml and unique from sibling slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${VERPLICHT_PATH}`));
        assert.equal((xml.match(new RegExp(VERPLICHT_SLUG, 'g')) || []).length, 1);
    });
});
