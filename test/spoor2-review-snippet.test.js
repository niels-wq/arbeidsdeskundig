'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app } = require('../server');

const PATH = '/kennisbank/spoor2';
const QUOTE = 'Top gozer, denkt met je mee op alle vlakken. Een bewijs dat er toch nog menselijke mensen in de wereld zijn.';
const CAPTION = 'Ronny R. · Google-review van Best Match Re-integratie (★★★★★)';

const ABSENT_ON = [
    '/',
    '/kennisbank',
    '/kennisbank/spoor2-kosten',
    '/kennisbank/kosten-arbeidsdeskundig-onderzoek',
    '/kennisbank/goedkoopste-arbeidsdeskundig-onderzoek',
    '/kennisbank/ziektewet',
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

function jsonLdBlocks(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
    return blocks;
}

function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((item) => walk(item, visit));
        return;
    }
    visit(node);
    for (const value of Object.values(node)) walk(value, visit);
}

describe('spoor 2 review snippet', () => {
    it('staat in de server-HTML van /kennisbank/spoor2, zonder review-schema', async () => {
        const res = await fetch(base + PATH);
        assert.equal(res.status, 200);
        const html = await res.text();

        const bodyAt = html.indexOf('id="artikel-body">');
        const faqAt = html.indexOf('id="artikel-faq-wrap"', bodyAt);
        assert.ok(bodyAt !== -1 && faqAt > bodyAt);
        const body = html.slice(bodyAt, faqAt);
        assert.equal((body.match(/class="card review-snippet"/g) || []).length, 1);
        assert.match(body, new RegExp(QUOTE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(body, new RegExp(CAPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        const snippetStart = body.indexOf('class="card review-snippet"');
        const snippet = body.slice(snippetStart, body.indexOf('</div>', snippetStart));
        assert.equal(snippet.includes('—'), false);
        assert.equal(snippet.includes('–'), false);

        assert.match(body, /Vink dit mee aan in het aanmeldformulier/);
        assert.match(body, /start met een arbeidsdeskundig onderzoek/);
        assert.match(html, /Direct offerte & planning/);

        const scripts = executableScripts(html);
        for (const code of scripts) {
            assert.doesNotThrow(() => new vm.Script(code));
        }
        const main = scripts.find((code) => code.includes('function setView'));
        assert.ok(main);
        assert.match(main, /function openArtikel/);

        for (const block of jsonLdBlocks(html)) {
            walk(block, (node) => {
                const types = [].concat(node['@type'] || []);
                assert.equal(types.includes('Review'), false);
                assert.equal(types.includes('AggregateRating'), false);
                assert.equal(node.review, undefined);
                assert.equal(node.aggregateRating, undefined);
                assert.equal(node.ratingValue, undefined);
            });
        }
    });

    for (const path of ABSENT_ON) {
        it('staat niet op ' + path, async () => {
            const res = await fetch(base + path);
            assert.equal(res.status, 200);
            const html = await res.text();
            assert.equal(html.includes(QUOTE), false);
            assert.equal(html.includes('class="card review-snippet"'), false);
            assert.equal(html.includes(CAPTION), false);
        });
    }
});
