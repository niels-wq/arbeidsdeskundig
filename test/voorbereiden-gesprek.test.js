'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const PATH = '/kennisbank/voorbereiden-gesprek-arbeidsdeskundige';
const H1 = 'Gesprek met de arbeidsdeskundige: voorbereiden, vragen en verloop';
const TITLE = 'Gesprek met de arbeidsdeskundige: voorbereiden, vragen | Arbeidsdeskundig.com';
const META = 'Gesprek met de arbeidsdeskundige: verloop, vragen aan jou en je werkgever, en wat je doet als je niet bent gehoord. Vraag vrijblijvend een offerte.';

const CORE_ROUTES = [
    '/',
    '/kennisbank',
    '/offerte-aanvragen',
    '/aanmelden',
    '/rekentool',
    '/keuzehulp',
    '/veelgestelde-vragen',
    '/over-ons',
    '/voor/hr-adviseur',
    '/voor/werknemer',
    '/arbeidsdeskundige-met-tolk',
    PATH,
    '/kennisbank/tips-werknemer-arbeidsdeskundig-onderzoek',
    '/kennisbank/werknemer-zelf-aanvragen',
    '/kennisbank/arbeidsdeskundig-onderzoek-gids',
    '/kennisbank/deskundigenoordeel-vs-arbeidsdeskundig-onderzoek',
];

const H2S = [
    'Hoe verloopt het gesprek met de arbeidsdeskundige?',
    'Gesprek met de arbeidsdeskundige en de werkgever',
    'Neem dit mee',
    'Mag je iemand meenemen naar het gesprek?',
    'Hoe lang duurt het gesprek?',
    'Welke vragen stelt een arbeidsdeskundige?',
    'Geen gesprek met de arbeidsdeskundige gehad',
    'Gesprek tijdens de loondoorbetaling of bij de WIA',
    'Mag je het gesprek opnemen?',
    'Wat gebeurt er na het gesprek?',
    'Wat als je het niet eens bent met het rapport?',
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

function jsonLdBlocks(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
    return blocks;
}

function articleBody(html) {
    const marker = 'id="artikel-body">';
    const bodyStart = html.indexOf(marker);
    assert.notEqual(bodyStart, -1);
    const after = html.slice(bodyStart + marker.length);
    const bodyEnd = after.indexOf('</div>');
    return after.slice(0, bodyEnd);
}

function visibleFaq(html) {
    const start = html.indexOf('id="artikel-faq-list"');
    assert.notEqual(start, -1);
    const slice = html.slice(start, html.indexOf('id="artikel-gerelateerd"', start));
    const questions = [...slice.matchAll(/<button class="accordion-head"[^>]*>([^<]+)<span/g)].map((m) => m[1]);
    const answers = [...slice.matchAll(/<div class="accordion-body-inner">([^<]*)<\/div>/g)].map((m) => m[1]);
    assert.equal(questions.length, answers.length);
    return questions.map((q, i) => [q, answers[i]]);
}

describe('gesprek voorbereiden', () => {
    it('verdiept de bestaande URL met antwoord, H2s, FAQ en schema', async () => {
        const res = await fetch(base + PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.equal((html.match(/<h1\b/g) || []).length, 1);
        const h1 = html.match(/id="artikel-titel">([^<]+)<\/h1>/);
        assert.equal(h1[1], H1);
        assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], TITLE);
        const titleCore = TITLE.replace(/ \| Arbeidsdeskundig\.com$/, '');
        assert.ok(titleCore.length >= 50 && titleCore.length <= 60, titleCore);
        assert.ok(TITLE.endsWith(' | Arbeidsdeskundig.com'));

        const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
        assert.equal(desc, META);
        assert.ok(desc.length >= 140 && desc.length <= 155, String(desc.length));
        assert.match(html, /<link rel="canonical" href="https:\/\/www\.arbeidsdeskundig\.com\/kennisbank\/voorbereiden-gesprek-arbeidsdeskundige">/);
        assert.match(html, /Laatst bijgewerkt: 2026-11-12/);
        assert.equal(html.includes('\u2014'), false);

        const body = articleBody(html);
        const words = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        const shown = Number(html.match(/Leestijd: (\d+) min/)[1]);
        assert.equal(shown, Math.max(1, Math.round(words.length / 200)));
        assert.ok(words.length >= 3000 && words.length <= 3500, 'word count ' + words.length);
        const firstWords = words.slice(0, 80).join(' ');
        assert.match(firstWords, /gesprek met de arbeidsdeskundige/i);
        assert.match(firstWords, /uur tot anderhalf uur/i);
        assert.match(firstWords, /werkgever/i);
        assert.match(body, /hoeft geen uitgebreide voorbereiding/);

        for (const heading of H2S) {
            assert.match(html, new RegExp('<h2[^>]*>' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</h2>'));
        }
        assert.match(body, /<ul>/);
        assert.match(body, /<li>De FML of het IZP/);

        for (const href of [
            '/kennisbank/tips-werknemer-arbeidsdeskundig-onderzoek',
            '/kennisbank/arbeidsdeskundig-onderzoek-gids',
            '/kennisbank/werknemer-zelf-aanvragen',
            '/kennisbank/deskundigenoordeel-vs-arbeidsdeskundig-onderzoek',
            '/kennisbank/nadelen-arbeidsdeskundig-onderzoek',
            '/kennisbank/second-opinion-arbeidsdeskundige',
            '/offerte-aanvragen',
            '/aanmelden',
        ]) {
            assert.match(body, new RegExp('href="' + href + '"'));
        }
        assert.match(body, /<a class="blog-link" href="\/kennisbank\/arbeidsdeskundig-onderzoek-gids"[^>]*>arbeidsdeskundig onderzoek<\/a>/);
        assert.match(body, /<a class="blog-link" href="\/kennisbank\/tips-werknemer-arbeidsdeskundig-onderzoek"[^>]*>tips voor werknemers bij een arbeidsdeskundig onderzoek<\/a>/);
        assert.ok((body.match(/<a class="btn-primary" href="\/offerte-aanvragen"/g) || []).length >= 2);
        assert.ok((body.match(/<a class="btn-ghost" href="\/aanmelden"/g) || []).length >= 2);
        assert.doesNotMatch(body, /kunnen werknemers dit ook zelf aanvragen/);
        assert.doesNotMatch(body, /zonder medisch te overdelen/);

        const blocks = jsonLdBlocks(html);
        const articles = blocks.filter((b) => b['@type'] === 'Article');
        assert.equal(articles.length, 1);
        assert.equal(articles[0].dateModified, '2026-11-12');
        assert.equal(articles[0].headline, H1);
        assert.match(articles[0].mainEntityOfPage, /voorbereiden-gesprek-arbeidsdeskundige$/);
        const crumbs = blocks.filter((b) => b['@type'] === 'BreadcrumbList');
        assert.equal(crumbs.length, 1);
        assert.equal(crumbs[0].itemListElement[0].name, 'Home');
        assert.match(crumbs[0].itemListElement[2].item, /voorbereiden-gesprek-arbeidsdeskundige$/);

        const faqs = blocks.filter((b) => b['@type'] === 'FAQPage');
        assert.equal(faqs.length, 1);
        const visible = visibleFaq(html);
        assert.ok(visible.length >= 4 && visible.length <= 6);
        assert.equal(faqs[0].mainEntity.length, visible.length);
        faqs[0].mainEntity.forEach((item, i) => {
            assert.equal(item.name, visible[i][0]);
            assert.equal(item.acceptedAnswer.text, visible[i][1]);
        });
        const questions = visible.map((pair) => pair[0]).join('\n');
        const answers = visible.map((pair) => pair[1]).join('\n');
        assert.match(questions, /werkgever/i);
        assert.match(questions, /geen gesprek/i);
        assert.match(questions, /WIA/);
        assert.match(questions, /meenemen/i);
        assert.match(questions, /opnemen/i);
        assert.match(answers, /deskundigenoordeel bij UWV/);
        faqs[0].mainEntity.forEach((item) => {
            assert.equal(item['@type'], 'Question');
            assert.equal(item.acceptedAnswer['@type'], 'Answer');
            assert.equal(typeof item.name, 'string');
            assert.ok(item.acceptedAnswer.text.length > 40);
        });
    });

    it('staat in de sitemap met lastmod en in llms.txt', async () => {
        const xml = await (await fetch(base + '/sitemap.xml')).text();
        assert.match(xml, /<loc>https:\/\/www\.arbeidsdeskundig\.com\/kennisbank\/voorbereiden-gesprek-arbeidsdeskundige<\/loc><lastmod>2026-11-12<\/lastmod>/);
        const llms = await (await fetch(base + '/llms.txt')).text();
        assert.match(llms, /\/kennisbank\/voorbereiden-gesprek-arbeidsdeskundige/);
        assert.equal(llms.includes('\u2014'), false);
    });

    it('linkt vanaf de werknemerspagina en herhaalt de paklijst niet op de tipspagina', async () => {
        const werknemer = await (await fetch(base + '/voor/werknemer')).text();
        assert.match(werknemer, /<a class="blog-link" href="\/kennisbank\/voorbereiden-gesprek-arbeidsdeskundige">gesprek met de arbeidsdeskundige<\/a>/);
        const tips = await (await fetch(base + '/kennisbank/tips-werknemer-arbeidsdeskundig-onderzoek')).text();
        const tipsBody = articleBody(tips);
        assert.match(tipsBody, /href="\/kennisbank\/voorbereiden-gesprek-arbeidsdeskundige"[^>]*>[^<]*gesprek met de arbeidsdeskundige/);
        assert.match(tipsBody, /zonder medisch te overdelen/);
        assert.doesNotMatch(tipsBody, /Schrijf vijf taken op/);
        assert.doesNotMatch(tipsBody, /hoeft geen uitgebreide voorbereiding/);
    });
});

function h2OutsideScript(html) {
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    return [...visible.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)].map((m) => m[0]);
}

describe('escPersona lekt niet als crawlbare H2', () => {
    for (const path of ['/', '/voor/werknemer', '/voor/hr-adviseur', PATH]) {
        it(path + ' houdt de template in script en niet in zichtbare H2s', async () => {
            const html = await (await fetch(base + path)).text();
            assert.match(html, /<script\b[^>]*>[\s\S]*\$\{escPersona\(s\.titel\)\}/);
            assert.match(html, /\$\{escPersona\(k\.titel\)\}/);
            const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
            assert.equal(visible.includes('escPersona'), false, path);
            for (const h2 of h2OutsideScript(html)) {
                assert.equal(h2.includes('escPersona'), false, h2);
                assert.equal(h2.includes('${'), false, h2);
            }
        });
    }
});

describe('geen emdash op kernroutes', () => {
    for (const path of CORE_ROUTES) {
        it('GET ' + path + ' bevat geen emdash in de HTML', async () => {
            const res = await fetch(base + path);
            assert.equal(res.status, 200);
            const html = await res.text();
            assert.equal(html.includes('\u2014'), false, path);
            assert.equal((html.match(/<h1\b/g) || []).length, 1, path);
        });
    }
});
