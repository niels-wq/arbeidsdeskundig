'use strict';

// Security headers op elke response: homepage, een kennisbankartikel en de sitemap.
// CSP is report-only en moet toestaan wat de site vandaag echt laadt
// (inline script/style, Google Fonts, GA4/GTM, Meta Pixel, Calendly, data:-images,
// same-origin fetch naar /api/chat en de formulieren).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const { issueFormToken } = require('../form-spam');

const PATHS = ['/', '/kennisbank/arbeidsdeskundig-onderzoek-gids', '/sitemap.xml'];

const SECURITY_HEADERS = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-frame-options': 'SAMEORIGIN',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

// Volgorde volgt helmet: defaults eerst, daarna de directives die we toevoegen.
const CSP_REPORT_ONLY = [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: https://matchvermogen.nl https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://*.googletagmanager.com https://*.google-analytics.com https://connect.facebook.net https://assets.calendly.com",
    "script-src-attr 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://assets.calendly.com",
    'upgrade-insecure-requests',
    "frame-src 'self' https://calendly.com https://assets.calendly.com",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://analytics.google.com https://*.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://calendly.com https://assets.calendly.com https://fonts.googleapis.com https://fonts.gstatic.com",
].join(';');

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

function directive(csp, name) {
    const part = csp.split(';').map((s) => s.trim()).find((s) => s === name || s.startsWith(name + ' '));
    assert.ok(part, `CSP mist directive ${name}`);
    return part;
}

describe('security response headers', () => {
    for (const path of PATHS) {
        it(`zet de security headers op ${path}`, async () => {
            const res = await fetch(base + path);
            assert.equal(res.status, 200, path);

            for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
                assert.equal(res.headers.get(name), value, `${path} ${name}`);
            }
            assert.equal(res.headers.get('strict-transport-security').includes('preload'), false);

            assert.equal(res.headers.get('content-security-policy'), null, `${path} mag geen afdwingende CSP hebben`);
            assert.equal(res.headers.get('content-security-policy-report-only'), CSP_REPORT_ONLY, path);

            const csp = res.headers.get('content-security-policy-report-only');
            assert.match(directive(csp, 'frame-ancestors'), /'self'/);
            assert.match(directive(csp, 'script-src'), /'unsafe-inline'/);
            assert.match(directive(csp, 'script-src'), /googletagmanager\.com/);
            assert.match(directive(csp, 'script-src'), /google-analytics\.com/);
            assert.match(directive(csp, 'script-src'), /connect\.facebook\.net/);
            assert.match(directive(csp, 'script-src-attr'), /'unsafe-inline'/);
            assert.match(directive(csp, 'style-src'), /'unsafe-inline'/);
            assert.match(directive(csp, 'style-src'), /fonts\.googleapis\.com/);
            assert.match(directive(csp, 'font-src'), /fonts\.gstatic\.com/);
            assert.match(directive(csp, 'img-src'), /data:/);
            assert.match(directive(csp, 'img-src'), /matchvermogen\.nl/);
            assert.match(directive(csp, 'connect-src'), /'self'/);
            assert.match(directive(csp, 'frame-src'), /calendly\.com/);
            assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
        });
    }

    it('laat de homepage, het kennisbankartikel en de sitemap inhoudelijk heel', async () => {
        const home = await fetch(base + '/');
        const homeHtml = await home.text();
        assert.equal(home.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.match(homeHtml, /fonts\.googleapis\.com/);
        assert.match(homeHtml, /assets\.calendly\.com/);
        assert.match(homeHtml, /googletagmanager\.com\/gtag\/js/);
        assert.match(homeHtml, /connect\.facebook\.net/);
        assert.match(homeHtml, /wa\.me\/31650213593/);
        assert.match(homeHtml, /data:image\/svg\+xml/);

        const article = await fetch(base + '/kennisbank/arbeidsdeskundig-onderzoek-gids');
        const articleHtml = await article.text();
        assert.equal(article.status, 200);
        assert.match(articleHtml, /property="og:image" content="https:\/\/www\.arbeidsdeskundig\.com\/assets\/og\/arbeidsdeskundig-onderzoek-gids\.png"/);

        const sitemap = await fetch(base + '/sitemap.xml');
        const xml = await sitemap.text();
        assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
        assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
        assert.match(xml, /<loc>https:\/\/www\.arbeidsdeskundig\.com\/kennisbank\/arbeidsdeskundig-onderzoek-gids<\/loc>/);
        assert.equal(sitemap.headers.get('access-control-allow-origin'), '*');
    });

    it('laat de chat-widget en een formulier-endpoint hun antwoord houden', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        try {
            const html = await (await fetch(base + '/')).text();
            assert.match(html, /\/chat\/chat-widget\.js/);
            assert.match(html, /\/api\/chat\/message/);

            const chat = await fetch(base + '/api/chat/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: base },
                body: JSON.stringify({ session: 'headersession01', messages: [{ role: 'user', content: 'Hallo' }] }),
            });
            assert.equal(chat.headers.get('content-type').includes('application/json'), true);
            assert.equal(chat.headers.get('permissions-policy'), SECURITY_HEADERS['permissions-policy']);
            assert.equal(chat.headers.get('content-security-policy'), null);
            const body = await chat.json();
            assert.equal(typeof body.ok, 'boolean');

            const lead = await fetch(base + '/api/offerte', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ form_ts: issueFormToken(Date.now() - 5000) }),
            });
            assert.equal(lead.status, 400);
            assert.equal(lead.headers.get('x-content-type-options'), 'nosniff');
            const leadBody = await lead.json();
            assert.equal(leadBody.ok, false);
        } finally {
            delete process.env.CHAT_WIDGET_ENABLED;
        }
    });
});
