'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

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

function articleBody(html) {
    const marker = 'id="artikel-body">';
    const bodyStart = html.indexOf(marker);
    assert.notEqual(bodyStart, -1);
    const after = html.slice(bodyStart + marker.length);
    const bodyEnd = after.indexOf('</div>');
    return after.slice(0, bodyEnd);
}

function faqPages(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        const block = JSON.parse(m[1]);
        if (block['@type'] === 'FAQPage') blocks.push(block);
    }
    return blocks;
}

function assertNoDash(snippet, label) {
    assert.doesNotMatch(snippet, /—/, `${label} bevat een emdash`);
    assert.doesNotMatch(snippet, /–/, `${label} bevat een endash`);
}

describe('conversie quick win: kosten', () => {
    it('zet het prijsblok bovenaan, met CTA, rekentool en UWV-FAQ', async () => {
        const res = await fetch(base + '/kennisbank/kosten-arbeidsdeskundig-onderzoek');
        assert.equal(res.status, 200);
        const html = await res.text();
        const h1s = html.match(/<h1\b/g) || [];
        assert.equal(h1s.length, 1);

        const body = articleBody(html);
        assert.ok(body.trimStart().startsWith('<aside class="card prijsblok"'), 'prijsblok hoort bovenaan');
        const blokEnd = body.indexOf('</aside>');
        const blok = body.slice(0, blokEnd);
        assert.match(blok, /Offerte binnen 24 uur/);
        assert.match(blok, /href="\/offerte-aanvragen"/);
        assert.match(blok, /href="\/rekentool"/);
        assert.match(blok, /Vanaf €999 excl\. btw, in sommige gevallen bij een vroegtijdig onderzoek/);
        assert.match(blok, /€ 1\.095/);
        assert.match(blok, /MKB klein/);
        assert.match(blok, /€ 1\.195/);
        assert.match(blok, /€ 1\.295/);
        assert.match(blok, /€ 225/);
        assert.match(blok, /€ 195/);
        assert.doesNotMatch(blok, /€1\.149/);
        assert.match(body, /starten in 2027 vanaf €999/);
        assert.match(body, /<h2>Tarief arbeidsdeskundig onderzoek 2027 \(excl\. btw\)<\/h2>/);
        assertNoDash(blok, 'prijsblok');

        const faqs = faqPages(html);
        assert.equal(faqs.length, 1);
        const q = faqs[0].mainEntity.find((item) => item.name === 'Betaalt UWV het arbeidsdeskundig onderzoek?');
        assert.ok(q, 'FAQ ontbreekt in FAQPage');
        assert.match(q.acceptedAnswer.text, /re-integratie betaalt de werkgever/);
        assert.match(q.acceptedAnswer.text, /UWV-arbeidsdeskundige/);
        assert.match(q.acceptedAnswer.text, /WIA-beoordeling/);
        assert.match(q.acceptedAnswer.text, /UWV-procedure/);
        assert.match(html, /Betaalt UWV het arbeidsdeskundig onderzoek\?/);
    });
});

describe('conversie quick win: goedkoopste', () => {
    it('zet een tweede CTA direct na de steekproef', async () => {
        const res = await fetch(base + '/kennisbank/goedkoopste-arbeidsdeskundig-onderzoek');
        assert.equal(res.status, 200);
        const html = await res.text();
        const h1s = html.match(/<h1\b/g) || [];
        assert.equal(h1s.length, 1);
        const body = articleBody(html);
        const sectionStart = body.indexOf('<h2>Openbare tarieven, oktober 2026</h2>');
        assert.ok(sectionStart > -1);
        const section = body.slice(sectionStart);
        const ctaAt = section.indexOf('Offerte op draagkracht');
        const nextHeading = section.indexOf('<h3>Deskundigenoordeel UWV is een ander product</h3>');
        assert.ok(ctaAt > 0 && ctaAt < nextHeading, 'CTA hoort direct na de steekproef');
        const cta = section.slice(ctaAt, nextHeading);
        assert.match(cta, /href="\/kennisbank\/kosten-arbeidsdeskundig-onderzoek"/);
        assert.match(cta, /href="\/keuzehulp"/);
        assertNoDash(cta, 'tweede CTA');
    });
});

describe('conversie quick win: werknemer', () => {
    it('toont het aanvraagblok op tips en voorbereiding, zonder verzonnen checklist-URL', async () => {
        for (const path of [
            '/kennisbank/tips-werknemer-arbeidsdeskundig-onderzoek',
            '/kennisbank/voorbereiden-gesprek-arbeidsdeskundige',
        ]) {
            const res = await fetch(base + path);
            assert.equal(res.status, 200);
            const html = await res.text();
            const h1s = html.match(/<h1\b/g) || [];
            assert.equal(h1s.length, 1, path);
            const body = articleBody(html);
            const start = body.indexOf('<aside class="card werknemer-aanvraagblok">');
            const end = body.indexOf('</aside>', start);
            assert.ok(start > -1 && end > start, path);
            const blok = body.slice(start, end);
            assert.match(blok, /Werkgever nog niet gestart\? Zo vraag je het aan/);
            assert.match(blok, /href="\/kennisbank\/werknemer-zelf-aanvragen"/);
            assert.match(blok, /href="\/aanmelden"/);
            assert.doesNotMatch(blok, /matchvermogen\.nl\/[^"']*checklist/i);
            assertNoDash(blok, path);
        }
    });
});

describe('conversie quick win: gids', () => {
    it('heeft een inhoudsopgave, sticky offerte/aanmelden en een uitvoerder-FAQ', async () => {
        const res = await fetch(base + '/kennisbank/arbeidsdeskundig-onderzoek-gids');
        assert.equal(res.status, 200);
        const html = await res.text();
        const h1s = html.match(/<h1\b/g) || [];
        assert.equal(h1s.length, 1);
        const body = articleBody(html);
        assert.match(body, /<nav class="gids-toc" aria-label="Inhoudsopgave">/);
        for (const id of ['gids-wat-het-is', 'gids-moet-wanneer-kosten', 'gids-werknemer', 'gids-wringt', 'gids-uwv', 'gids-offerte']) {
            assert.match(body, new RegExp(`href="#${id}"`));
            assert.match(body, new RegExp(`id="${id}"`));
        }
        const tocStart = body.indexOf('<nav class="gids-toc"');
        const tocEnd = body.indexOf('</nav>', tocStart);
        assertNoDash(body.slice(tocStart, tocEnd), 'inhoudsopgave');

        assert.match(html, /id="sticky-artikel-cta-gids"/);
        assert.match(html, /Offerte \/ Aanmelden/);
        assert.match(html, /href="\/offerte-aanvragen"/);
        assert.match(html, /href="\/aanmelden"/);
        assert.match(html, /arbeidsdeskundig-onderzoek-gids/);
        assert.match(html, /body\.cookie-prompt-open #sticky-artikel-cta\{display:none !important;\}/);
        assert.match(html, /body\.cookie-prompt-open \.sticky-cta\{display:none;\}/);

        const faqs = faqPages(html);
        assert.equal(faqs.length, 1);
        const q = faqs[0].mainEntity.find((item) => item.name === 'Wie voert het arbeidsdeskundig onderzoek uit?');
        assert.ok(q, 'FAQ ontbreekt in FAQPage');
        assert.match(q.acceptedAnswer.text, /geregistreerd arbeidsdeskundige/);
        assert.match(q.acceptedAnswer.text, /UWV-procedure/);
        assert.match(html, /Wie voert het arbeidsdeskundig onderzoek uit\?/);
    });
});

describe('conversie quick win: second opinion', () => {
    it('koppelt de artikelen en stuurt dienst=second-opinion mee', async () => {
        const oneens = await (await fetch(base + '/kennisbank/oneens-met-arbeidsdeskundige')).text();
        const second = await (await fetch(base + '/kennisbank/second-opinion-arbeidsdeskundige')).text();
        assert.equal((oneens.match(/<h1\b/g) || []).length, 1);
        assert.equal((second.match(/<h1\b/g) || []).length, 1);
        const oneensBody = articleBody(oneens);
        const secondBody = articleBody(second);
        assert.match(oneensBody, /href="\/kennisbank\/second-opinion-arbeidsdeskundige"/);
        assert.match(secondBody, /href="\/kennisbank\/oneens-met-arbeidsdeskundige"/);
        for (const body of [oneensBody, secondBody]) {
            assert.match(body, /href="\/offerte-aanvragen\?dienst=second-opinion"/);
            assert.match(body, /Rapport laten toetsen/);
        }

        const offerte = await (await fetch(base + '/offerte-aanvragen?dienst=second-opinion')).text();
        assert.match(offerte, /id="of-dienst-note"/);
        assert.match(offerte, /function applyOfferteDienstFromQuery/);
        assert.match(offerte, /'second-opinion': 'Second opinion'/);
        assert.match(offerte, /dienst: offerteData\.dienst/);
    });
});
