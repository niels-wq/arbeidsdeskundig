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

const WERKNEMER_SLUG = 'tips-werknemer-arbeidsdeskundig-onderzoek';
const WERKNEMER_PATH = '/kennisbank/' + WERKNEMER_SLUG;
const RESERVED_SLUGS = [
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'kosten-arbeidsdeskundig-onderzoek',
    'fml-izp-lezen-belastbaarheid',
    'wat-doet-arbeidsdeskundige',
    'voorbereiden-gesprek-arbeidsdeskundige',
    'passende-arbeid',
    'psychische-klachten-werkhervatting',
    'werkplekaanpassingen-subsidie',
    'mediation-arbeidsconflict',
];

describe('kennisbank article: tips werknemer arbeidsdeskundig onderzoek', () => {
    it('serves unique employee-facing article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + WERKNEMER_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Tips voor werknemers bij een arbeidsdeskundig onderzoek — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Tips voor werknemers bij een arbeidsdeskundig onderzoek: voorbereiding, rechten, beperkingen zonder medische oversharing. Vraag een kennismaking.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${WERKNEMER_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Tips voor werknemers bij een arbeidsdeskundig onderzoek');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Tips voor werknemers bij een arbeidsdeskundig onderzoek<\/h2>/);
        assert.match(body, /tips voor werknemers bij een arbeidsdeskundig onderzoek/);
        assert.match(body, /expliciet voor jou als werknemer/);
        assert.match(body, /zonder medisch te overdelen/);
        assert.match(body, /Arbeidsdeskundige versus bedrijfsarts/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /De onmisbare checklist/);
        assert.doesNotMatch(body, /\bBram\b/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /tips voor werknemers bij een arbeidsdeskundig onderzoek/i);

        assert.match(html, /kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/fml-izp-lezen-belastbaarheid/);
        assert.match(html, /kennisbank\/passende-arbeid/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
        assert.match(html, /\/voor\/werknemer/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${WERKNEMER_PATH}`));
        assert.equal((xml.match(new RegExp(WERKNEMER_SLUG, 'g')) || []).length, 1);
        for (const slug of RESERVED_SLUGS) {
            assert.notEqual(slug, WERKNEMER_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const NADELEN_SLUG = 'nadelen-arbeidsdeskundig-onderzoek';
const NADELEN_PATH = '/kennisbank/' + NADELEN_SLUG;
const NADELEN_RESERVED = [
    'tips-werknemer-arbeidsdeskundig-onderzoek',
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'kosten-arbeidsdeskundig-onderzoek',
    'fml-izp-lezen-belastbaarheid',
    'wat-doet-arbeidsdeskundige',
    'voorbereiden-gesprek-arbeidsdeskundige',
    'passende-arbeid',
    'psychische-klachten-werkhervatting',
    'werkplekaanpassingen-subsidie',
    'mediation-arbeidsconflict',
];

describe('kennisbank article: nadelen arbeidsdeskundig onderzoek', () => {
    it('serves unique investigation-inside article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + NADELEN_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Nadelen van een arbeidsdeskundig onderzoek \(en hoe je ze kleiner maakt\) — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Nadelen van een arbeidsdeskundig onderzoek: wat wringt in FML\/IZP, rapportkeuzes en het gesprek. Hoe je ze kleiner maakt. Offerte of kennismaking.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${NADELEN_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Nadelen van een arbeidsdeskundig onderzoek (en hoe je ze kleiner maakt)');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Nadelen van een arbeidsdeskundig onderzoek<\/h2>/);
        assert.match(body, /nadelen arbeidsdeskundig onderzoek/);
        assert.match(body, /binnen het onderzoek zelf/);
        assert.match(body, /Rapportkeuzes die als nadeel voelen/);
        assert.match(body, /Gespreksdynamiek/);
        assert.match(body, /Hoe voorbereiding die nadelen kleiner maakt/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /papieren werkelijkheid/);
        assert.doesNotMatch(body, /kille keuring/);
        assert.doesNotMatch(body, /mokerslag/);
        assert.doesNotMatch(body, /verplicht nummertje/);
        assert.doesNotMatch(body, /onmisbare waarde van de échte expert/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /nadelen arbeidsdeskundig onderzoek/i);
        assert.match(firstWords, /nadelen van een arbeidsdeskundig onderzoek/i);

        assert.match(html, /kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/passende-arbeid/);
        assert.match(html, /kennisbank\/fml-izp-lezen-belastbaarheid/);
        assert.match(html, /kennisbank\/tips-werknemer-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${NADELEN_PATH}`));
        assert.equal((xml.match(new RegExp(NADELEN_SLUG, 'g')) || []).length, 1);
        for (const slug of NADELEN_RESERVED) {
            assert.notEqual(slug, NADELEN_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const RIV_BA_SLUG = 'riv-toets-bedrijfsarts-leidend';
const RIV_BA_PATH = '/kennisbank/' + RIV_BA_SLUG;
const RIV_BA_RESERVED = [
    'nadelen-arbeidsdeskundig-onderzoek',
    'tips-werknemer-arbeidsdeskundig-onderzoek',
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'kosten-arbeidsdeskundig-onderzoek',
    'fml-izp-lezen-belastbaarheid',
    'wat-doet-arbeidsdeskundige',
    'voorbereiden-gesprek-arbeidsdeskundige',
    'passende-arbeid',
    'psychische-klachten-werkhervatting',
    'werkplekaanpassingen-subsidie',
    'mediation-arbeidsconflict',
];

describe('kennisbank article: RIV-toets bedrijfsarts leidend', () => {
    it('serves unique actualiteit article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + RIV_BA_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>RIV-toets: bedrijfsarts leidend — wat betekent dat voor een arbeidsdeskundig onderzoek\? — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="RIV-toets: bedrijfsarts leidend \(wetsvoorstel 27 maart 2026\)\. Wat verandert voor het re-integratieverslag, wat AD nog onderbouwt\. Plan een onderzoek\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${RIV_BA_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'RIV-toets: bedrijfsarts leidend — wat betekent dat voor een arbeidsdeskundig onderzoek?');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>RIV-toets: bedrijfsarts leidend — wat betekent dat voor een arbeidsdeskundig onderzoek\?<\/h2>/);
        assert.match(body, /RIV-toets/);
        assert.match(body, /bedrijfsarts leidend/);
        assert.match(body, /wetsvoorstel/);
        assert.match(body, /voorgestelde wetgeving/);
        assert.match(body, /geen geldend recht/);
        assert.match(body, /re-integratieverslag/);
        assert.match(body, /27 maart 2026/);
        assert.match(body, /1 januari 2028/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /online of fysiek/i);
        assert.doesNotMatch(body, /keuzehulp/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /RIV-toets/);
        assert.match(firstWords, /bedrijfsarts leidend/);

        assert.match(html, /kennisbank\/verplicht-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/arbeidsdeskundig-onderzoek-na-1-jaar-ziekte/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/fml-izp-lezen-belastbaarheid/);
        assert.match(html, /kennisbank\/riv-toets/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${RIV_BA_PATH}`));
        assert.equal((xml.match(new RegExp(RIV_BA_SLUG, 'g')) || []).length, 1);
        for (const slug of RIV_BA_RESERVED) {
            assert.notEqual(slug, RIV_BA_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});
