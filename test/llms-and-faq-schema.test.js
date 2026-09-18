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

function parseLdJsonBlocks(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        blocks.push(JSON.parse(m[1]));
    }
    return blocks;
}

function faqPages(html) {
    return parseLdJsonBlocks(html).filter((b) => b['@type'] === 'FAQPage');
}

function graphTypes(html) {
    const types = [];
    for (const block of parseLdJsonBlocks(html)) {
        if (Array.isArray(block['@graph'])) {
            for (const node of block['@graph']) {
                if (node && node['@type']) types.push(node['@type']);
            }
        } else if (block['@type']) {
            types.push(block['@type']);
        }
    }
    return types;
}

describe('llms.txt', () => {
    it('serves a curated machine-readable summary, not a thin article dump', async () => {
        const res = await fetch(base + '/llms.txt');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/plain/);
        const txt = await res.text();

        assert.match(txt, /^# arbeidsdeskundig\.com/m);
        assert.match(txt, /vanaf €1\.095/);
        assert.match(txt, /binnen 24 uur/i);
        assert.match(txt, /## Wat we wel doen/);
        assert.match(txt, /## Wat we niet doen/);
        assert.match(txt, /Geen medische diagnose/);
        assert.match(txt, /## Verhouding tot matchvermogen\.nl/);
        assert.match(txt, /https:\/\/matchvermogen\.nl/);
        assert.match(txt, /Complementair/);

        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/offerte-aanvragen/);
        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/aanmelden/);
        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/kennisbank/);
        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/veelgestelde-vragen/);
        assert.match(txt, /kennisbank\/arbeidsdeskundig-onderzoek-gids/);
        assert.match(txt, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(txt, /kennisbank\/arbeidsdeskundig-rapport-voorbeeld/);
        assert.match(txt, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(txt, /kennisbank\/second-opinion-arbeidsdeskundige/);
        assert.match(txt, /kennisbank\/belastbaarheid-verouderd-nieuwe-fml-izp/);

        assert.doesNotMatch(txt, /casus-60plus/);
        assert.doesNotMatch(txt, /### Basiskennis/);
        assert.doesNotMatch(txt, /Kennisbank, per onderwerp/);
        assert.ok(txt.length < 8000, `llms.txt should stay curated, got ${txt.length} chars`);
    });

    it('is also available at /.well-known/llms.txt', async () => {
        const res = await fetch(base + '/.well-known/llms.txt');
        assert.equal(res.status, 200);
        const txt = await res.text();
        assert.match(txt, /vanaf €1\.095/);
        assert.match(txt, /\/aanmelden/);
    });
});

describe('robots.txt AI-bot allows', () => {
    it('keeps GPTBot and other AI crawlers allowed', async () => {
        const res = await fetch(base + '/robots.txt');
        assert.equal(res.status, 200);
        const txt = await res.text();
        for (const bot of ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']) {
            assert.match(txt, new RegExp(`User-agent: ${bot}\\s+Allow: /`));
        }
        assert.doesNotMatch(txt, /Disallow: \//);
        assert.match(txt, /\/llms\.txt/);
    });
});

describe('FAQPage structured data is page-specific', () => {
    it('homepage FAQPage matches the two visible homepage questions', async () => {
        const res = await fetch(base + '/');
        assert.equal(res.status, 200);
        const html = await res.text();
        const pages = faqPages(html);
        assert.equal(pages.length, 1, 'homepage should have exactly one FAQPage');
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.deepEqual(names, [
            'Wat kost een arbeidsdeskundig onderzoek?',
            'Kan het onderzoek ook fysiek?',
        ]);
        assert.match(pages[0].mainEntity[0].acceptedAnswer.text, /€1\.095/);
        assert.doesNotMatch(graphTypes(html).join(','), /FAQPage.*FAQPage/);
        assert.ok(!graphTypes(html).includes('FAQPage') || pages.length === 1);
        assert.ok(!parseLdJsonBlocks(html).some((b) => Array.isArray(b['@graph']) && b['@graph'].some((n) => n['@type'] === 'FAQPage')));
    });

    it('FAQ hub has SSR questions and matching FAQPage schema', async () => {
        const res = await fetch(base + '/veelgestelde-vragen');
        assert.equal(res.status, 200);
        const html = await res.text();
        const pages = faqPages(html);
        assert.equal(pages.length, 1);
        assert.ok(pages[0].mainEntity.length >= 14, `expected full FAQ, got ${pages[0].mainEntity.length}`);
        assert.ok(pages[0].mainEntity.some((q) => /second opinion/i.test(q.name)));
        assert.ok(pages[0].mainEntity.some((q) => /€1\.095/.test(q.acceptedAnswer.text)));
        assert.match(html, /id="faq-list"[^>]*>[\s\S]*Wat kost een arbeidsdeskundig onderzoek\?/);
        assert.match(html, /id="faq-list"[^>]*>[\s\S]*Is een arbeidsdeskundig onderzoek verplicht\?/);
    });

    it('does not repeat FAQPage on conversion or casus pages', async () => {
        for (const path of ['/offerte-aanvragen', '/aanmelden', '/kennisbank/casus-wga']) {
            const res = await fetch(base + path);
            assert.equal(res.status, 200, path);
            const html = await res.text();
            assert.equal(faqPages(html).length, 0, `${path} should not carry FAQPage`);
        }
    });

    it('knowledge articles keep their own FAQPage only', async () => {
        const res = await fetch(base + '/kennisbank/wat-doet-arbeidsdeskundige');
        assert.equal(res.status, 200);
        const html = await res.text();
        const pages = faqPages(html);
        assert.equal(pages.length, 1);
        assert.ok(pages[0].mainEntity.some((q) => /diagnose/i.test(q.name) || /bedrijfsarts/i.test(q.name)));
        assert.ok(!pages[0].mainEntity.some((q) => q.name === 'Kan het onderzoek ook fysiek?'));
    });
});
