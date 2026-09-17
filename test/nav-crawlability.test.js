'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

const PUBLIC_NAV = [
    { href: '/', label: 'Home' },
    { href: '/rekentool', label: 'Rekentool' },
    { href: '/offerte-aanvragen', label: 'Offerte' },
    { href: '/kennisbank', label: 'Kennisbank' },
    { href: '/veelgestelde-vragen', label: 'FAQ' },
    { href: '/over-ons', label: 'Over ons' },
    { href: '/keuzehulp', label: 'Adviestool' },
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

function sliceById(html, id, closeTag) {
    const open = html.indexOf(`id="${id}"`);
    assert.notEqual(open, -1, `missing #${id}`);
    const start = html.indexOf('>', open) + 1;
    const end = html.indexOf(closeTag, start);
    assert.notEqual(end, -1, `unclosed #${id}`);
    return html.slice(start, end);
}

function assertCrawlableNav(inner, id) {
    for (const item of PUBLIC_NAV) {
        const hrefRe = new RegExp(
            `<a\\b[^>]*\\bhref="${item.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>\\s*${item.label}\\s*</a>`
        );
        assert.match(inner, hrefRe, `${id} missing crawlable <a href="${item.href}">${item.label}</a>`);
    }
    assert.doesNotMatch(inner, /<button\b/i, `${id} still uses buttons instead of links`);
}

describe('primary nav crawlability', () => {
    it('homepage HTML contains real <a href> links for public destinations', async () => {
        const res = await fetch(base + '/');
        assert.equal(res.status, 200);
        const html = await res.text();
        const header = html.slice(html.indexOf('<header'), html.indexOf('</header>') + 9);

        assertCrawlableNav(sliceById(header, 'navDesktop', '</nav>'), 'navDesktop');
        assertCrawlableNav(sliceById(header, 'navMobile', '</nav>'), 'navMobile');

        assert.match(header, /<a class="logo" href="\/"/);
        assert.match(
            header,
            /<a class="btn-primary" href="\/offerte-aanvragen"[^>]*>\s*Direct offerte\s*<\/a>/
        );

        const stickyOpen = html.indexOf('class="sticky-cta"');
        assert.notEqual(stickyOpen, -1, 'missing .sticky-cta');
        const stickyStart = html.indexOf('>', stickyOpen) + 1;
        const stickyEnd = html.indexOf('</div>', stickyStart);
        const sticky = html.slice(stickyStart, stickyEnd);
        assert.match(
            sticky,
            /<a class="btn-primary" href="\/offerte-aanvragen"[^>]*>\s*Direct offerte &(?:amp;)? planning — reactie binnen 24 uur\s*<\/a>/
        );
    });
});
