'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const formSpam = require('../form-spam');

const captured = [];
const origLog = console.log;
console.log = (...args) => {
    captured.push(args.map(String).join(' '));
    origLog(...args);
};

const { app } = require('../server');

const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTER_FILE = path.join(__dirname, '..', 'data', 'offerte-counter.json');

let server;
let base;

function emailLogs() {
    return captured.filter((line) => line.includes('[Resend niet geconfigureerd]'));
}

function spamLogs() {
    return captured.filter((line) => line.includes('spam gedropt'));
}

function lead(n, extra) {
    return Object.assign({
        naam: `Hilde Boer${n}`,
        email: `hilde.boer${n}@bedrijf.nl`,
        telefoon: `0687001${String(n).padStart(3, '0')}`,
        grootte: 'midden',
        vorm: 'Online',
        form_ts: formSpam.issueFormToken(Date.now() - 5000),
    }, extra);
}

async function post(pathname, body, forwardedFor) {
    const headers = { 'Content-Type': 'application/json' };
    if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
    const res = await fetch(base + pathname, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const contentType = res.headers.get('content-type') || '';
    let json = null;
    if (contentType.includes('json')) {
        try { json = await res.json(); } catch (e) { json = null; }
    }
    return { status: res.status, json, contentType };
}

function assertSilentSpam(lines, reason, email, naam) {
    const fresh = lines.filter((line) => line.includes('spam gedropt'));
    assert.ok(fresh.some((line) => line.endsWith(`spam gedropt (${reason})`)), fresh.join('\n'));
    for (const line of fresh) {
        assert.match(line, /^\[(offerte-pdf|offerte|aanmelden|checklist|bel-me-terug)\] spam gedropt \((honeypot|missing|invalid|too_fast|too_old|rate_limit)\)$/);
        assert.equal(line.includes('@'), false, line);
        if (email) assert.equal(line.includes(email), false, line);
        if (naam) assert.equal(line.includes(naam), false, line);
    }
}

beforeEach(() => formSpam.resetForTests());

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
});

after(async () => {
    console.log = origLog;
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('formulier-tijdstempel', () => {
    it('houdt 3 seconden, 24 uur en 5 inzendingen per 10 minuten aan', () => {
        assert.equal(formSpam.MIN_AGE_MS, 3000);
        assert.equal(formSpam.MAX_AGE_MS, DAY_MS);
        assert.equal(formSpam.RATE_MAX, 5);
        assert.equal(formSpam.RATE_WINDOW_MS, 10 * 60 * 1000);
    });

    it('keurt een handtekening goed vanaf 3 seconden en tot 24 uur', () => {
        const now = 1800000000000;
        assert.equal(formSpam.timingReason(formSpam.issueFormToken(now - 2999), now), 'too_fast');
        assert.equal(formSpam.timingReason(formSpam.issueFormToken(now - 3000), now), null);
        assert.equal(formSpam.timingReason(formSpam.issueFormToken(now - DAY_MS), now), null);
        assert.equal(formSpam.timingReason(formSpam.issueFormToken(now - DAY_MS - 1), now), 'too_old');
    });

    it('weigert een ontbrekend, leeg of vervalst tijdstempel', () => {
        assert.equal(formSpam.timingReason(null), 'missing');
        assert.equal(formSpam.timingReason(''), 'missing');
        assert.equal(formSpam.timingReason('   '), 'missing');
        assert.equal(formSpam.timingReason('abc'), 'invalid');
        const ts = String(Date.now() - 5000);
        const foreign = crypto.createHmac('sha256', 'not-the-secret').update(ts).digest('hex');
        assert.equal(formSpam.timingReason(ts + '.' + foreign), 'invalid');
        const token = formSpam.issueFormToken(Date.now() - 5000);
        const flipped = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
        assert.equal(formSpam.timingReason(flipped), 'invalid');
    });

    it('laat een honeypot voorgaan op een ontbrekend tijdstempel', () => {
        assert.equal(formSpam.assess({ fields: { website: 'http://spam.test' }, ip: '203.0.113.1' }), 'honeypot');
        assert.equal(formSpam.assess({
            fields: { website: 'http://spam.test', form_ts: formSpam.issueFormToken(Date.now() - 5000) },
            ip: '203.0.113.1',
        }), 'honeypot');
        assert.equal(formSpam.assess({ fields: { website: '   ' }, ip: '203.0.113.1' }), 'missing');
    });

    it('telt een te snel of ontbrekend tijdstempel niet mee voor de limiet', () => {
        const ip = '203.0.113.8';
        for (let i = 0; i < 8; i++) {
            assert.equal(formSpam.assess({
                fields: { form_ts: formSpam.issueFormToken(Date.now()) },
                ip,
            }), 'too_fast');
        }
        assert.equal(formSpam.assess({
            fields: { form_ts: formSpam.issueFormToken(Date.now() - 5000) },
            ip,
        }), null);
    });
});

describe('rate limit per IP', () => {
    it('laat 5 inzendingen toe en de zesde niet, en vergeet ze na 10 minuten', () => {
        const ip = '198.51.100.20';
        const start = 1800000000000;
        for (let i = 0; i < 5; i++) assert.equal(formSpam.rateLimit(ip, start), null);
        assert.equal(formSpam.rateLimit(ip, start + 1000), 'rate_limit');
        assert.equal(formSpam.rateLimit(ip, start + 10 * 60 * 1000 - 1), 'rate_limit');
        assert.equal(formSpam.rateLimit(ip, start + 10 * 60 * 1000), null);
        assert.equal(formSpam.rateLimit('198.51.100.21', start), null);
    });

    it('leest het clientadres achter de Railway-proxy uit X-Forwarded-For', () => {
        assert.equal(formSpam.clientIp({
            headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.50' },
            ip: '10.0.0.5',
        }), '203.0.113.50');
        assert.equal(formSpam.clientIp({
            headers: { 'x-forwarded-for': '203.0.113.50' },
            ip: '10.0.0.5',
        }), '203.0.113.50');
        assert.equal(formSpam.clientIp({
            headers: { 'x-forwarded-for': ' 9.9.9.9 , 203.0.113.9 ' },
            socket: { remoteAddress: '10.0.0.1' },
        }), '203.0.113.9');
        assert.equal(formSpam.clientIp({ headers: {}, ip: '::ffff:127.0.0.1' }), '127.0.0.1');
        assert.equal(formSpam.clientIp({ headers: {}, socket: { remoteAddress: '::ffff:192.0.2.10' } }), '192.0.2.10');
        assert.equal(formSpam.clientIp({ headers: {} }), 'unknown');
    });
});

describe('spam wordt stil gedropt', () => {
    const paths = ['/api/offerte', '/api/aanmelden', '/api/checklist', '/api/bel-me-terug', '/api/offerte-pdf'];

    function bodyFor(pathname, n) {
        const baseLead = lead(n);
        if (pathname === '/api/aanmelden') {
            return {
                naam: baseLead.naam,
                email: baseLead.email,
                telefoon: baseLead.telefoon,
                dienst: 'Regulier onderzoek',
                wet: 'Wet Verbetering Poortwachter',
                vorm: 'Online',
                grootte: 'midden',
            };
        }
        if (pathname === '/api/checklist') return { naam: baseLead.naam, email: baseLead.email };
        if (pathname === '/api/bel-me-terug') return { naam: baseLead.naam, telefoon: baseLead.telefoon };
        return {
            naam: baseLead.naam,
            email: baseLead.email,
            telefoon: baseLead.telefoon,
            grootte: 'midden',
            vorm: 'Online',
        };
    }

    it('dropt elk formulier zonder tijdstempel, zonder mail', async () => {
        for (const pathname of paths) {
            const beforeMails = emailLogs().length;
            const beforeSpam = spamLogs().length;
            const body = bodyFor(pathname, 10 + paths.indexOf(pathname));
            const { status, json, contentType } = await post(pathname, body, '203.0.113.10');
            assert.equal(status, 200, pathname);
            assert.equal(json.ok, true, pathname);
            assert.match(contentType, /json/, pathname);
            assert.equal(emailLogs().length, beforeMails, pathname);
            assertSilentSpam(spamLogs().slice(beforeSpam), 'missing', body.email || '', body.naam);
        }
    });

    it('dropt een gevulde honeypot ook als de rest klopt', async () => {
        const body = lead(20, { website: 'http://spam.test' });
        const beforeMails = emailLogs().length;
        const beforeSpam = spamLogs().length;
        const { status, json } = await post('/api/offerte', body, '203.0.113.20');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(emailLogs().length, beforeMails);
        assertSilentSpam(spamLogs().slice(beforeSpam), 'honeypot', body.email, body.naam);
    });

    it('dropt een inzending die sneller dan 3 seconden terugkomt', async () => {
        const body = lead(21, { form_ts: formSpam.issueFormToken(Date.now()) });
        const beforeMails = emailLogs().length;
        const beforeSpam = spamLogs().length;
        const { status, json } = await post('/api/offerte', body, '203.0.113.21');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(emailLogs().length, beforeMails);
        assertSilentSpam(spamLogs().slice(beforeSpam), 'too_fast', body.email, body.naam);
    });

    it('dropt een tijdstempel ouder dan 24 uur', async () => {
        const body = lead(22, { form_ts: formSpam.issueFormToken(Date.now() - DAY_MS - 5000) });
        const beforeMails = emailLogs().length;
        const beforeSpam = spamLogs().length;
        const { status, json } = await post('/api/offerte', body, '203.0.113.22');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(emailLogs().length, beforeMails);
        assertSilentSpam(spamLogs().slice(beforeSpam), 'too_old', body.email, body.naam);
    });

    it('dropt een ongeldige handtekening', async () => {
        const token = formSpam.issueFormToken(Date.now() - 5000);
        const body = lead(23, { form_ts: token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a') });
        const beforeMails = emailLogs().length;
        const beforeSpam = spamLogs().length;
        const { status, json } = await post('/api/offerte', body, '203.0.113.23');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(emailLogs().length, beforeMails);
        assertSilentSpam(spamLogs().slice(beforeSpam), 'invalid', body.email, body.naam);
    });

    it('dropt de zesde inzending van hetzelfde IP en niet die van een ander IP', async () => {
        const shared = '198.51.100.1, 203.0.113.50';
        for (let i = 1; i <= 5; i++) {
            const body = lead(30 + i);
            const { status, json } = await post('/api/offerte', body, shared);
            assert.equal(status, 200);
            assert.equal(json.ok, true);
            assert.ok(emailLogs().some((line) => line.includes(body.naam) && line.includes('info@matchvermogen.nl')));
        }
        const blocked = lead(36);
        const beforeMails = emailLogs().length;
        const beforeSpam = spamLogs().length;
        const sixth = await post('/api/offerte', blocked, shared);
        assert.equal(sixth.status, 200);
        assert.equal(sixth.json.ok, true);
        assert.equal(emailLogs().length, beforeMails);
        assert.equal(emailLogs().some((line) => line.includes(blocked.email)), false);
        assertSilentSpam(spamLogs().slice(beforeSpam), 'rate_limit', blocked.email, blocked.naam);

        const other = lead(37);
        const allowed = await post('/api/offerte', other, '198.51.100.1');
        assert.equal(allowed.status, 200);
        assert.equal(allowed.json.ok, true);
        assert.ok(emailLogs().some((line) => line.includes(other.naam) && line.includes('info@matchvermogen.nl')));
    });

    it('maakt geen PDF en schrijft geen offertenummer weg voor spam', async () => {
        const before = fs.existsSync(COUNTER_FILE) ? fs.readFileSync(COUNTER_FILE, 'utf8') : null;
        const body = lead(40, { form_ts: formSpam.issueFormToken(Date.now()) });
        const { status, json, contentType } = await post('/api/offerte-pdf', body, '203.0.113.40');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.match(contentType, /json/);
        assert.equal(emailLogs().some((line) => line.includes(body.email)), false);
        const after = fs.existsSync(COUNTER_FILE) ? fs.readFileSync(COUNTER_FILE, 'utf8') : null;
        assert.equal(after, before);
    });
});

describe('een echte inzending gaat door', () => {
    it('mailt een offerte met een geldig tijdstempel', async () => {
        const body = lead(50);
        const beforeSpam = spamLogs().length;
        const { status, json } = await post('/api/offerte', body, '203.0.113.77');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(json.test, false);
        assert.equal(spamLogs().length, beforeSpam);
        assert.ok(emailLogs().some((line) => line.includes(body.naam) && line.includes('info@matchvermogen.nl')));
        assert.ok(emailLogs().some((line) => line.includes(body.email)));
    });
});

describe('verborgen velden op de pagina', () => {
    const honeypot = (id) => new RegExp(
        `<label class="hp-field" aria-hidden="true"><span>Website</span><input type="text" id="${id}" name="website" tabindex="-1" autocomplete="off"></label>`
    );

    async function page(pathname) {
        const res = await fetch(base + pathname);
        const html = await res.text();
        return { status: res.status, html };
    }

    function assertFields(html) {
        assert.match(html, /\.hp-field\{position:absolute !important; left:-10000px;/);
        for (const id of ['of-website', 'inp-website', 'cl-website', 'bt-website']) {
            assert.match(html, honeypot(id));
        }
        assert.doesNotMatch(html, /__FORM_TS__/);
        const tokens = [...html.matchAll(/name="form_ts" value="(\d+\.[a-f0-9]{64})"/g)].map((m) => m[1]);
        assert.equal(tokens.length, 4);
        assert.equal(new Set(tokens).size, 1);
        assert.equal(formSpam.timingReason(tokens[0]), 'too_fast');
        assert.match(html, /function formSpamToken\(\)/);
        assert.match(html, /payload\.form_ts = formSpamToken\(\)/);
    }

    it('rendert offerte, aanmelden en de homepage met honeypot en tijdstempel', async () => {
        for (const pathname of ['/', '/offerte-aanvragen', '/aanmelden']) {
            const { status, html } = await page(pathname);
            assert.equal(status, 200, pathname);
            assertFields(html);
        }
        const offerte = await page('/offerte-aanvragen');
        assert.match(offerte.html, /<h1[^>]*>Vraag je offerte aan/);
        const aanmelden = await page('/aanmelden');
        assert.match(aanmelden.html, /id="view-aanmelden"/);
        assert.match(aanmelden.html, /id="form-step-1"/);
    });

    it('geeft het chat-formulier hetzelfde tijdstempel en een honeypot buiten beeld', async () => {
        const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat', 'chat-widget.js'), 'utf8');
        const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat', 'chat-widget.css'), 'utf8');
        assert.match(js, /name="form_ts"/);
        assert.match(js, /form_ts: v\('form_ts'\)/);
        assert.match(js, /<p class="adc-chat__hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"><\/label><\/p>/);
        assert.match(css, /\.adc-chat__hp\{position:absolute!important;left:-9999px!important;/);

        const prev = process.env.CHAT_WIDGET_ENABLED;
        process.env.CHAT_WIDGET_ENABLED = 'true';
        try {
            const { status, html } = await page('/');
            assert.equal(status, 200);
            const field = html.match(/name="form_ts" value="(\d+\.[a-f0-9]{64})"/);
            const cfg = html.match(/"formTs":"(\d+\.[a-f0-9]{64})"/);
            assert.ok(field && cfg);
            assert.equal(field[1], cfg[1]);
            assert.equal(formSpam.timingReason(cfg[1]), 'too_fast');
        } finally {
            if (prev === undefined) delete process.env.CHAT_WIDGET_ENABLED;
            else process.env.CHAT_WIDGET_ENABLED = prev;
        }
    });
});
