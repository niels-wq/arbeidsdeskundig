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
    'kosten-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'verplicht-arbeidsdeskundig-onderzoek',
    'tips-werknemer-arbeidsdeskundig-onderzoek',
    'nadelen-arbeidsdeskundig-onderzoek',
    'riv-toets-bedrijfsarts-leidend',
    'beslistermijn-wia-16-weken',
    'second-opinion-arbeidsdeskundige',
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
