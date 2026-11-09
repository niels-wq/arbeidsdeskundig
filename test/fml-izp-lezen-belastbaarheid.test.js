'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app } = require('../server');

const SLUG = 'fml-izp-lezen-belastbaarheid';
const PATH = '/kennisbank/' + SLUG;
const H1 = 'FML en IZP lezen: belastbaarheid vertalen naar passende arbeid';
const TITLE = 'FML en IZP lezen: belastbaarheid | Arbeidsdeskundig.com';
const META = 'Hoe lees je als HR of werkgever een FML of IZP? Wat rubrieken en beperkingen betekenen, hoe je ze vertaalt naar passende arbeid, en wanneer een onderzoek nodig is.';

const FAQ = [
    'Hoe lees je een FML of IZP zonder medische achtergrond?',
    'Wat betekenen de rubrieken van een FML voor het werk?',
    'Hoe vertaal je een beperking naar passende arbeid?',
    'Wat is het verschil tussen een FML en een IZP op de werkvloer?',
    'Wanneer is een FML verouderd?',
    'Wanneer is een arbeidsdeskundig onderzoek nodig na een FML of IZP?',
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

function jsonLd(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
    return blocks;
}

function artikelBody(html) {
    const marker = 'id="artikel-body">';
    const start = html.indexOf(marker);
    assert.notEqual(start, -1);
    const after = html.slice(start + marker.length);
    const end = after.indexOf('</div>');
    assert.notEqual(end, -1);
    return after.slice(0, end);
}

function words(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

function executableScripts(html) {
    const scripts = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1] || '';
        if (/\bsrc\s*=/i.test(attrs)) continue;
        const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1];
        if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') continue;
        if (!m[2].trim()) continue;
        scripts.push(m[2]);
    }
    return scripts;
}

describe('kennisbank: FML en IZP lezen, belastbaarheid', () => {
    it('serves a deep practical article with one h1, FAQ schema and CTAs', async () => {
        const res = await fetch(base + PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        assert.match(html, new RegExp('<title>' + TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</title>'));
        assert.ok(html.includes('<title>' + TITLE + '</title>'));
        assert.ok(TITLE.endsWith(' | Arbeidsdeskundig.com'));
        assert.match(html, new RegExp('<meta name="description" content="' + META.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '">'));
        assert.match(html, new RegExp('<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com' + PATH + '">'));

        const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) || [];
        assert.equal(h1s.length, 1);
        assert.match(h1s[0], /id="artikel-titel"/);
        assert.equal(h1s[0].replace(/<[^>]+>/g, '').trim(), H1);

        assert.match(html, /<div class="view active" id="view-artikel">/);
        assert.equal(html.includes('id="view-home"'), false);
        assert.equal(html.includes('id="view-offerte"'), false);
        assert.equal(html.includes('id="view-aanmelden"'), false);

        const body = artikelBody(html);
        const h2s = body.match(/<h2>[^<]+<\/h2>/g) || [];
        assert.ok(h2s.length >= 8, 'expected multiple h2s, got ' + h2s.length);
        assert.match(body, /<h2>FML en IZP lezen: belastbaarheid vertalen naar passende arbeid<\/h2>/);
        assert.match(body, /<h2>De rubrieken en wat een beperking betekent<\/h2>/);
        assert.match(body, /<h2>Van beperking naar passende arbeid<\/h2>/);
        assert.match(body, /<h2>Wanneer een FML verouderd is<\/h2>/);
        assert.match(body, /<h2>Wanneer een arbeidsdeskundig onderzoek nodig is<\/h2>/);
        assert.match(body, /Wat voor regel is dit/);
        assert.doesNotMatch(body, /Drie beslismomenten: starten, wachten, bedrijfsarts/);
        assert.doesNotMatch(body, /Wat je riskeert als je toch start/);
        assert.doesNotMatch(body, /Dit artikel wordt binnenkort toegevoegd/);
        assert.doesNotMatch(body, /€/);
        assert.doesNotMatch(body, /—/);
        assert.doesNotMatch(body, /–/);

        const count = words(body).length;
        assert.ok(count >= 1500 && count <= 2000, 'word count ' + count);

        assert.match(body, /<a class="btn-primary" href="\/offerte-aanvragen"/);
        assert.match(body, /<a class="btn-ghost" href="\/aanmelden"/);

        const blocks = jsonLd(html);
        blocks.forEach((block) => JSON.stringify(block));
        const articles = blocks.filter((b) => b['@type'] === 'Article');
        assert.equal(articles.length, 1);
        assert.equal(articles[0].dateModified, '2026-11-09');
        assert.equal(articles[0].headline, H1);

        const faqs = blocks.filter((b) => b['@type'] === 'FAQPage');
        assert.equal(faqs.length, 1);
        const names = faqs[0].mainEntity.map((q) => q.name);
        assert.deepEqual(names, FAQ);
        assert.ok(names.length >= 5 && names.length <= 6);
        for (const q of names) {
            assert.ok(html.includes(q), q);
            assert.equal(q.includes('—'), false);
            assert.equal(q.includes('–'), false);
        }
        for (const item of faqs[0].mainEntity) {
            assert.equal(html.includes(item.acceptedAnswer.text), true);
            assert.equal(item.acceptedAnswer.text.includes('—'), false);
            assert.equal(item.acceptedAnswer.text.includes('–'), false);
        }

        const scripts = executableScripts(html);
        const main = scripts.find((code) => code.includes('function setView'));
        assert.ok(main, 'setView missing');
        assert.match(main, /function openArtikel/);
        for (const code of scripts) {
            assert.doesNotThrow(() => new vm.Script(code));
        }
    });

    it('lists lastmod 2026-11-09 and is linked from related articles', async () => {
        const map = await (await fetch(base + '/sitemap.xml')).text();
        assert.match(
            map,
            /<loc>https:\/\/www\.arbeidsdeskundig\.com\/kennisbank\/fml-izp-lezen-belastbaarheid<\/loc><lastmod>2026-11-09<\/lastmod>/
        );

        const sources = [
            '/kennisbank/passende-arbeid',
            '/kennisbank/belastbaarheid-verouderd-nieuwe-fml-izp',
            '/kennisbank/arbeidsdeskundig-rapport-voorbeeld',
        ];
        for (const source of sources) {
            const html = await (await fetch(base + source)).text();
            const body = artikelBody(html);
            assert.match(body, /href="\/kennisbank\/fml-izp-lezen-belastbaarheid"/, source);
        }

        const nadelen = await (await fetch(base + '/kennisbank/nadelen-arbeidsdeskundig-onderzoek')).text();
        const nadelenBody = artikelBody(nadelen);
        assert.match(nadelenBody, /href="\/aanmelden"/);
        assert.match(nadelenBody, /dan kun je het onderzoek/);
    });
});
