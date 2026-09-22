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

async function get(path) {
    const res = await fetch(base + path);
    const html = await res.text();
    return { status: res.status, html };
}

function sliceView(html, id) {
    const open = html.indexOf(`id="${id}"`);
    assert.notEqual(open, -1, `missing #${id}`);
    const start = html.lastIndexOf('<div', open);
    let depth = 0;
    let i = start;
    while (i < html.length) {
        if (html.startsWith('<div', i)) depth += 1;
        else if (html.startsWith('</div>', i)) {
            depth -= 1;
            if (depth === 0) return html.slice(start, i + 6);
        }
        i += 1;
    }
    return html.slice(start);
}

describe('UX top-3: cookie banner, homepage scan, kennisbank listing', () => {
    it('cookie banner stays available but is a compact light card, not a full-bleed bar', async () => {
        const { status, html } = await get('/');
        assert.equal(status, 200);

        const open = html.indexOf('id="cookie-banner"');
        assert.notEqual(open, -1, 'missing cookie banner');
        const start = html.lastIndexOf('<div', open);
        const end = html.indexOf('</div>', start);
        const banner = html.slice(start, end + 6);

        assert.match(banner, /class="[^"]*\bcookie-banner\b/);
        assert.match(banner, /setCookieConsent\(false\)/);
        assert.match(banner, /setCookieConsent\(true\)/);
        assert.match(banner, /Alleen noodzakelijk/);
        assert.match(banner, /Accepteren/);
        assert.doesNotMatch(banner, /position:fixed; left:0; right:0; bottom:0/);
        assert.doesNotMatch(banner, /background:var\(--ink\)/);
        assert.match(html, /\.cookie-banner\{/);
        assert.match(html, /max-width:min\(380px/);
        assert.match(html, /--cookie-banner-offset/);
        assert.match(html, /function updateBottomBarOffset/);
        assert.match(html, /cookieOpen && narrow/);
    });

    it('homepage has in-page section jumps and one clear primary CTA family', async () => {
        const { status, html } = await get('/');
        assert.equal(status, 200);
        const home = sliceView(html, 'view-home');

        assert.match(home, /class="[^"]*\bhome-jump\b/);
        assert.match(home, /href="\/#voor-wie"/);
        assert.match(home, /href="\/#proces"/);
        assert.match(home, /href="\/#vorm"/);
        assert.match(home, /href="\/#onderwerpen"/);
        assert.match(home, /href="\/#home-faq"/);
        assert.match(home, /id="voor-wie"/);
        assert.match(home, /id="proces"/);
        assert.match(home, /id="vorm"/);
        assert.match(home, /id="onderwerpen"/);
        assert.match(home, /id="home-faq"/);
        assert.match(html, /function goHomeSection\(/);

        const primaryRe = /class="btn-primary"[^>]*>/g;
        const labels = [];
        let m;
        while ((m = primaryRe.exec(home))) {
            const close = home.indexOf('<', m.index + m[0].length);
            labels.push(home.slice(m.index + m[0].length, close).replace(/&amp;/g, '&').trim());
        }
        assert.ok(labels.includes('Direct offerte & planning'), 'hero primary must stay');
        assert.ok(labels.includes('Direct offerte'), 'mid-page primary must reuse the offerte label');
        assert.ok(!labels.includes('Bereken jouw tijdwinst'), 'calculator CTA must not be primary on homepage');
        assert.ok(!labels.includes('Bereken het effect van vroeg starten'), 'WHK calculator CTA must not be primary');
        assert.ok(!labels.includes('Vraag onderzoek + Spoor 2 aan'), 'spoor-2 label must not compete as a second primary');
        assert.match(home, /class="btn-ghost"[^>]*>Bereken jouw tijdwinst</);
    });

    it('kennisbank listing groups chips and has a stronger intro CTA', async () => {
        const { status, html } = await get('/kennisbank');
        assert.equal(status, 200);
        const view = sliceView(html, 'view-kennisbank');

        assert.match(view, /id="kb-intro-cta"/);
        assert.match(view, /href="\/offerte-aanvragen"/);
        assert.match(view, />Direct offerte</);
        assert.match(view, /Twijfel je over jouw dossier\?/);
        assert.match(html, /PRIMARY_KB_TAGS/);
        assert.match(html, /Meer categorieën/);
        assert.match(html, /kbFiltersExpanded/);
    });

    it('does not gut offerte/aanmelden conversion from PR #16', async () => {
        const offerte = await get('/offerte-aanvragen');
        assert.equal(offerte.status, 200);
        assert.match(offerte.html, /<body class="conv-page conv-offerte">/);
        const offerteView = sliceView(offerte.html, 'view-offerte');
        assert.match(offerteView, /<h1[^>]*>Vraag je offerte aan — vanaf €1\.095,-<\/h1>/);
        assert.match(offerteView, /id="btn-of-direct"[^>]*>Offerte aanvragen</);
        assert.match(offerteView, /Liever eerst kennismaken of bellen/);
        assert.match(offerteView, /calendly\.com\/matchvermogen\/call-15-min/);

        const aanmeld = await get('/aanmelden');
        assert.equal(aanmeld.status, 200);
        assert.match(aanmeld.html, /<body class="conv-page conv-aanmelden">/);
        const aanmeldView = sliceView(aanmeld.html, 'view-aanmelden');
        assert.match(aanmeldView, /<h1[^>]*>Meld je onderzoek aan — vanaf €1\.095,-<\/h1>/);
        assert.match(aanmeldView, /id="form-step-1"/);
        assert.match(aanmeldView, /id="form-step-6"/);
        assert.match(aanmeldView, /Liever eerst kennismaken of bellen/);
    });
});
