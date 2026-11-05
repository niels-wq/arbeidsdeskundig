'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const PATHS = [
    '/voor/hr-adviseur',
    '/voor/werknemer',
    '/voor/casemanager',
    '/voor/wga-specialist',
    '/voor/directeur-eigenaar',
    '/voor/letselschadejurist',
];

const WGA_TITLE = 'Arbeidsdeskundig onderzoek WGA, ERD | Arbeidsdeskundig.com';
const WGA_META = 'Arbeidsdeskundig onderzoek WGA voor eigenrisicodragers: wanneer je het inzet, wat de arbeidsdeskundige onderzoekt en wat het rapport je oplevert.';
const WGA_H1 = 'Arbeidsdeskundig onderzoek WGA voor eigenrisicodragers';

const WGA_H2S = [
    'Wat is een arbeidsdeskundig onderzoek WGA?',
    'Wanneer zet een eigenrisicodrager het in?',
    'Wat onderzoekt de arbeidsdeskundige?',
    'Hoe verloopt het en wat ontvang je?',
    'Welke invloed heeft het op WGA-schadelast en de gedifferentieerde premie?',
    'Wat is het verschil tussen Ziektewet-ERD en WGA-ERD?',
    'Praktijkvoorbeelden',
    'Veelgestelde vragen',
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

function parseLd(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
    return blocks;
}

function personaView(html) {
    const start = html.indexOf('id="view-persona"');
    assert.notEqual(start, -1);
    const end = html.indexOf('<footer class="site">', start);
    assert.notEqual(end, -1);
    return html.slice(start, end);
}

function h2Texts(view) {
    return [...view.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
}

function words(view) {
    return view
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}

describe('SEO: /voor pages render their own content without JavaScript', () => {
    for (const path of PATHS) {
        it(`GET ${path} has one h1, at least 3 h2s and a link to /offerte-aanvragen`, async () => {
            const res = await fetch(base + path);
            assert.equal(res.status, 200);
            const html = await res.text();
            const view = personaView(html);

            assert.equal((html.match(/<h1\b/g) || []).length, 1, path);
            assert.match(view, /<h1\b[^>]*id="persona-titel">(?!Titel<)/);
            assert.doesNotMatch(view, /id="persona-intro"><\/p>/);
            const headings = h2Texts(view);
            assert.ok(headings.length >= 3, `${path} has ${headings.length} h2s: ${headings.join(' | ')}`);
            assert.match(view, /<a\b[^>]*\bhref="\/offerte-aanvragen"/);
            assert.match(view, /<a\b[^>]*\bhref="\/aanmelden"/);
            assert.match(view, /Praktijkvoorbeelden/);
            assert.ok(words(view).length >= 200, `${path} has only ${words(view).length} words in the view`);

            assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${path}">`));
            assert.equal(view.includes('\u2014'), false, path);
            assert.equal(view.includes('\u2013'), false, path);

            const crumbs = parseLd(html).filter((b) => b['@type'] === 'BreadcrumbList');
            assert.equal(crumbs.length, 1, path);
            assert.equal(crumbs[0].itemListElement[0].name, 'Home');
            assert.equal(crumbs[0].itemListElement[0].item, 'https://www.arbeidsdeskundig.com/');
            assert.equal(crumbs[0].itemListElement[1].item, 'https://www.arbeidsdeskundig.com' + path);
        });
    }

    it('hydrates each persona with its own intro and a practice example', async () => {
        const markers = {
            '/voor/hr-adviseur': ['meerdere verzuimdossiers', 'randje van een loonsanctie'],
            '/voor/werknemer': ['Je diagnose wordt nooit', 'Twijfel over de eigen functie'],
            '/voor/casemanager': ['spin in het web', 'Snel schakelen bij een complex dossier'],
            '/voor/directeur-eigenaar': ['vanaf €999,-', 'Een loonsanctie op tijd voorkomen'],
            '/voor/letselschadejurist': ['verlies aan verdienvermogen', 'Objectieve onderbouwing bij een geschil'],
        };
        for (const [path, phrases] of Object.entries(markers)) {
            const html = await (await fetch(base + path)).text();
            const view = personaView(html);
            for (const phrase of phrases) {
                assert.ok(view.includes(phrase), `${path} mist: ${phrase}`);
            }
        }
    });
});

describe('SEO: /voor/wga-specialist', () => {
    it('answers the WGA and ERD query with FAQ schema that matches the visible FAQ', async () => {
        const res = await fetch(base + '/voor/wga-specialist');
        assert.equal(res.status, 200);
        const html = await res.text();
        const view = personaView(html);

        assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], WGA_TITLE);
        assert.ok(WGA_TITLE.endsWith(' | Arbeidsdeskundig.com'));
        assert.ok(WGA_TITLE.length <= 60, String(WGA_TITLE.length));
        assert.equal(html.match(/<meta name="description" content="([^"]*)">/)[1], WGA_META);
        assert.ok(WGA_META.length >= 140 && WGA_META.length <= 160, String(WGA_META.length));
        assert.equal(view.match(/id="persona-titel">([^<]+)<\/h1>/)[1], WGA_H1);

        const headings = h2Texts(view);
        for (const heading of WGA_H2S) {
            assert.ok(headings.includes(heading), headings.join(' | '));
        }
        const first = words(view).slice(0, 80).join(' ');
        assert.match(first, /arbeidsdeskundig onderzoek WGA/i);
        assert.match(first, /eigenrisicodrager/i);

        for (const href of [
            '/kennisbank/arbeidsdeskundig-onderzoek-gids',
            '/kennisbank/maatmanloon-arbeidsdeskundige',
            '/kennisbank/spoor2',
            '/kennisbank/kosten-arbeidsdeskundig-onderzoek',
            '/kennisbank/erd',
            '/offerte-aanvragen',
            '/aanmelden',
        ]) {
            assert.match(view, new RegExp(`href="${href}"`));
        }
        assert.match(view, /tot 10 jaar/);
        assert.match(view, /Ziektewet-ERD/);
        assert.match(view, /WGA-ERD/);
        assert.match(view, /arbodienst/);
        assert.doesNotMatch(view, /matchvermogen\.nl/i);

        const faqs = parseLd(html).filter((b) => b['@type'] === 'FAQPage');
        assert.equal(faqs.length, 1);
        const list = view.slice(view.indexOf('id="persona-faq-list"'), view.indexOf('id="persona-links-wrap"'));
        const questions = [...list.matchAll(/<button class="accordion-head"[^>]*>([^<]+)<span/g)].map((m) => m[1]);
        const answers = [...list.matchAll(/<div class="accordion-body-inner">([^<]*)<\/div>/g)].map((m) => m[1]);
        assert.equal(questions.length, answers.length);
        assert.ok(questions.length >= 4);
        assert.equal(faqs[0].mainEntity.length, questions.length);
        faqs[0].mainEntity.forEach((item, i) => {
            assert.equal(item['@type'], 'Question');
            assert.equal(item.name, questions[i]);
            assert.equal(item.acceptedAnswer.text, answers[i]);
        });
    });
});
