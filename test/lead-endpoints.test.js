'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const captured = [];
const origLog = console.log;
console.log = (...args) => {
    captured.push(args.map(String).join(' '));
    origLog(...args);
};

const { app } = require('../server');

let server;
let base;

function emailLogs() {
    return captured.filter((line) => line.includes('[Resend niet geconfigureerd]'));
}

async function post(path, body) {
    const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, json };
}

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

describe('POST /api/offerte', () => {
    it('rejects empty submissions instead of mailing onbekend', async () => {
        const beforeCount = emailLogs().length;
        const { status, json } = await post('/api/offerte', {});
        assert.equal(status, 400);
        assert.equal(json.ok, false);
        assert.match(json.error, /naam|e-mail|telefoon/i);
        assert.equal(emailLogs().length, beforeCount);
        assert.equal(emailLogs().some((l) => /onbekend/i.test(l)), false);
    });

    it('rejects a bare POST with no JSON body', async () => {
        const beforeCount = emailLogs().length;
        const res = await fetch(base + '/api/offerte', { method: 'POST' });
        assert.equal(res.status, 400);
        const json = await res.json();
        assert.equal(json.ok, false);
        assert.equal(emailLogs().length, beforeCount);
    });

    it('rejects placeholder name onbekend', async () => {
        const beforeCount = emailLogs().length;
        const { status, json } = await post('/api/offerte', {
            naam: 'onbekend',
            email: 'jan@bedrijf.nl',
            telefoon: '0612345678',
        });
        assert.equal(status, 400);
        assert.equal(json.ok, false);
        assert.equal(emailLogs().length, beforeCount);
    });

    it('silently accepts a honeypot fill without sending mail', async () => {
        const beforeCount = emailLogs().length;
        const { status, json } = await post('/api/offerte', {
            naam: 'Jan Jansen',
            email: 'jan@bedrijf.nl',
            telefoon: '0612345678',
            website: 'http://spam.test',
        });
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(emailLogs().length, beforeCount);
    });

    it('accepts a complete offerte and uses the real name in the subject', async () => {
        const { status, json } = await post('/api/offerte', {
            'of-naam': 'Piet Pietersen',
            'of-email': 'piet@bedrijf.nl',
            'of-telefoon': '0612345678',
            grootte: 'midden',
            vorm: 'Online',
            bron: 'offerte-contact',
        });
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        const mailed = emailLogs().filter((l) => l.includes('Piet Pietersen'));
        assert.ok(mailed.length >= 1, 'expected notify mail to include the real name');
        assert.equal(mailed.some((l) => /onbekend/i.test(l)), false);
    });

    it('does not mail info@ for example.com / test payloads', async () => {
        const before = emailLogs().length;
        const { status, json } = await post('/api/offerte', {
            naam: 'Piet Tester',
            email: 'piet.tester@example.com',
            telefoon: '0612345678',
        });
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        const newLogs = emailLogs().slice(before);
        assert.equal(newLogs.some((l) => l.includes('info@matchvermogen.nl')), false);
    });

    it('does not send a second info@ mail for a duplicate submit', async () => {
        const payload = {
            naam: 'Lisa Duplo',
            email: 'lisa.duplo@bedrijf.nl',
            telefoon: '0687654321',
            vorm: 'Fysiek',
            grootte: 'klein',
        };
        const first = await post('/api/offerte', payload);
        assert.equal(first.status, 200);
        const afterFirst = emailLogs().filter((l) => l.includes('Lisa Duplo') && l.includes('info@matchvermogen.nl')).length;
        assert.equal(afterFirst, 1);
        const second = await post('/api/offerte', payload);
        assert.equal(second.status, 200);
        const afterSecond = emailLogs().filter((l) => l.includes('Lisa Duplo') && l.includes('info@matchvermogen.nl')).length;
        assert.equal(afterSecond, 1);
    });
});

describe('POST /api/bel-me-terug', () => {
    it('rejects missing phone', async () => {
        const beforeCount = emailLogs().length;
        const { status, json } = await post('/api/bel-me-terug', { naam: 'Jan Jansen' });
        assert.equal(status, 400);
        assert.equal(json.ok, false);
        assert.equal(emailLogs().length, beforeCount);
    });

    it('accepts name + phone', async () => {
        const { status, json } = await post('/api/bel-me-terug', {
            'bt-naam': 'Anna Bakker',
            'bt-telefoon': '0611223344',
            'bt-moment': 'Morgen',
        });
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.ok(emailLogs().some((l) => l.includes('Anna Bakker')));
    });
});

describe('POST /api/checklist', () => {
    it('rejects missing email', async () => {
        const { status } = await post('/api/checklist', { 'cl-naam': 'Jan Jansen' });
        assert.equal(status, 400);
    });

    it('accepts name + email', async () => {
        const { status, json } = await post('/api/checklist', {
            'cl-naam': 'Chris Mol',
            'cl-email': 'chris@bedrijf.nl',
        });
        assert.equal(status, 200);
        assert.equal(json.ok, true);
    });
});

describe('POST /api/aanmelden', () => {
    it('rejects contact-only payload without service type', async () => {
        const beforeCount = emailLogs().length;
        const { status, json } = await post('/api/aanmelden', {
            'inp-aanvrager-naam': 'Sara de Vries',
            'inp-aanvrager-email': 'sara@bedrijf.nl',
            'inp-aanvrager-tel': '0850870307',
        });
        assert.equal(status, 400);
        assert.match(json.error, /dienstverlening/i);
        assert.equal(emailLogs().length, beforeCount);
    });

    it('accepts a complete aanmelding including dienst', async () => {
        const { status, json } = await post('/api/aanmelden', {
            'inp-aanvrager-naam': 'Sara de Vries',
            'inp-aanvrager-email': 'sara@bedrijf.nl',
            'inp-aanvrager-tel': '0850870307',
            dienst: 'Regulier onderzoek',
            wet: 'Wet Verbetering Poortwachter',
            vorm: 'Online',
            grootte: 'midden',
        });
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.ok(emailLogs().some((l) => l.includes('Sara de Vries')));
    });
});
