'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const vgl = require('../vergelijkingstool');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vergelijkingstool.json'), 'utf8'));

const H1 = 'Interventies bij verzuim vergelijken: kosten en kwaliteit';
const DISCLAIMER = 'Vergelijking op basis van openbare informatie van aanbieders, peildatum 28 november 2026. Prijzen zijn exclusief btw tenzij anders vermeld en kunnen afwijken; controleer actuele tarieven bij de aanbieder. Bandbreedtes zijn berekend uit openbare tarieven van derden, zonder ons eigen aanbod. Ziet u een onjuistheid? Laat het ons weten.';

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

function h1Tags(html) {
    return [...html.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/g)];
}

describe('vergelijkingstool data', () => {
    it('elke prijs heeft een bron-URL', () => {
        let prijzen = 0;
        for (const iv of data.interventies) {
            for (const aanbieder of iv.aanbieders) {
                for (const prijs of aanbieder.prijzen || []) {
                    prijzen += 1;
                    assert.equal(typeof prijs.bedrag, 'number', iv.id + ' ' + aanbieder.aanbieder_id);
                    const bron = data.bronnen[prijs.bron];
                    assert.ok(bron, 'bron ontbreekt: ' + prijs.bron);
                    assert.match(bron.url, /^https:\/\//, prijs.bron);
                }
            }
            for (const band of (iv.marktbandbreedte && iv.marktbandbreedte.banden) || []) {
                assert.equal(typeof band.laag, 'number', iv.id + ' ' + band.id);
                assert.equal(typeof band.hoog, 'number', iv.id + ' ' + band.id);
                assert.equal(typeof band.n, 'number', iv.id + ' ' + band.id);
            }
        }
        assert.ok(prijzen > 20, 'te weinig prijzen in de brondata');
        assert.equal(data.interventies.length, 9);
    });
});

describe('vergelijkingstool pagina', () => {
    it('geeft 200, één H1, geen streepjes, en prijs niet openbaar', async () => {
        const res = await fetch(base + '/vergelijken-interventies');
        assert.equal(res.status, 200);
        const html = await res.text();
        const viewStart = html.indexOf('id="view-vergelijken"');
        const viewEnd = html.indexOf('<footer class="site">', viewStart);
        const view = html.slice(viewStart, viewEnd);
        const tags = h1Tags(html);
        assert.equal(tags.length, 1, tags.map((tag) => tag[0]).join(' | '));
        assert.match(tags[0][0], /class="[^"]*route-h1/);
        assert.equal(tags[0][0].replace(/<[^>]+>/g, '').trim(), H1);
        assert.match(html, /<title>Interventies bij verzuim vergelijken \| Arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<link rel="canonical" href="https:\/\/www\.arbeidsdeskundig\.com\/vergelijken-interventies">/);
        assert.match(html, /name="description"/);
        assert.doesNotMatch(html, /—/);
        assert.doesNotMatch(html, /–/);
        assert.match(html, /prijs niet openbaar/);
        assert.ok(html.includes(DISCLAIMER.replace(
            'Laat het ons weten.',
            '<a href="mailto:info@arbeidsdeskundig.com?subject=Onjuistheid%20in%20de%20vergelijkingstool">Laat het ons weten</a>.'
        )), 'disclaimer wijkt af');
        assert.match(html, /Vanaf €999,- excl\. btw, in sommige gevallen bij een vroegtijdig onderzoek/);
        assert.match(html, /Vraag een offerte op maat aan/);
        assert.match(html, /\/aanmelden\?bron=vergelijkingstool/);
        assert.match(html, /id="vgl-sticky"/);
        assert.doesNotMatch(view, /€1\.149/);
        assert.doesNotMatch(view, /€1\.179/);
        assert.doesNotMatch(view, /€1\.449/);
        assert.doesNotMatch(view, /€5,95/);
        assert.doesNotMatch(view, /€129,95/);
        assert.doesNotMatch(view, /niet in register/i);
        assert.doesNotMatch(view, /vervolg_kandidaten/);
        assert.doesNotMatch(view, /5\/5 sterren/);

        const blocks = html.match(/<div class="vgl-prijs">[\s\S]*?<\/div>/g) || [];
        assert.ok(blocks.length > 0, 'geen gepubliceerde prijzen in de HTML');
        for (const block of blocks) {
            assert.match(block, /class="vgl-bedrag"/);
            assert.match(block, /<a href="https:\/\//);
            assert.match(block, /peildatum 28-11-2026/);
            assert.match(block, /Jaarkosten: (?:niet te berekenen|€)/);
        }

        const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
        const appLd = scripts.find((block) => block['@type'] === 'WebApplication');
        const dataset = scripts.find((block) => block['@type'] === 'Dataset');
        const faq = scripts.find((block) => block['@type'] === 'FAQPage');
        assert.ok(appLd, 'WebApplication ontbreekt');
        assert.equal(appLd.name, 'Interventies bij verzuim vergelijken');
        assert.ok(dataset, 'Dataset ontbreekt');
        assert.ok(Array.isArray(dataset.citation) && dataset.citation.length > 10);
        dataset.citation.forEach((item) => assert.match(item.url, /^https:\/\//));
        assert.ok(faq, 'FAQPage ontbreekt');
        assert.equal(faq.mainEntity.length, 4);
        faq.mainEntity.forEach((item) => {
            assert.equal(item.name.includes('—'), false);
            assert.equal(item.name.includes('–'), false);
            assert.equal(item.acceptedAnswer.text.includes('—'), false);
            assert.equal(item.acceptedAnswer.text.includes('–'), false);
        });

        assert.match(html, /data-leuk-bron="(bereikbaar|niet-bereikbaar)"/);
        const appStart = html.indexOf('id="vgl-app"');
        const appEnd = html.indexOf('id="vgl-model"');
        const appHtml = html.slice(appStart, appEnd);
        if (html.includes('data-leuk-bron="niet-bereikbaar"')) {
            assert.doesNotMatch(appHtml, /2026-Tarievenlijst\.pdf/);
        } else {
            assert.match(appHtml, /2026-Tarievenlijst\.pdf/);
        }
    });

    it('laat prijzen van Best Match, werkhervattingskas.nl en MV-spoor 2 weg', async () => {
        const spoor = await (await fetch(base + '/vergelijken-interventies?interventie=tweede-spoor')).text();
        assert.doesNotMatch(spoor, /€1\.895/);
        assert.doesNotMatch(spoor, /€8\.000/);
        assert.match(spoor, /Vraag een offerte op maat aan/);
        assert.match(spoor, /prijs niet openbaar/);

        const arbo = await (await fetch(base + '/vergelijken-interventies?interventie=arbodienstverlening')).text();
        assert.doesNotMatch(arbo, /€5,95/);
        assert.doesNotMatch(arbo, /€14,95/);
        assert.doesNotMatch(arbo, /€39,95/);

        const casus = await (await fetch(base + '/vergelijken-interventies?interventie=casemanagement')).text();
        assert.doesNotMatch(casus, /€129,95/);
        assert.doesNotMatch(casus, /€109,95/);
    });

    it('staat in de sitemap, in llms.txt, op home, in de kennisbank, het kostenartikel en de footer', async () => {
        const xml = await (await fetch(base + '/sitemap.xml')).text();
        assert.match(xml, /<loc>https:\/\/www\.arbeidsdeskundig\.com\/vergelijken-interventies<\/loc><lastmod>2026-11-28<\/lastmod>/);
        const llms = await (await fetch(base + '/llms.txt')).text();
        assert.match(llms, /https:\/\/www\.arbeidsdeskundig\.com\/vergelijken-interventies/);
        assert.ok(llms.length < 13200, 'llms.txt te lang: ' + llms.length);
        assert.doesNotMatch(llms, /—/);

        const home = await (await fetch(base + '/')).text();
        assert.match(home, /href="\/vergelijken-interventies"/);
        assert.match(home, /class="footer-grid"[\s\S]*href="\/vergelijken-interventies"/);
        assert.equal(home.includes('id="view-vergelijken"'), false);

        const kennis = await (await fetch(base + '/kennisbank')).text();
        assert.match(kennis, /href="\/vergelijken-interventies"/);

        const kosten = await (await fetch(base + '/kennisbank/kosten-arbeidsdeskundig-onderzoek')).text();
        assert.match(kosten, /vergelijking van interventies/);
        assert.match(kosten, /€1\.149/);
        assert.match(kosten, /€1\.179/);
        assert.match(kosten, /€1\.449/);
    });
});

describe('vergelijkingstool berekening', () => {
    const model = vgl.prepareModel(data, { leukBereikbaar: true });

    it('rekent alleen bij per medewerker of per traject en laat de rest open', () => {
        const ad = model.interventies.find((item) => item.id === 'arbeidsdeskundig-onderzoek');
        const fit = ad.aanbieders.find((item) => item.id === 'fit');
        const onderzoek = fit.prijzen.find((prijs) => /per onderzoek/.test(prijs.eenheid));
        assert.equal(vgl.jaarTekst(onderzoek, 10, 4), null);

        const arbo = model.interventies.find((item) => item.id === 'arbodienstverlening');
        const jaarprijs = arbo.aanbieders.flatMap((item) => item.prijzen).find((prijs) => /per medewerker per jaar/.test(prijs.eenheid));
        assert.ok(jaarprijs);
        const jaar = vgl.jaarTekst(jaarprijs, 10, 2);
        assert.match(jaar, new RegExp(vgl.formatEuro(jaarprijs.bedrag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(jaar, /× 10 medewerkers = /);
        assert.match(jaar, /per jaar/);
        assert.equal(vgl.jaarTekst(jaarprijs, null, 2), null);

        const spoor = model.interventies.find((item) => item.id === 'tweede-spoor');
        const traject = spoor.aanbieders.find((item) => item.id === 'yna').prijzen.find((prijs) => /per traject/.test(prijs.eenheid));
        const totaal = vgl.jaarTekst(traject, 8, 3);
        assert.match(totaal, /× 3 dossiers per jaar = /);
        assert.ok(totaal.includes(vgl.formatEuro(traject.bedrag * 3)), totaal);

        const systeem = model.interventies.find((item) => item.id === 'verzuimsysteem');
        const maand = systeem.aanbieders.flatMap((item) => item.prijzen).find((prijs) => /per maand/.test(prijs.eenheid));
        const omgerekend = vgl.jaarTekst(maand, 4, 1);
        assert.match(omgerekend, /× 12 × 4 medewerkers/);
    });

    it('toont geen eigen prijzen buiten de vaste AD-tekst en geen eigen reviews', () => {
        const ad = model.interventies.find((item) => item.id === 'arbeidsdeskundig-onderzoek');
        const mv = ad.aanbieders.find((item) => item.id === 'mv');
        assert.equal(mv.eigenAd, true);
        assert.equal(mv.prijzen.length, 0);
        const html = vgl.renderApp(model, Object.assign(vgl.defaultState(), { interventie: 'arbeidsdeskundig-onderzoek', medewerkers: '20', dossiers: '2' }));
        assert.match(html, /Vanaf €999,- excl\. btw, in sommige gevallen bij een vroegtijdig onderzoek/);
        assert.doesNotMatch(html, /€1\.149/);
        assert.doesNotMatch(html, /5\/5/);

        for (const iv of model.interventies) {
            const rendered = vgl.renderApp(model, Object.assign(vgl.defaultState(), {
                interventie: iv.id,
                medewerkers: '12',
                dossiers: '3',
            }));
            assert.doesNotMatch(rendered, /—/);
            assert.doesNotMatch(rendered, /–/);
            assert.doesNotMatch(rendered, /niet in register/i);
            assert.match(rendered, /Vraag een offerte op maat aan/);
            const eigen = iv.aanbieders.find((item) => item.id === 'mv');
            if (eigen && iv.id !== 'arbeidsdeskundig-onderzoek') {
                assert.equal(eigen.prijzen.length, 0);
                assert.equal(eigen.eigenCta, true);
            }
            const bm = iv.aanbieders.find((item) => item.id === 'bm');
            if (bm) assert.equal(bm.prijzen.length, 0);
            const wkk = iv.aanbieders.find((item) => item.id === 'wkk');
            if (wkk) assert.equal(wkk.prijzen.length, 0);
        }
    });

    it('laat een onbereikbare Leuk-prijs weg en houdt de bandbreedte', () => {
        const zonder = vgl.prepareModel(data, { leukBereikbaar: false });
        const met = vgl.prepareModel(data, { leukBereikbaar: true });
        const adZonder = zonder.interventies.find((item) => item.id === 'arbeidsdeskundig-onderzoek');
        const adMet = met.interventies.find((item) => item.id === 'arbeidsdeskundig-onderzoek');
        assert.equal(adZonder.leukWeggelaten, true);
        assert.equal(adZonder.banden[0].laag, adMet.banden[0].laag);
        assert.equal(adZonder.banden[0].hoog, adMet.banden[0].hoog);
        assert.equal(adZonder.banden[0].n, adMet.banden[0].n);
        const leukZonder = adZonder.aanbieders.find((item) => item.id === 'leuk');
        const leukMet = adMet.aanbieders.find((item) => item.id === 'leuk');
        assert.equal(leukZonder.prijzen.length, 0);
        assert.ok(leukMet.prijzen.length > 0);
        assert.ok(leukMet.prijzen.every((prijs) => /Tarievenlijst\.pdf/.test(prijs.bronUrl)));
    });
});
