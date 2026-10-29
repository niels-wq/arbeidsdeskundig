'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

// Zinnen uit de artikeltekst, niet uit titel of teaser. Zo blijft een korte
// kaart op de kennisbank toegestaan, maar niet de body van een ander artikel.
const VOORBEREIDEN_BODY = 'hoeft geen uitgebreide voorbereiding';
const WERKNEMER_BODY = 'kunnen werknemers dit ook zelf aanvragen';
const ERVARINGEN_BODY = 'binnen enkele minuten van het gesprek weg te zakken';

const ARTICLES = [
    {
        path: '/kennisbank/werknemer-zelf-aanvragen',
        own: WERKNEMER_BODY,
        foreign: [VOORBEREIDEN_BODY, ERVARINGEN_BODY],
    },
    {
        path: '/kennisbank/voorbereiden-gesprek-arbeidsdeskundige',
        own: VOORBEREIDEN_BODY,
        foreign: [WERKNEMER_BODY, ERVARINGEN_BODY],
        phrase: 'gesprek met de arbeidsdeskundige voorbereiden',
    },
    {
        path: '/kennisbank/tips-werknemer-arbeidsdeskundig-onderzoek',
        own: 'zonder medisch te overdelen',
        foreign: [VOORBEREIDEN_BODY, WERKNEMER_BODY, ERVARINGEN_BODY],
    },
    {
        path: '/kennisbank/maatmanloon-arbeidsdeskundige',
        own: 'Het maatmanloon is het uurloon',
        foreign: [VOORBEREIDEN_BODY, WERKNEMER_BODY, ERVARINGEN_BODY],
    },
];

const TITLE_PATHS = [
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
    ...ARTICLES.map((a) => a.path),
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

function collectBlogPostings(node, acc) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((item) => collectBlogPostings(item, acc));
        return;
    }
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('BlogPosting')) acc.push(node);
    for (const value of Object.values(node)) collectBlogPostings(value, acc);
}

describe('SEO: one article per URL', () => {
    for (const spec of ARTICLES) {
        it(`GET ${spec.path} keeps its own body and drops other articles`, async () => {
            const res = await fetch(base + spec.path);
            assert.equal(res.status, 200);
            const html = await res.text();
            assert.ok(html.length < 750000, `HTML still too large: ${html.length} bytes`);
            assert.match(html, new RegExp(spec.own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            for (const foreign of spec.foreign) {
                assert.equal(html.includes(foreign), false, `foreign body leaked: ${foreign}`);
            }

            const blocks = jsonLdBlocks(html);
            assert.ok(blocks.length >= 1);
            const postings = [];
            blocks.forEach((block) => collectBlogPostings(block, postings));
            assert.equal(postings.length, 0, 'BlogPosting of another article is still in the JSON-LD');

            const articles = blocks.filter((b) => b['@type'] === 'Article');
            assert.equal(articles.length, 1);
            assert.match(articles[0].mainEntityOfPage, new RegExp(spec.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));

            const title = html.match(/<title>([^<]+)<\/title>/)[1];
            assert.equal(title.includes(' — '), false, title);
            assert.equal(title.includes('—'), false, title);
            assert.ok(title.endsWith(' | Arbeidsdeskundig.com'), title);

            if (spec.phrase) {
                assert.ok(title.toLowerCase().includes(spec.phrase), title);
                const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
                assert.ok(desc.toLowerCase().includes(spec.phrase), desc);
            }

            assert.match(html, /href="\/offerte-aanvragen"/);
            assert.match(html, /href="\/aanmelden"/);
        });
    }

    for (const path of TITLE_PATHS) {
        it(`title of ${path} uses the brand suffix`, async () => {
            const res = await fetch(base + path);
            assert.equal(res.status, 200);
            const html = await res.text();
            const title = html.match(/<title>([^<]+)<\/title>/)[1];
            assert.equal(title.includes(' — '), false, title);
            assert.equal(title.includes('—'), false, title);
            assert.ok(title.endsWith(' | Arbeidsdeskundig.com'), title);
            const blocks = jsonLdBlocks(html);
            const postings = [];
            blocks.forEach((block) => collectBlogPostings(block, postings));
            assert.equal(postings.length, 0);
        });
    }

    it('homepage and kennisbank keep teasers, not other article bodies', async () => {
        for (const path of ['/', '/kennisbank']) {
            const html = await (await fetch(base + path)).text();
            assert.equal(html.includes(VOORBEREIDEN_BODY), false);
            assert.equal(html.includes(WERKNEMER_BODY), false);
            assert.match(html, /seoTitle:"[^"]+\| Arbeidsdeskundig\.com"/);
            assert.match(html, /slug:"voorbereiden-gesprek-arbeidsdeskundige"/);
            assert.match(html, /title:"Gesprek met de arbeidsdeskundige voorbereiden: wat neem je mee en wat vraag je\?"/);
            assert.ok(html.length < 750000, `${path} still too large: ${html.length}`);
        }
    });

    it('every kennisbank seoTitle in the shell has the suffix and no em dash', async () => {
        const html = await (await fetch(base + '/kennisbank')).text();
        const titles = [...html.matchAll(/seoTitle:"([^"]+)"/g)].map((m) => m[1]);
        assert.ok(titles.length >= 90, `expected article seoTitles, got ${titles.length}`);
        for (const title of titles) {
            assert.equal(title.includes('—'), false, title);
            assert.equal(title.includes(' — '), false, title);
            assert.ok(title.endsWith(' | Arbeidsdeskundig.com'), title);
        }
    });
});
