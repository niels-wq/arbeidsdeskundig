'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const PATH = '/kennisbank/voorbereiden-gesprek-arbeidsdeskundige';
const H1 = 'Gesprek met de arbeidsdeskundige voorbereiden: wat neem je mee en wat vraag je?';
const TITLE = 'Gesprek met de arbeidsdeskundige voorbereiden: checklist | Arbeidsdeskundig.com';
const META = 'Gesprek met de arbeidsdeskundige voorbereiden: wat je meeneemt, hoe lang het gesprek duurt en welke vragen je stelt. Vraag vrijblijvend een offerte.';

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
    'Neem dit mee',
    'Mag je iemand meenemen naar het gesprek?',
    'Hoe lang duurt het gesprek?',
    'Welke vragen stelt de arbeidsdeskundige?',
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
        assert.match(html, /Laatst bijgewerkt: 2026-10-29/);
        assert.equal(html.includes('\u2014'), false);

        const body = articleBody(html);
        const words = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        const shown = Number(html.match(/Leestijd: (\d+) min/)[1]);
        assert.equal(shown, Math.max(1, Math.round(words.length / 200)));
        assert.ok(shown >= 5, 'leestijd hoort voorbij de dunne versie');
        const firstWords = words.slice(0, 80).join(' ');
        assert.match(firstWords, /gesprek met de arbeidsdeskundige voorbereiden/i);
        assert.match(firstWords, /meenemen/i);
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
            '/offerte-aanvragen',
            '/aanmelden',
        ]) {
            assert.match(body, new RegExp('href="' + href + '"'));
        }
        assert.doesNotMatch(body, /kunnen werknemers dit ook zelf aanvragen/);
        assert.doesNotMatch(body, /zonder medisch te overdelen/);

        const blocks = jsonLdBlocks(html);
        const articles = blocks.filter((b) => b['@type'] === 'Article');
        assert.equal(articles.length, 1);
        assert.equal(articles[0].dateModified, '2026-10-29');
        assert.equal(articles[0].headline, H1);
        assert.match(articles[0].mainEntityOfPage, /voorbereiden-gesprek-arbeidsdeskundige$/);

        const faqs = blocks.filter((b) => b['@type'] === 'FAQPage');
        assert.equal(faqs.length, 1);
        const visible = visibleFaq(html);
        assert.ok(visible.length >= 4 && visible.length <= 6);
        assert.equal(faqs[0].mainEntity.length, visible.length);
        faqs[0].mainEntity.forEach((item, i) => {
            assert.equal(item.name, visible[i][0]);
            assert.equal(item.acceptedAnswer.text, visible[i][1]);
        });
        assert.match(visible.map((pair) => pair[0]).join('\n'), /meenemen/i);
        assert.match(visible.map((pair) => pair[0]).join('\n'), /opnemen/i);
        assert.match(visible.map((pair) => pair[1]).join('\n'), /deskundigenoordeel bij UWV/);
    });
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
