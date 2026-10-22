'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { app } = require('../server');

const PAGE = '/arbeidsdeskundige-met-tolk';
const TITLE = 'Arbeidsdeskundige met tolk: zo werkt het | Arbeidsdeskundig.com';
const META = 'Gesprek met de arbeidsdeskundige in je eigen taal? Met tolk of Translate, online of op locatie, door heel Nederland. Zo werkt het en dit zijn je rechten.';
const H1 = 'Arbeidsdeskundige met tolk: onderzoek in elke taal';
const ALT = 'Online gesprek met arbeidsdeskundige en tolk';
const IMAGE = '/images/arbeidsdeskundige-met-tolk.jpg';

const FAQS = [
    ['Heb ik recht op een tolk bij de arbeidsdeskundige?', 'Bij een onderzoek in opdracht van je werkgever kun je om een tolk vragen. Wij plannen een professionele tolk, beëdigd indien nodig, in via een gerenommeerd, landelijk tolkenbureau.'],
    ['Kan het gesprek online met een tolk?', 'Ja, via video. De professionele tolk, beëdigd indien nodig, sluit aan via video of telefoon.'],
    ['In welke talen kan het onderzoek?', 'In alle talen. Het vaakst in Pools, Roemeens, Turks, Arabisch, Oekraïens en Engels.'],
    ['Mag mijn kind of partner tolken?', 'Dat raden we af voor het kerngesprek. Een professionele tolk, beëdigd indien nodig, is neutraler en beschermt je privacy.'],
    ['Krijg ik het rapport in mijn eigen taal?', 'Het rapport is in het Nederlands. In het rapport staat de naam van de tolk. Wij lichten de conclusies met de tolk toe in jouw taal.'],
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

function sliceFrom(html, startMarker, endMarker) {
    const start = html.indexOf(startMarker);
    assert.notEqual(start, -1, `missing ${startMarker}`);
    const from = start;
    const end = html.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(end, -1, `missing end ${endMarker} after ${startMarker}`);
    return html.slice(from, end);
}

function sliceView(html, id) {
    const marker = `id="${id}"`;
    const start = html.indexOf(marker);
    assert.notEqual(start, -1, `missing #${id}`);
    const nextView = html.indexOf('<div class="view', start + marker.length);
    const footer = html.indexOf('<footer', start + marker.length);
    const end = nextView === -1 ? footer : (footer === -1 ? nextView : Math.min(nextView, footer));
    assert.notEqual(end, -1, `unclosed #${id}`);
    return html.slice(start, end);
}

function jsonLd(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
    return blocks;
}

function phones(node, acc = []) {
    if (!node || typeof node !== 'object') return acc;
    if (typeof node.telephone === 'string') acc.push(node.telephone);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((item) => phones(item, acc));
        else if (value && typeof value === 'object') phones(value, acc);
    }
    return acc;
}

describe('pagina arbeidsdeskundige met tolk', () => {
    it('serves 200 with title, meta, canonical, one h1 and the featured image', async () => {
        const res = await fetch(base + PAGE);
        assert.equal(res.status, 200);
        const html = await res.text();
        const title = html.match(/<title>([^<]+)<\/title>/)[1];
        assert.equal(title, TITLE);
        assert.ok(title.endsWith(' | Arbeidsdeskundig.com'));
        assert.ok(title.length <= 65, `title length ${title.length}`);

        const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
        assert.equal(desc, META);
        assert.ok(desc.length >= 140 && desc.length <= 160, `meta length ${desc.length}`);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.arbeidsdeskundig\\.com${PAGE}">`));

        const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) || [];
        assert.equal(h1s.length, 1);
        assert.match(h1s[0], /class="[^"]*\broute-h1\b/);
        assert.equal(h1s[0].replace(/<[^>]+>/g, '').trim(), H1);

        assert.match(html, /<div class="view active" id="view-tolk">/);
        const view = sliceView(html, 'view-tolk');
        assert.doesNotMatch(view.slice(0, 80), /hidden/);
        assert.match(view, new RegExp(`<img[^>]*src="${IMAGE}"[^>]*alt="${ALT}"`));
        assert.match(view, /width="1200"/);
        assert.match(view, /height="675"/);
        assert.match(html, new RegExp(`property="og:image" content="https://www\\.arbeidsdeskundig\\.com${IMAGE}"`));
        assert.match(html, /property="og:image:width" content="1200"/);
        assert.match(html, /property="og:image:height" content="675"/);
        assert.match(html, new RegExp(`property="og:image:alt" content="${ALT}"`));
        assert.match(html, new RegExp(`name="twitter:image" content="https://www\\.arbeidsdeskundig\\.com${IMAGE}"`));
    });

    it('keeps copy inside the house rules', async () => {
        const html = await (await fetch(base + PAGE)).text();
        const view = sliceView(html, 'view-tolk');
        assert.doesNotMatch(view, /—/);
        assert.doesNotMatch(view, /–/);
        assert.match(view, /professionele tolk, beëdigd indien nodig/);
        assert.match(view, /gerenommeerd, landelijk tolkenbureau/);
        assert.match(view, /lage kosten/i);
        assert.match(view, /vraag een offerte aan/i);
        assert.match(view, /naam van de tolk/);
        assert.match(view, /en elke andere taal/);
        assert.doesNotMatch(view, /€|euro\s*\d|\d+\s*euro/i);
        assert.doesNotMatch(view, /\bUWV\b/);
        assert.doesNotMatch(view, /\bERD\b/);
        assert.doesNotMatch(view, /Silverein|HvA|\bVU\b/);
        assert.doesNotMatch(view, /Tolkcontact|Livewords|Global Talk/i);
        assert.doesNotMatch(view, /06[\s-]*\d|wa\.me/);
        assert.match(view, /href="tel:0850870307"/);
        assert.match(view, />085 087 0307</);
        const jurist = view.slice(view.indexOf('Letselschadejurist'), view.indexOf('Directeur-eigenaar'));
        assert.match(jurist, /naam van de tolk/);
        assert.match(jurist, /professionele tolk, beëdigd indien nodig/);
        const faq1 = FAQS[0][1];
        assert.doesNotMatch(faq1, /UWV/);
        assert.match(view, /id="tolk-faq-list"[\s\S]*Heb ik recht op een tolk bij de arbeidsdeskundige\?/);
    });

    it('publishes Article, FAQPage and BreadcrumbList with a consistent phone', async () => {
        const html = await (await fetch(base + PAGE)).text();
        const blocks = jsonLd(html);
        const articles = blocks.filter((b) => b['@type'] === 'Article');
        const faqs = blocks.filter((b) => b['@type'] === 'FAQPage');
        const crumbs = blocks.filter((b) => b['@type'] === 'BreadcrumbList');
        assert.equal(articles.length, 1);
        assert.equal(articles[0].headline, H1);
        assert.equal(articles[0].datePublished, '2026-10-22');
        assert.equal(articles[0].dateModified, '2026-10-22');
        assert.equal(articles[0].author.name, 'de arbeidsdeskundige');
        assert.equal(articles[0].image.url, 'https://www.arbeidsdeskundig.com' + IMAGE);
        assert.equal(articles[0].image.width, 1200);
        assert.equal(articles[0].image.height, 675);
        assert.equal(articles[0].mainEntityOfPage, 'https://www.arbeidsdeskundig.com' + PAGE);

        assert.equal(faqs.length, 1);
        assert.deepEqual(
            faqs[0].mainEntity.map((q) => [q.name, q.acceptedAnswer.text]),
            FAQS
        );
        const view = sliceView(html, 'view-tolk');
        const faqHtml = sliceFrom(view, 'id="tolk-faq-list"', '</div>\n      <p>Meer vragen');
        for (const [q, a] of FAQS) {
            assert.match(faqHtml, new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            assert.match(faqHtml, new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }

        assert.equal(crumbs.length, 1);
        assert.ok(crumbs[0].itemListElement.some((it) => it.item === 'https://www.arbeidsdeskundig.com' + PAGE));

        const numbers = phones({ blocks });
        assert.ok(numbers.includes('+31850870307'));
        for (const number of numbers) assert.equal(number, '+31850870307');
    });

    it('links out and is linked back from the kennisbank, werknemer and FAQ', async () => {
        const html = await (await fetch(base + PAGE)).text();
        const view = sliceView(html, 'view-tolk');
        for (const href of [
            '/kennisbank/taalbeheersing-passende-functies-arbeidsdeskundige',
            '/kennisbank/casus-deskundigenoordeel-taalbarriere',
            '/voor/werknemer',
            '/voor/hr-adviseur',
            '/voor/casemanager',
            '/voor/letselschadejurist',
            '/voor/directeur-eigenaar',
            '/keuzehulp',
            '/offerte-aanvragen',
            '/aanmelden',
            '/veelgestelde-vragen',
            'https://matchvermogen.nl/arbeidsdeskundig-onderzoek/anderstalig-onderzoek/',
        ]) {
            assert.match(view, new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
        }

        for (const [path, marker] of [
            ['/kennisbank/taalbeheersing-passende-functies-arbeidsdeskundige', 'id="artikel-body"'],
            ['/kennisbank/casus-deskundigenoordeel-taalbarriere', 'id="artikel-body"'],
        ]) {
            const rel = await (await fetch(base + path)).text();
            const body = sliceFrom(rel, marker, '</div>');
            assert.match(body, new RegExp(`href="${PAGE}"`));
        }

        const werknemer = await (await fetch(base + '/voor/werknemer')).text();
        assert.match(sliceView(werknemer, 'view-persona'), new RegExp(`href="${PAGE}"`));
        assert.doesNotMatch(sliceView(await (await fetch(base + '/voor/hr-adviseur')).text(), 'view-persona'), /persona-tolk-link"[^>]*>Spreek/);

        const faq = await (await fetch(base + '/veelgestelde-vragen')).text();
        const faqView = sliceView(faq, 'view-faq');
        assert.match(faqView, /Kan het onderzoek met een tolk\?/);
        assert.match(faqView, new RegExp(`href="${PAGE}"`));
        const faqBlocks = jsonLd(faq).filter((b) => b['@type'] === 'FAQPage');
        assert.equal(faqBlocks.length, 1);
        assert.ok(faqBlocks[0].mainEntity.some((q) => q.name === 'Kan het onderzoek met een tolk?'));
    });

    it('is listed once in the sitemap and in llms.txt', async () => {
        const xml = await (await fetch(base + '/sitemap.xml')).text();
        const loc = `https://www.arbeidsdeskundig.com${PAGE}`;
        assert.equal((xml.match(new RegExp(loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);

        const llms = await (await fetch(base + '/llms.txt')).text();
        assert.match(llms, new RegExp(loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('serves a 1200x675 jpeg without relying on a live deploy', async () => {
        const file = path.join(__dirname, '..', 'public', 'images', 'arbeidsdeskundige-met-tolk.jpg');
        const meta = await sharp(file).metadata();
        assert.equal(meta.format, 'jpeg');
        assert.equal(meta.width, 1200);
        assert.equal(meta.height, 675);

        const res = await fetch(base + IMAGE);
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /image\/jpeg/);
        const served = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
        assert.equal(served.width, 1200);
        assert.equal(served.height, 675);
    });
});
