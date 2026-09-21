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

const BESLISTERMIJN_SLUG = 'beslistermijn-wia-16-weken';
const BESLISTERMIJN_PATH = '/kennisbank/' + BESLISTERMIJN_SLUG;
const BESLISTERMIJN_RESERVED = [
    'riv-toets-bedrijfsarts-leidend',
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

describe('kennisbank article: beslistermijn WIA 16 weken', () => {
    it('serves unique actualiteit article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + BESLISTERMIJN_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Beslistermijn WIA 16 weken: dossier UWV-proof terwijl je wacht — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Beslistermijn WIA 16 weken: wat de wacht na de aanvraag betekent, hoe je het dossier UWV-proof houdt, en waarom een snel AD-rapport helpt. Offerte.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${BESLISTERMIJN_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Beslistermijn WIA 16 weken: dossier UWV-proof terwijl je wacht');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Beslistermijn WIA 16 weken: dossier UWV-proof terwijl je wacht<\/h2>/);
        assert.match(body, /beslistermijn WIA 16 weken/);
        assert.match(body, /ná ontvangst van de WIA-aanvraag/);
        assert.match(body, /1 januari 2026/);
        assert.match(body, /tijdelijk 16 weken/);
        assert.match(body, /ontvangstbevestiging/);
        assert.match(body, /voorschot/);
        assert.match(body, /2 tot 5 weken/);
        assert.match(body, /verkort de beslistermijn van UWV niet/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /online of fysiek/i);
        assert.doesNotMatch(body, /keuzehulp/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /beslistermijn WIA 16 weken/i);

        assert.match(html, /kennisbank\/arbeidsdeskundig-onderzoek-na-1-jaar-ziekte/);
        assert.match(html, /kennisbank\/verplicht-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/riv-toets/);
        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/fml-izp-lezen-belastbaarheid/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${BESLISTERMIJN_PATH}`));
        assert.equal((xml.match(new RegExp(BESLISTERMIJN_SLUG, 'g')) || []).length, 1);
        for (const slug of BESLISTERMIJN_RESERVED) {
            assert.notEqual(slug, BESLISTERMIJN_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const SECOND_OPINION_SLUG = 'second-opinion-arbeidsdeskundige';
const SECOND_OPINION_PATH = '/kennisbank/' + SECOND_OPINION_SLUG;
const SECOND_OPINION_RESERVED = [
    'beslistermijn-wia-16-weken',
    'riv-toets-bedrijfsarts-leidend',
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

describe('kennisbank article: second opinion arbeidsdeskundige', () => {
    it('serves unique commercial article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + SECOND_OPINION_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Second opinion arbeidsdeskundige: wanneer twijfel terecht is — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Second opinion arbeidsdeskundige: wanneer twijfel terecht is, wat het wel en niet is, proces en relatie tot UWV. Vraag een offerte of kennismaking.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${SECOND_OPINION_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Second opinion arbeidsdeskundige: wanneer twijfel terecht is');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Second opinion arbeidsdeskundige: wanneer twijfel terecht is<\/h2>/);
        assert.match(body, /second opinion arbeidsdeskundige/);
        assert.match(body, /Wanneer twijfel terecht is/);
        assert.match(body, /Wat een second opinion wel en niet is/);
        assert.match(body, /deskundigenoordeel/);
        assert.match(body, /eerste arbeidsdeskundig onderzoek/);
        assert.match(body, /Hoe het proces loopt/);
        assert.match(body, /Relatie tot UWV/);
        assert.match(body, /aanvullend bewijs/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /online of fysiek/i);
        assert.doesNotMatch(body, /keuzehulp/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /second opinion arbeidsdeskundige/i);

        assert.match(html, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(html, /kennisbank\/nadelen-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/verplicht-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/tips-werknemer-arbeidsdeskundig-onderzoek/);
        assert.match(html, /kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${SECOND_OPINION_PATH}`));
        assert.equal((xml.match(new RegExp(SECOND_OPINION_SLUG, 'g')) || []).length, 1);
        for (const slug of SECOND_OPINION_RESERVED) {
            assert.notEqual(slug, SECOND_OPINION_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const GIDS_SLUG = 'arbeidsdeskundig-onderzoek-gids';
const GIDS_PATH = '/kennisbank/' + GIDS_SLUG;
const GIDS_CLUSTER = [
    'wat-doet-arbeidsdeskundige',
    'fml-izp-lezen-belastbaarheid',
    'fml-izp-hr-beslissen-actualiseren',
    'belastbaarheid-verouderd-nieuwe-fml-izp',
    'arbeidsdeskundig-rapport-voorbeeld',
    'arbeidsdeskundig-rapport-checklist',
    'kosten-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'verplicht-arbeidsdeskundig-onderzoek',
    'tips-werknemer-arbeidsdeskundig-onderzoek',
    'nadelen-arbeidsdeskundig-onderzoek',
    'riv-toets-bedrijfsarts-leidend',
    'beslistermijn-wia-16-weken',
    'wia-aanvraag-parallel-spoor-2',
    'spoor-2-zonder-spoor-1-afgerond',
    'second-opinion-arbeidsdeskundige',
    'deskundigenoordeel-vs-arbeidsdeskundig-onderzoek',
    'voorbereiden-gesprek-arbeidsdeskundige',
    'passende-arbeid',
];

describe('kennisbank hub: gids arbeidsdeskundig onderzoek', () => {
    it('serves a unique pillar page with SEO tags and crawlable cluster links', async () => {
        const res = await fetch(base + GIDS_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Alles over arbeidsdeskundig onderzoek: de gids — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Gids arbeidsdeskundig onderzoek: wat het is, of het moet, timing, kosten, werknemersrechten en UWV\. Links naar de diepte-artikelen\. Offerte of aanmelden\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${GIDS_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Alles over arbeidsdeskundig onderzoek: de gids');
        assert.notEqual(h1Match[1], 'Arbeidsdeskundig onderzoek. Vanaf €1.095,-.');
        assert.notEqual(h1Match[1], 'Alles over arbeidsdeskundig onderzoek');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Alles over arbeidsdeskundig onderzoek: de gids<\/h2>/);
        assert.match(body, /gids arbeidsdeskundig onderzoek/);
        assert.match(body, /kaart van het cluster/);
        assert.match(body, /Wat het onderzoek is — en wat niet/);
        assert.match(body, /Moet het, wanneer, en wat kost het/);
        assert.match(body, /Als je werknemer bent/);
        assert.match(body, /Als het wringt of je twijfelt/);
        assert.match(body, /Richting UWV: RIV en de WIA-wacht/);
        assert.match(body, /matchvermogen\.nl/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /Vanaf €1\.095/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 80).join(' ');
        assert.match(firstWords, /gids arbeidsdeskundig onderzoek/i);
        assert.doesNotMatch(firstWords, /Binnen 24 uur opgepakt/);

        for (const slug of GIDS_CLUSTER) {
            const hrefRe = new RegExp(`<a[^>]+href="/kennisbank/${slug}"`);
            assert.match(body, hrefRe, `hub missing crawlable href to ${slug}`);
        }

        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
    });

    it('is listed once in sitemap.xml and does not collide with cluster slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${GIDS_PATH}`));
        assert.equal((xml.match(new RegExp(GIDS_SLUG, 'g')) || []).length, 1);
        for (const slug of GIDS_CLUSTER) {
            assert.notEqual(slug, GIDS_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });

    it('is linked lightly from homepage and kennisbank listing', async () => {
        const home = await fetch(base + '/');
        assert.equal(home.status, 200);
        const homeHtml = await home.text();
        assert.match(homeHtml, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"/);

        const listing = await fetch(base + '/kennisbank');
        assert.equal(listing.status, 200);
        const listingHtml = await listing.text();
        assert.match(listingHtml, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"/);
        assert.match(listingHtml, /<h1[^>]*>Alles over arbeidsdeskundig onderzoek<\/h1>/);
    });
});

const RAPPORT_SLUG = 'arbeidsdeskundig-rapport-voorbeeld';
const RAPPORT_PATH = '/kennisbank/' + RAPPORT_SLUG;
const RAPPORT_RESERVED = [
    'arbeidsdeskundig-onderzoek-gids',
    'wat-doet-arbeidsdeskundige',
    'fml-izp-lezen-belastbaarheid',
    'kosten-arbeidsdeskundig-onderzoek',
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'tips-werknemer-arbeidsdeskundig-onderzoek',
    'nadelen-arbeidsdeskundig-onderzoek',
    'riv-toets-bedrijfsarts-leidend',
    'beslistermijn-wia-16-weken',
    'second-opinion-arbeidsdeskundige',
    'voorbereiden-gesprek-arbeidsdeskundige',
    'passende-arbeid',
    'arbeidsdeskundige-vs-bedrijfsarts-casemanager',
];

describe('kennisbank article: wat zit er in een arbeidsdeskundig rapport', () => {
    it('expands the rapport stub into a unique asset article with SEO tags and schema', async () => {
        const res = await fetch(base + RAPPORT_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Wat zit er in een arbeidsdeskundig rapport\? Sectie voor sectie, wat UWV verwacht — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Wat zit er in een arbeidsdeskundig rapport\? Sectie voor sectie, wat UWV verwacht, en wat er níet in staat \(geen diagnose\)\. Offerte of kennismaking\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${RAPPORT_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Wat zit er in een arbeidsdeskundig rapport? Sectie voor sectie, wat UWV verwacht');
        assert.notEqual(h1Match[1], 'Wat staat er in een arbeidsdeskundig rapport? Opbouw en onderdelen');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Wat zit er in een arbeidsdeskundig rapport\? Sectie voor sectie, wat UWV verwacht<\/h2>/);
        assert.match(body, /wat zit er in een arbeidsdeskundig rapport/i);
        assert.match(body, /zonder echte cliëntgegevens/);
        assert.match(body, /Sectie 1 — Vraagstelling/);
        assert.match(body, /Sectie 2 — Geraadpleegde bronnen/);
        assert.match(body, /Sectie 3 — Analyse/);
        assert.match(body, /Sectie 4 — Conclusie/);
        assert.match(body, /Sectie 5 — Advies/);
        assert.match(body, /Wat UWV verwacht te zien/);
        assert.match(body, /Wat er níet in het rapport staat/);
        assert.match(body, /Geen diagnose/);
        assert.match(body, /matchvermogen\.nl/);
        assert.match(body, /<table/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /online of fysiek/i);
        assert.doesNotMatch(body, /Bram/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /wat zit er in een arbeidsdeskundig rapport/i);

        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"/);
        assert.match(body, /href="\/kennisbank\/fml-izp-lezen-belastbaarheid"/);
        assert.match(body, /href="\/kennisbank\/wat-doet-arbeidsdeskundige"/);
        assert.match(body, /href="\/kennisbank\/kosten-arbeidsdeskundig-onderzoek"/);
        assert.match(body, /href="\/kennisbank\/verplicht-arbeidsdeskundig-onderzoek"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);

        const pages = [];
        const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(html))) {
            const block = JSON.parse(m[1]);
            if (block['@type'] === 'FAQPage') pages.push(block);
        }
        assert.equal(pages.length, 1);
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.ok(names.some((q) => /Wat zit er in een arbeidsdeskundig rapport/.test(q)));
        assert.ok(names.some((q) => /diagnose/i.test(q)));
        assert.ok(names.some((q) => /voorbeeldrapport|cliëntgegevens/.test(q)));
        assert.ok(!names.some((q) => q === 'Kan het onderzoek ook fysiek?'));
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${RAPPORT_PATH}`));
        assert.equal((xml.match(new RegExp(RAPPORT_SLUG, 'g')) || []).length, 1);
        for (const slug of RAPPORT_RESERVED) {
            assert.notEqual(slug, RAPPORT_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const VEROUDERD_SLUG = 'belastbaarheid-verouderd-nieuwe-fml-izp';
const VEROUDERD_PATH = '/kennisbank/' + VEROUDERD_SLUG;
const VEROUDERD_RESERVED = [
    'arbeidsdeskundig-rapport-voorbeeld',
    'arbeidsdeskundig-onderzoek-gids',
    'fml-izp-lezen-belastbaarheid',
    'fml-uitleg',
    'voorbereiden-gesprek-arbeidsdeskundige',
    'wat-doet-arbeidsdeskundige',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'verplicht-arbeidsdeskundig-onderzoek',
    'kosten-arbeidsdeskundig-onderzoek',
    'nadelen-arbeidsdeskundig-onderzoek',
    'second-opinion-arbeidsdeskundige',
    'riv-toets',
    'passende-arbeid',
    'arbeidsdeskundige-vs-bedrijfsarts-casemanager',
];

describe('kennisbank article: belastbaarheid verouderd nieuwe FML/IZP', () => {
    it('serves unique article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + VEROUDERD_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Belastbaarheid verouderd: wanneer start je geen arbeidsdeskundig onderzoek zonder nieuwe FML\/IZP\? — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Belastbaarheid verouderd\? Wanneer een FML of IZP te oud is om een arbeidsdeskundig onderzoek te starten\. Wie een nieuwe vraagt\. Offerte of aanmelden\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${VEROUDERD_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Belastbaarheid verouderd: wanneer start je geen arbeidsdeskundig onderzoek zonder nieuwe FML/IZP?');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Belastbaarheid verouderd: wanneer start je geen arbeidsdeskundig onderzoek zonder nieuwe FML\/IZP\?<\/h2>/);
        assert.match(body, /belastbaarheid verouderd/);
        assert.match(body, /geen arbeidsdeskundig onderzoek zonder nieuwe FML/);
        assert.match(body, /Wat actueel in de praktijk betekent/);
        assert.match(body, /geen vaste wettelijke geldigheidsduur/);
        assert.match(body, /Wanneer je wel even wacht/);
        assert.match(body, /Wie vraagt een nieuwe FML of IZP/);
        assert.match(body, /bedrijfsarts/);
        assert.match(body, /Wat je riskeert als je toch start/);
        assert.match(body, /RIV-toets/);
        assert.match(body, /matchvermogen\.nl/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /wettelijke houdbaarheid van \d+ (weken|maanden)/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /belastbaarheid verouderd/i);
        assert.match(firstWords, /arbeidsdeskundig onderzoek/i);
        assert.match(firstWords, /FML of IZP/i);

        assert.match(body, /href="\/kennisbank\/fml-izp-lezen-belastbaarheid"/);
        assert.match(body, /href="\/kennisbank\/voorbereiden-gesprek-arbeidsdeskundige"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);

        const pages = [];
        const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(html))) {
            const block = JSON.parse(m[1]);
            if (block['@type'] === 'FAQPage') pages.push(block);
        }
        assert.equal(pages.length, 1);
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.ok(names.some((q) => /te oud voor een arbeidsdeskundig onderzoek/.test(q)));
        assert.ok(names.some((q) => /actuele FML of IZP/.test(q)));
        assert.ok(names.some((q) => /Wie vraagt een nieuwe FML/.test(q)));
        assert.ok(!names.some((q) => q === 'Kan het onderzoek ook fysiek?'));
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${VEROUDERD_PATH}`));
        assert.equal((xml.match(new RegExp(VEROUDERD_SLUG, 'g')) || []).length, 1);
        for (const slug of VEROUDERD_RESERVED) {
            assert.notEqual(slug, VEROUDERD_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const PARALLEL_SLUG = 'wia-aanvraag-parallel-spoor-2';
const PARALLEL_PATH = '/kennisbank/' + PARALLEL_SLUG;
const PARALLEL_RESERVED = [
    'wia-aanvraag',
    'spoor2',
    'spoor2-kosten',
    'beslistermijn-wia-16-weken',
    'belastbaarheid-verouderd-nieuwe-fml-izp',
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'arbeidsdeskundig-onderzoek-gids',
    'arbeidsdeskundig-rapport-voorbeeld',
    'riv-toets',
    'riv-toets-bedrijfsarts-leidend',
    'wat-doet-arbeidsdeskundige',
    'kosten-arbeidsdeskundig-onderzoek',
];

describe('kennisbank article: WIA-aanvraag parallel aan spoor 2', () => {
    it('serves unique article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + PARALLEL_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>WIA-aanvraag parallel aan spoor 2: wie coördineert wat\? — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="WIA-aanvraag parallel aan spoor 2: wie doet wat \(werkgever, werknemer, AD, UWV, coach\), valkuilen, en hoe je het dossier bij elkaar houdt\. Offerte\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${PARALLEL_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'WIA-aanvraag parallel aan spoor 2: wie coördineert wat?');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>WIA-aanvraag parallel aan spoor 2: wie coördineert wat\?<\/h2>/);
        assert.match(body, /WIA-aanvraag/);
        assert.match(body, /spoor 2/);
        assert.match(body, /wie coördineert wat/);
        assert.match(body, /Waarom ze vaak tegelijk lopen/);
        assert.match(body, /Wie doet wat/);
        assert.match(body, /Coördinatievalkuilen/);
        assert.match(body, /Wat HR en casemanagers wél doen/);
        assert.match(body, /werkgever/i);
        assert.match(body, /werknemer/i);
        assert.match(body, /arbeidsdeskundige/i);
        assert.match(body, /UWV/);
        assert.match(body, /coach/i);
        assert.match(body, /104 weken/);
        assert.match(body, /week 88/);
        assert.match(body, /<table/);
        assert.match(body, /matchvermogen\.nl/);
        assert.match(body, /bestmatchbv\.nl/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /online of fysiek/i);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /WIA-aanvraag/i);
        assert.match(firstWords, /spoor 2/i);
        assert.match(firstWords, /wie coördineert wat/i);

        assert.match(body, /href="\/kennisbank\/beslistermijn-wia-16-weken"/);
        assert.match(body, /href="\/kennisbank\/spoor2"/);
        assert.match(body, /href="\/kennisbank\/verplicht-arbeidsdeskundig-onderzoek"/);
        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-na-1-jaar-ziekte"/);
        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"/);
        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-rapport-voorbeeld"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);

        const pages = [];
        const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(html))) {
            const block = JSON.parse(m[1]);
            if (block['@type'] === 'FAQPage') pages.push(block);
        }
        assert.equal(pages.length, 1);
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.ok(names.some((q) => /parallel lopen/.test(q)));
        assert.ok(names.some((q) => /Wie coördineert wat/.test(q)));
        assert.ok(names.some((q) => /spoor 2 stoppen/.test(q)));
        assert.ok(!names.some((q) => q === 'Kan het onderzoek ook fysiek?'));
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${PARALLEL_PATH}`));
        assert.equal((xml.match(new RegExp(PARALLEL_SLUG, 'g')) || []).length, 1);
        for (const slug of PARALLEL_RESERVED) {
            assert.notEqual(slug, PARALLEL_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const EARLY_SPOOR2_SLUG = 'spoor-2-zonder-spoor-1-afgerond';
const EARLY_SPOOR2_PATH = '/kennisbank/' + EARLY_SPOOR2_SLUG;
const EARLY_SPOOR2_RESERVED = [
    'wia-aanvraag-parallel-spoor-2',
    'spoor2',
    'spoor2-kosten',
    'spoor1a-spoor1b',
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'arbeidsdeskundig-onderzoek-gids',
    'wat-doet-arbeidsdeskundige',
    'wia-aanvraag',
    'poortwachter-tijdlijn',
    'jaarsevaluatie',
    'kosten-arbeidsdeskundig-onderzoek',
];

describe('kennisbank article: spoor 2 zonder spoor 1 afgerond', () => {
    it('serves unique article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + EARLY_SPOOR2_PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Spoor 2 starten zonder spoor 1 afgerond: wanneer mag dat wél\? — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Spoor 2 starten zonder spoor 1 afgerond: wanneer dat mag, de mythe van eerst afsluiten, 1 jaar plus 6 weken, en welke documentatie blijft. Offerte.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${EARLY_SPOOR2_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Spoor 2 starten zonder spoor 1 afgerond: wanneer mag dat wél?');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Spoor 2 starten zonder spoor 1 afgerond: wanneer mag dat wél\?<\/h2>/);
        assert.match(body, /spoor 2/);
        assert.match(body, /spoor 1 afgerond/);
        assert.match(body, /wanneer mag dat wél/i);
        assert.match(body, /De mythe: eerst spoor 1 afgerond/);
        assert.match(body, /Wanneer het wél mag/);
        assert.match(body, /1 jaar plus 6 weken/);
        assert.match(body, /Documentatie die je wél nodig hebt/);
        assert.match(body, /Valkuilen/);
        assert.match(body, /Wat HR en casemanagers wél doen/);
        assert.match(body, /eerstejaars-evaluatie/);
        assert.match(body, /<table/);
        assert.match(body, /bestmatchbv\.nl/);
        assert.doesNotMatch(body, /matchvermogen\.nl/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /online of fysiek/i);
        assert.doesNotMatch(body, /—/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /Spoor 2 starten/i);
        assert.match(firstWords, /spoor 1 afgerond/i);
        assert.match(firstWords, /wanneer mag dat wél/i);

        assert.match(body, /href="\/kennisbank\/spoor2"/);
        assert.match(body, /href="\/kennisbank\/wia-aanvraag-parallel-spoor-2"/);
        assert.match(body, /href="\/kennisbank\/verplicht-arbeidsdeskundig-onderzoek"/);
        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-na-1-jaar-ziekte"/);
        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"/);
        assert.match(body, /href="\/kennisbank\/wat-doet-arbeidsdeskundige"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);

        const pages = [];
        const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(html))) {
            const block = JSON.parse(m[1]);
            if (block['@type'] === 'FAQPage') pages.push(block);
        }
        assert.equal(pages.length, 1);
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.ok(names.some((q) => /zonder dat spoor 1 is afgerond/.test(q)));
        assert.ok(names.some((q) => /1 jaar plus 6 weken/.test(q)));
        assert.ok(names.some((q) => /documentatie/.test(q)));
        assert.ok(names.some((q) => /mythe/.test(q)));
        assert.ok(names.some((q) => /valkuilen/.test(q)));
        assert.ok(!names.some((q) => q === 'Kan het onderzoek ook fysiek?'));
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${EARLY_SPOOR2_PATH}`));
        assert.equal((xml.match(new RegExp(EARLY_SPOOR2_SLUG, 'g')) || []).length, 1);
        for (const slug of EARLY_SPOOR2_RESERVED) {
            assert.notEqual(slug, EARLY_SPOOR2_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const GOOGLEBOT = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } };

describe('kennisbank redirect: /kennisbank/second-opinion', () => {
    it('301s the short slug to second-opinion-arbeidsdeskundige', async () => {
        const res = await fetch(base + '/kennisbank/second-opinion', { redirect: 'manual' });
        assert.equal(res.status, 301);
        const location = res.headers.get('location') || '';
        assert.match(location, /\/kennisbank\/second-opinion-arbeidsdeskundige$/);
    });

    it('does not list the short slug in sitemap.xml', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.doesNotMatch(xml, /kennisbank\/second-opinion</);
        assert.match(xml, /kennisbank\/second-opinion-arbeidsdeskundige</);
    });
});

const VS_SLUG = 'deskundigenoordeel-vs-arbeidsdeskundig-onderzoek';
const VS_PATH = '/kennisbank/' + VS_SLUG;
const VS_RESERVED = [
    'deskundigenoordeel',
    'second-opinion-arbeidsdeskundige',
    'arbeidsdeskundig-onderzoek-gids',
    'riv-toets',
    'wat-doet-arbeidsdeskundige',
    'verplicht-arbeidsdeskundig-onderzoek',
    'belastbaarheid-verouderd-nieuwe-fml-izp',
    'fml-izp-hr-beslissen-actualiseren',
];

describe('kennisbank article: deskundigenoordeel vs arbeidsdeskundig onderzoek', () => {
    it('serves unique comparative article HTML with SEO tags and schema', async () => {
        const res = await fetch(base + VS_PATH, GOOGLEBOT);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Deskundigenoordeel vs arbeidsdeskundig onderzoek: wanneer welk instrument\? — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Deskundigenoordeel vs arbeidsdeskundig onderzoek: wanneer kies je welk instrument, wanneer beide, wanneer geen\. Voor HR en casemanagers\. Offerte of sparren\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${VS_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Deskundigenoordeel vs arbeidsdeskundig onderzoek: wanneer welk instrument?');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Deskundigenoordeel vs arbeidsdeskundig onderzoek: wanneer welk instrument\?<\/h2>/);
        assert.match(body, /deskundigenoordeel vs arbeidsdeskundig onderzoek/i);
        assert.match(body, /Twee instrumenten, twee vragen/);
        assert.match(body, /Wanneer kies je een arbeidsdeskundig onderzoek/);
        assert.match(body, /Wanneer kies je een deskundigenoordeel/);
        assert.match(body, /Wanneer beide, en in welke volgorde/);
        assert.match(body, /Wanneer geen van beide/);
        assert.match(body, /Mythes die de keuze vertroebelen/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /—/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 100).join(' ');
        assert.match(firstWords, /deskundigenoordeel vs arbeidsdeskundig onderzoek/i);

        assert.match(body, /href="\/kennisbank\/deskundigenoordeel"/);
        assert.match(body, /href="\/kennisbank\/second-opinion-arbeidsdeskundige"/);
        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"/);
        assert.match(body, /href="\/kennisbank\/riv-toets"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
        assert.match(html, /<div class="view active" id="view-artikel">/);
        assert.match(html, /<div class="view" id="view-home" hidden>/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${VS_PATH}`));
        assert.equal((xml.match(new RegExp(VS_SLUG, 'g')) || []).length, 1);
        for (const slug of VS_RESERVED) {
            assert.notEqual(slug, VS_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const FML_HR_SLUG = 'fml-izp-hr-beslissen-actualiseren';
const FML_HR_PATH = '/kennisbank/' + FML_HR_SLUG;
const FML_HR_RESERVED = [
    'fml-izp-lezen-belastbaarheid',
    'belastbaarheid-verouderd-nieuwe-fml-izp',
    'fml-uitleg',
    'wat-doet-arbeidsdeskundige',
    'arbeidsdeskundig-onderzoek-gids',
    'arbeidsdeskundige-vs-bedrijfsarts-casemanager',
    'deskundigenoordeel-vs-arbeidsdeskundig-onderzoek',
    'riv-toets',
    'voorbereiden-gesprek-arbeidsdeskundige',
];

describe('kennisbank article: FML/IZP HR beslissen actualiseren', () => {
    it('serves complementary HR decision article with SEO tags and schema', async () => {
        const res = await fetch(base + FML_HR_PATH, GOOGLEBOT);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>FML of IZP binnen: wat mag HR beslissen, en wanneer actualiseren\? — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="FML of IZP binnen\? Wat HR mag afleiden voor vervolgstappen, wanneer actualiseren, en wanneer je start, wacht of de bedrijfsarts vraagt\. Sparren of offerte\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${FML_HR_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'FML of IZP binnen: wat mag HR beslissen, en wanneer actualiseren?');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>FML of IZP binnen: wat mag HR beslissen, en wanneer actualiseren\?<\/h2>/);
        assert.match(body, /Wat HR wél mag afleiden/);
        assert.match(body, /Wat HR niet mag afleiden/);
        assert.match(body, /Drie beslismomenten: starten, wachten, bedrijfsarts/);
        assert.match(body, /Wanneer de FML of het IZP te oud is/);
        assert.match(body, /Van document naar volgende stap/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /—/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 80).join(' ');
        assert.match(firstWords, /FML of het IZP ligt op je bureau/);

        assert.match(body, /href="\/kennisbank\/fml-izp-lezen-belastbaarheid"/);
        assert.match(body, /href="\/kennisbank\/belastbaarheid-verouderd-nieuwe-fml-izp"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /calendly\.com\/matchvermogen\/call-15-min/);
        assert.match(html, /<div class="view active" id="view-artikel">/);
        assert.match(html, /<div class="view" id="view-home" hidden>/);
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${FML_HR_PATH}`));
        assert.equal((xml.match(new RegExp(FML_HR_SLUG, 'g')) || []).length, 1);
        for (const slug of FML_HR_RESERVED) {
            assert.notEqual(slug, FML_HR_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

const CHECKLIST_SLUG = 'arbeidsdeskundig-rapport-checklist';
const CHECKLIST_PATH = '/kennisbank/' + CHECKLIST_SLUG;
const CHECKLIST_RESERVED = [
    'arbeidsdeskundig-rapport-voorbeeld',
    'riv-toets',
    'riv-toets-bedrijfsarts-leidend',
    'spoor-2-zonder-spoor-1-afgerond',
    'wia-aanvraag-parallel-spoor-2',
    'belastbaarheid-verouderd-nieuwe-fml-izp',
    'arbeidsdeskundig-onderzoek-gids',
    'fml-izp-hr-beslissen-actualiseren',
    'deskundigenoordeel-vs-arbeidsdeskundig-onderzoek',
];

describe('kennisbank article: arbeidsdeskundig rapport checklist rechtspraak', () => {
    it('serves complementary checklist article with SEO tags, case law and schema', async () => {
        const res = await fetch(base + CHECKLIST_PATH, GOOGLEBOT);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, /<title>Arbeidsdeskundig rapport: checklist uit recente rechtspraak — arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<meta name="description" content="Checklist arbeidsdeskundig rapport: aansluiting op de bedrijfsarts, documenteer afwijking, onderbouw start spoor 2\. Recente rechtspraak 2026\. Offerte of aanmelden\.">/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${CHECKLIST_PATH}">`));
        assert.match(html, /"@type":"Article"/);
        assert.match(html, /"@type":"FAQPage"/);

        const h1Match = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.ok(h1Match, 'SSR H1 missing');
        assert.equal(h1Match[1], 'Arbeidsdeskundig rapport: checklist uit recente rechtspraak');

        const marker = 'id="artikel-body">';
        const bodyStart = html.indexOf(marker);
        assert.notEqual(bodyStart, -1);
        const after = html.slice(bodyStart + marker.length);
        const bodyEnd = after.indexOf('</div>');
        const body = after.slice(0, bodyEnd);
        assert.match(body, /<h2>Arbeidsdeskundig rapport: checklist uit recente rechtspraak<\/h2>/);
        assert.match(body, /Drie kwaliteitspoorten|drie kwaliteitspoorten/);
        assert.match(body, /Aansluiting op (het oordeel van )?de bedrijfsarts/);
        assert.match(body, /Documenteer wanneer de arbeidsdeskundige afwijkt/);
        assert.match(body, /Onderbouw de start van spoor 2/);
        assert.match(body, /ECLI:NL:CRVB:2026:834/);
        assert.match(body, /ECLI:NL:RBGEL:2026:6466/);
        assert.match(body, /deeplink\.rechtspraak\.nl\/uitspraak\?id=ECLI:NL:CRVB:2026:834/);
        assert.match(body, /deeplink\.rechtspraak\.nl\/uitspraak\?id=ECLI:NL:RBGEL:2026:6466/);
        assert.match(body, /eerste aanleg/);
        assert.match(body, /geen juridisch advies/);
        assert.match(body, /faalpuntenlijst/);
        assert.doesNotMatch(body, /Sectie 1/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /Doe de gratis keuzehulp/);
        assert.doesNotMatch(body, /—/);

        const firstWords = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 80).join(' ');
        assert.match(firstWords, /arbeidsdeskundig rapport/i);

        assert.match(body, /href="\/kennisbank\/arbeidsdeskundig-rapport-voorbeeld"/);
        assert.match(body, /href="\/kennisbank\/riv-toets"/);
        assert.match(body, /href="\/kennisbank\/spoor-2-zonder-spoor-1-afgerond"/);
        assert.match(html, /\/offerte-aanvragen/);
        assert.match(html, /\/aanmelden/);
        assert.match(html, /<div class="view active" id="view-artikel">/);
        assert.match(html, /<div class="view" id="view-home" hidden>/);

        const pages = [];
        const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(html))) {
            const block = JSON.parse(m[1]);
            if (block['@type'] === 'FAQPage') pages.push(block);
        }
        assert.equal(pages.length, 1);
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.ok(names.some((q) => /checklist voor een arbeidsdeskundig rapport/.test(q)));
        assert.ok(names.some((q) => /afwijken van de bedrijfsarts/.test(q)));
        assert.ok(names.some((q) => /spoor 2/.test(q)));
    });

    it('is listed once in sitemap.xml and does not collide with reserved slugs', async () => {
        const res = await fetch(base + '/sitemap.xml');
        assert.equal(res.status, 200);
        const xml = await res.text();
        assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com${CHECKLIST_PATH}`));
        assert.equal((xml.match(new RegExp(CHECKLIST_SLUG, 'g')) || []).length, 1);
        for (const slug of CHECKLIST_RESERVED) {
            assert.notEqual(slug, CHECKLIST_SLUG);
            assert.match(xml, new RegExp(`https://www\\.arbeidsdeskundig\\.com/kennisbank/${slug}`));
        }
    });
});

