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
    base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function shortcut(html) {
    const start = html.indexOf('id="fab-ad-advies"');
    assert.notEqual(start, -1, 'snelknop ontbreekt');
    const open = html.lastIndexOf('<a', start);
    const close = html.indexOf('</a>', start);
    return html.slice(open, close + 4);
}

describe('snelknop Gratis AD-advies', () => {
    it('staat op home en in de kennisbank, niet op de generator', async () => {
        const home = await (await fetch(base + '/')).text();
        const artikel = await (await fetch(base + '/kennisbank/wat-doet-arbeidsdeskundige')).text();
        const generator = await (await fetch(base + '/ad-advies-generator')).text();

        for (const html of [home, artikel]) {
            const knop = shortcut(html);
            assert.match(knop, />\s*<span>Gratis AD-advies<\/span>/);
            assert.match(knop, /href="\/ad-advies-generator"/);
            assert.match(knop, /aria-label="Gratis AD-advies\. Opent de adviesgenerator\. Sneltoets Alt\+A\."/);
            assert.match(knop, /title="Gratis AD-advies\. Sneltoets Alt\+A\."/);
            assert.match(knop, /aria-hidden="true"/);
            assert.equal(knop.includes('\u2014'), false);
            assert.equal(knop.includes('\u2013'), false);
        }

        assert.equal(generator.includes('id="fab-ad-advies"'), false);
        assert.equal(generator.includes('class="fab-ad-advies"'), false);
        assert.equal(generator.includes('>Gratis AD-advies<'), false);
    });

    it('stuurt een dataLayer-event en negeert de sneltoets in een invoerveld', async () => {
        const html = await (await fetch(base + '/')).text();
        assert.match(html, /function trackAdAdviesShortcut\(source\)/);
        assert.match(html, /window\.dataLayer && typeof window\.dataLayer\.push === 'function'/);
        assert.match(html, /event: 'ad_advies_shortcut', source: source/);
        assert.match(html, /openAdAdviesShortcut\(event, 'tab'\)/);
        assert.match(html, /openAdAdviesShortcut\(null, 'keyboard'\)/);
        assert.match(html, /e\.code !== 'KeyA'/);
        assert.match(html, /e\.altKey/);
        assert.match(html, /e\.ctrlKey \|\| e\.metaKey \|\| e\.shiftKey/);
        assert.match(html, /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'/);
        assert.match(html, /el\.isContentEditable/);
        assert.match(html, /if\(!document\.getElementById\('fab-ad-advies'\)\) return;/);
        assert.match(html, /\.fab-ad-advies:focus-visible\{outline:3px solid var\(--ink\)/);
    });
});
