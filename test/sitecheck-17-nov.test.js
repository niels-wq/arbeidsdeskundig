'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const dates = require('../data/page-dates.json');

const DOEL = '/kennisbank/loonsanctie-voorkomen-dossierfouten';
const STEEKPROEF = [
    'wat-doet-arbeidsdeskundige',
    'ziektewet',
    'erd',
    'spoor2',
    'poortwachter-tijdlijn',
    'wia-aanvraag',
    'bezwaar-wia',
    'iva-uitkering',
    'casus-wga',
];

let server;
let base;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
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

function articleBody(html) {
    const marker = 'id="artikel-body">';
    const start = html.indexOf(marker);
    assert.notEqual(start, -1);
    const after = html.slice(start + marker.length);
    return after.slice(0, after.indexOf('</div>'));
}

describe('sitecheck 17 november 2026', () => {
    it('301t /kennisbank/loonsanctie naar de dossierpagina', async () => {
        const res = await fetch(base + '/kennisbank/loonsanctie', { redirect: 'manual' });
        assert.equal(res.status, 301);
        const loc = res.headers.get('location') || '';
        assert.match(loc, /\/kennisbank\/loonsanctie-voorkomen-dossierfouten$/);
    });

    it('noemt /kennisbank/loonsanctie niet in sitemap of llms.txt', async () => {
        const xml = await (await fetch(base + '/sitemap.xml')).text();
        const llms = await (await fetch(base + '/llms.txt')).text();
        assert.doesNotMatch(xml, /\/kennisbank\/loonsanctie(?!-)/);
        assert.doesNotMatch(llms, /\/kennisbank\/loonsanctie(?!-)/);
        assert.match(xml, /\/kennisbank\/loonsanctie-voorkomen-dossierfouten</);
        assert.match(llms, /\/kennisbank\/loonsanctie-voorkomen-dossierfouten/);
    });

    it('zet datePublished en dateModified op elk kennisbank-artikel en lastmod gelijk daaraan', async () => {
        const xml = await (await fetch(base + '/sitemap.xml')).text();
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)]
            .map((m) => ({ loc: m[1], lastmod: m[2] }));
        const articles = locs.filter((row) => row.loc.includes('/kennisbank/') && !row.loc.endsWith('/kennisbank'));
        assert.ok(articles.length >= 80, 'te weinig kennisbank-URL\'s: ' + articles.length);

        const days = new Set(locs.map((row) => row.lastmod));
        assert.ok(days.size > 1, 'lastmod is overal dezelfde dag');
        assert.notEqual(locs.length, locs.filter((row) => row.lastmod === '2026-11-17').length);

        const home = locs.find((row) => row.loc.endsWith('arbeidsdeskundig.com/'));
        assert.ok(home);
        assert.equal(home.lastmod, dates.pages['/'].dateModified);
        assert.notEqual(home.lastmod, '2026-11-17');

        async function check(row) {
            const slug = row.loc.split('/kennisbank/')[1];
            const res = await fetch(row.loc.replace('https://www.arbeidsdeskundig.com', base));
            assert.equal(res.status, 200, slug);
            const html = await res.text();
            const article = jsonLd(html).find((b) => b['@type'] === 'Article');
            assert.ok(article, 'geen Article op ' + slug);
            assert.match(article.datePublished, /^\d{4}-\d{2}-\d{2}$/, slug);
            assert.match(article.dateModified, /^\d{4}-\d{2}-\d{2}$/, slug);
            assert.equal(article.datePublished, dates.kennisbank[slug].datePublished, slug);
            assert.equal(article.dateModified, dates.kennisbank[slug].dateModified, slug);
            assert.equal(row.lastmod, article.dateModified, slug);
            assert.match(html, new RegExp('Laatst bijgewerkt: ' + article.dateModified.replace(/-/g, '\\-') + '|Laatst bijgewerkt: \\d{1,2} \\w+ ' + article.dateModified.slice(0, 4)));
        }

        const queue = articles.slice();
        const workers = Array.from({ length: 8 }, async () => {
            for (;;) {
                const row = queue.pop();
                if (!row) return;
                await check(row);
            }
        });
        await Promise.all(workers);
    });

    it('toont op de steekproef een volledige datum, niet alleen het jaar', async () => {
        for (const slug of STEEKPROEF) {
            const html = await (await fetch(base + '/kennisbank/' + slug)).text();
            const article = jsonLd(html).find((b) => b['@type'] === 'Article');
            assert.equal(article.datePublished, dates.kennisbank[slug].datePublished, slug);
            assert.equal(article.dateModified, dates.kennisbank[slug].dateModified, slug);
            assert.match(html, new RegExp('Laatst bijgewerkt: ' + article.dateModified));
            assert.doesNotMatch(html, /Laatst bijgewerkt: 2026</);
        }
    });

    it('beantwoordt hoe je een loonsanctie voorkomt, met bron en tabel, en één h1', async () => {
        const res = await fetch(base + DOEL);
        assert.equal(res.status, 200);
        const html = await res.text();
        const h1s = html.match(/<h1\b/g) || [];
        assert.equal(h1s.length, 1);
        const article = jsonLd(html).find((b) => b['@type'] === 'Article');
        assert.equal(article.datePublished, '2026-09-29');
        assert.equal(article.dateModified, '2026-11-17');
        assert.match(html, /Laatst bijgewerkt: 2026-11-17/);
        const body = articleBody(html);
        assert.match(body, /<h2>Hoe voorkom je een loonsanctie\?<\/h2>/);
        assert.match(body, /uiterlijk in week 6/);
        assert.match(body, /uiterlijk in week 8/);
        assert.match(body, /evaluatie na 6 weken/);
        assert.match(body, /eerstejaarsevaluatie na 52 verzuimweken/);
        assert.match(body, /tijdig spoor 2/);
        assert.match(body, /tijdig arbeidsdeskundig onderzoek/);
        assert.match(body, /class="termijn-tabel"/);
        assert.ok((body.match(/<tr>/g) || []).length <= 6);
        assert.match(body, /href="https:\/\/wetten\.overheid\.nl\/BWBR0013540\/2025-07-01"/);
        assert.match(body, /href="https:\/\/www\.uwv\.nl\/assets-kai\/files\/70c51464-322e-45e7-8ec2-e6b073cd784d\/werkwijzer-poortwachter\.pdf"/);
        assert.match(body, /href="\/kennisbank\/poortwachter-tijdlijn"/);
        assert.equal((body.match(/\u2014/g) || []).length, 0);
        assert.equal((body.match(/\u2013/g) || []).length, 0);
        assert.match(html, /<title>Loonsanctie voorkomen: dossierfouten \| Arbeidsdeskundig\.com<\/title>/);
    });

    it('heeft geen en- of emdash op wat-doet-arbeidsdeskundige en de rekentool', async () => {
        for (const path of ['/kennisbank/wat-doet-arbeidsdeskundige', '/rekentool']) {
            const html = await (await fetch(base + path)).text();
            assert.equal(html.includes('\u2014'), false, path + ' heeft een emdash');
            assert.equal(html.includes('\u2013'), false, path + ' heeft een endash');
        }
        const wat = await (await fetch(base + '/kennisbank/wat-doet-arbeidsdeskundige')).text();
        assert.match(wat, /week 42 tot 52/);
        const calc = await (await fetch(base + '/rekentool')).text();
        assert.match(calc, /13 tot 26 weken/);
        assert.match(calc, /€3\.500 tot €6\.500/);
        assert.match(calc, /tot €\$\{premieHi\.toLocaleString\('nl-NL'\)\}/);
        assert.match(calc, /tot €\$\{totHi\.toLocaleString\('nl-NL'\)\}/);
        assert.match(calc, /body\.view-calculator #adc-fab/);
        assert.match(calc, /body\.view-calculator #adc-chat\{display:none !important;\}/);
    });

    it('zet de unieke WGA-zin over het uitkeringspercentage op de WGA-pagina', async () => {
        const html = await (await fetch(base + '/voor/wga-specialist')).text();
        assert.match(html, /Het uitkeringspercentage in de WGA volgt uit het verschil tussen het maatmanloon en de resterende verdiencapaciteit/);
        assert.match(html, /De arbeidsdeskundige stelt het uitkeringspercentage niet vast/);
        const iva = await (await fetch(base + '/kennisbank/iva-uitkering')).text();
        assert.match(iva, /href="\/voor\/wga-specialist"/);
        assert.doesNotMatch(iva, /openArtikel\('loonsanctie'\)/);
    });
});
