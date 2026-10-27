'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { app } = require('../server');

// Ziektewet-posts eindigen het kernpunten-veld met `"] ,` (spatie voor de komma).
// Een stripper die die spatie negeert laat ` ,  ,` achter. Dan parseert het
// client-script niet: reveal blijft op opacity 0, kaarten blijven leeg en
// setView bestaat niet, dus navigatiekliks doen niets.
const ZIEKTEWET_KERNPUNT = 'Spoor 1 bij de ex-werkgever moet ook zonder dienstverband worden afgedicht';
const ZIEKTEWET_BODY = 'Dat klinkt paradoxaal, maar is in de praktijk goed te doen';
const OTHER_BODY = 'hoeft geen uitgebreide voorbereiding';

const ROUTES = [
    '/',
    '/offerte-aanvragen',
    '/aanmelden',
    '/kennisbank',
    '/kennisbank/ziektewet',
    '/kennisbank/maatmanloon-arbeidsdeskundige',
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

function postLine(html, slug) {
    return html.split('\n').find((line) => line.includes('slug:"' + slug + '"')) || '';
}

describe('homepage client script stays valid after article isolation', () => {
    for (const path of ROUTES) {
        it('inline scripts on ' + path + ' parse, so nav and reveal can run', async () => {
            const res = await fetch(base + path);
            assert.equal(res.status, 200);
            const html = await res.text();
            const scripts = executableScripts(html);
            assert.ok(scripts.length >= 1, 'no inline script');
            for (const code of scripts) {
                assert.doesNotThrow(() => new vm.Script(code), 'inline script has a syntax error on ' + path);
            }
            const main = scripts.find((code) => code.includes('function setView'));
            assert.ok(main, 'setView missing, SPA navigation cannot run');
            assert.match(main, /function openArtikel/);
            assert.match(main, /function renderPersonaCards/);
            assert.match(main, /function renderFilters/);
            assert.equal(html.includes(OTHER_BODY), false);
        });
    }

    it('homepage keeps section hooks and drops other article text', async () => {
        const html = await (await fetch(base + '/')).text();
        assert.match(html, /id="persona-cards"/);
        assert.match(html, /id="testimonial-cards"/);
        assert.match(html, /id="logoTape"/);
        assert.match(html, /class="process-step reveal"/);
        assert.match(html, /id="voor-wie"/);
        assert.equal(html.includes(ZIEKTEWET_BODY), false);
        assert.equal(html.includes(ZIEKTEWET_KERNPUNT), false);
        const ziek = postLine(html, 'ziektewet');
        assert.ok(ziek.includes('slug:"ziektewet"'));
        assert.equal(ziek.includes('kernpunten:'), false);
        assert.equal(ziek.includes('faq:'), false);
        assert.equal(/,\s*,/.test(ziek), false, ziek.slice(-80));
    });

    it('the Ziektewet URL keeps its own kernpunten and body', async () => {
        const html = await (await fetch(base + '/kennisbank/ziektewet')).text();
        assert.match(html, new RegExp(ZIEKTEWET_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        const ziek = postLine(html, 'ziektewet');
        assert.match(ziek, /kernpunten:\[/);
        assert.match(ziek, /faq:\[/);
        const other = postLine(html, 'maatmanloon-arbeidsdeskundige');
        assert.equal(other.includes('kernpunten:'), false);
        assert.equal(other.includes('faq:'), false);
        assert.equal(/,\s*,/.test(other), false, other.slice(-80));
    });
});
