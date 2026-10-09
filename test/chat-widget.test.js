'use strict';

// Chatbot + contactknop (preview). Staat standaard UIT (CHAT_WIDGET_ENABLED);
// productie mag niets merken zolang de vlag niet aan staat.

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const captured = [];
const origLog = console.log;
console.log = (...args) => { captured.push(args.map(String).join(' ')); origLog(...args); };

delete process.env.CHAT_WIDGET_ENABLED;
delete process.env.XAI_API_KEY;
const { app } = require('../server');
const gate = require('../chat/gate');
const flow = require('../chat/flow');

let server, base, mock, mockBase;
let mockReply = { content: 'Hallo' };
let mockCalls = [];

before(async () => {
    await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}`;
    mock = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            mockCalls.push({ headers: req.headers, body: JSON.parse(body || '{}') });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ message: mockReply }] }));
        });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    mockBase = `http://127.0.0.1:${mock.address().port}`;
});

after(async () => {
    console.log = origLog;
    await new Promise((r) => server.close(r));
    await new Promise((r) => mock.close(r));
});

afterEach(() => {
    delete process.env.CHAT_WIDGET_ENABLED;
    delete process.env.XAI_API_KEY;
    delete process.env.XAI_API_BASE;
});

let sid = 0;
function session() { sid += 1; return 'testsession' + String(sid).padStart(6, '0'); }

async function chat(body, headers = {}) {
    const res = await fetch(base + '/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, json };
}

const PRICE_Q = 'Wat kost een arbeidsdeskundig onderzoek?';
function convo(...turns) {
    return turns.map((c, i) => ({ role: i % 2 ? 'assistant' : 'user', content: c }));
}

describe('chat flag (standaard uit)', () => {
    it('injecteert niets in de HTML als CHAT_WIDGET_ENABLED niet aan staat', async () => {
        const html = await (await fetch(base + '/')).text();
        assert.equal(html.includes('chat-widget'), false);
        assert.equal(html.includes('AD_CHAT'), false);
        assert.match(html, /class="fab-whatsapp"/);
    });

    it('geeft 404 op de chat-API en de widget-bestanden als de vlag uit staat', async () => {
        const { status } = await chat({ session: session(), messages: convo('hoi') });
        assert.equal(status, 404);
        assert.equal((await fetch(base + '/chat/chat-widget.js')).status, 404);
        assert.equal((await fetch(base + '/chat/chat-widget.css')).status, 404);
    });

    it('laadt de widget op elke pagina als de vlag aan staat', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        for (const p of ['/', '/offerte-aanvragen', '/kennisbank/wat-doet-arbeidsdeskundige']) {
            const html = await (await fetch(base + p)).text();
            assert.match(html, /\/chat\/chat-widget\.js\?v=/, p);
            assert.match(html, /window\.AD_CHAT=/, p);
            assert.equal(/XAI|xai-|Bearer/i.test(html.slice(html.indexOf('window.AD_CHAT'), html.indexOf('window.AD_CHAT') + 800)), false);
        }
        assert.equal((await fetch(base + '/chat/chat-widget.js')).status, 200);
    });
});

describe('prijsregel en gesprek zonder API-sleutel (gescript)', () => {
    it('noemt geen prijs voor contact en stelt eerst een vraag', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        const { status, json } = await chat({ session: session(), messages: convo(PRICE_Q) });
        assert.equal(status, 200);
        assert.equal(gate.hasPrice(json.reply), false);
        assert.match(json.reply, /\?/);
        assert.equal(json.contact, false);
    });

    it('vraagt pas om contact na minimaal 2 antwoorden, nog steeds zonder bedrag', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        const s = session();
        const one = await chat({ session: s, messages: convo(PRICE_Q, 'Vraag?', 'Poortwachter, week 40') });
        assert.equal(flow.asksContact(one.json.reply), false);
        const two = await chat({ session: s, messages: convo(PRICE_Q, 'Vraag?', 'Poortwachter, week 40', 'Hoeveel medewerkers?', '60 medewerkers') });
        assert.equal(gate.hasPrice(two.json.reply), false);
        assert.equal(flow.asksContact(two.json.reply), true);
    });

    it('geeft de tarieven na een e-mailadres en stuurt een lead via de bestaande mailflow', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        const before = captured.length;
        const { json } = await chat({ session: session(), messages: convo(PRICE_Q, 'a', 'Poortwachter, week 40', 'b', '60 medewerkers', 'Wil je je e-mailadres of telefoonnummer delen?', 'piet@voorbeeldbedrijf.nl') });
        assert.equal(json.contact, true);
        assert.equal(json.lead, true);
        assert.equal(gate.hasPrice(json.reply), true);
        assert.match(json.reply, /1\.125/);
        const mails = captured.slice(before).filter((l) => l.includes('[Resend niet geconfigureerd]'));
        assert.equal(mails.length, 1);
        assert.match(mails[0], /chatlead/i);
    });

    it('telt het eigen telefoonnummer of eigen domein niet als contact', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        const { json } = await chat({ session: session(), messages: convo(PRICE_Q, 'a', 'bel 085 087 0307 of info@arbeidsdeskundig.com') });
        assert.equal(json.contact, false);
        assert.equal(gate.hasPrice(json.reply), false);
    });
});

describe('xAI-proxy (gemockt)', () => {
    it('stuurt de sleutel alleen server-side en vervangt een modelantwoord met bedrag voor contact', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        process.env.XAI_API_KEY = 'test-key-not-real';
        process.env.XAI_API_BASE = mockBase;
        mockCalls = [];
        mockReply = { content: 'Een onderzoek kost vanaf €1.095 excl. btw.' };
        const { json } = await chat({ session: session(), messages: convo(PRICE_Q) });
        assert.equal(mockCalls.length, 1);
        assert.equal(mockCalls[0].headers.authorization, 'Bearer test-key-not-real');
        const sys = mockCalls[0].body.messages[0].content;
        assert.match(sys, /CONTACT_GEGEVEN: nee/);
        assert.match(sys, /KENNISBANK \(bron: arbeidsdeskundig\.com\)/);
        assert.match(sys, /\/kennisbank\//);
        assert.equal(json.gated, true);
        assert.equal(gate.hasPrice(json.reply), false);
        assert.equal(JSON.stringify(json).includes('test-key-not-real'), false);
    });

    it('laat een gewoon antwoord door en haalt gedachtestreepjes weg', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        process.env.XAI_API_KEY = 'test-key-not-real';
        process.env.XAI_API_BASE = mockBase;
        mockReply = { content: 'Een onderzoek duurt kort \u2014 meestal binnen enkele weken.' };
        const { json } = await chat({ session: session(), messages: convo('Hoe lang duurt het?') });
        assert.equal(json.gated, false);
        assert.equal(/[\u2014\u2013]/.test(json.reply), false);
    });

    it('opent het formulier niet vanzelf bij een prijsvraag', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        process.env.XAI_API_KEY = 'test-key-not-real';
        process.env.XAI_API_BASE = mockBase;
        mockReply = { content: '', tool_calls: [{ function: { name: 'open_lead_form', arguments: '{"reply":"Vul hieronder je gegevens in."}' } }] };
        const { json } = await chat({ session: session(), messages: convo(PRICE_Q) });
        assert.equal(json.action, '');
    });
});

describe('preview noindex', () => {
    it('zet alleen X-Robots-Tag noindex als NOINDEX=true', async () => {
        assert.equal((await fetch(base + '/')).headers.get('x-robots-tag'), null);
        process.env.NOINDEX = 'true';
        const h = (await fetch(base + '/')).headers.get('x-robots-tag');
        delete process.env.NOINDEX;
        assert.match(h, /noindex/);
    });
});

describe('beveiliging en limieten', () => {
    it('weigert een andere origin', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        const { status } = await chat({ session: session(), messages: convo('hoi') }, { Origin: 'https://evil.example' });
        assert.equal(status, 403);
    });

    it('weigert een ongeldige sessie', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        const { status } = await chat({ session: 'kort', messages: convo('hoi') });
        assert.equal(status, 400);
    });

    it('begrenst het aantal berichten per sessie', async () => {
        process.env.CHAT_WIDGET_ENABLED = 'true';
        process.env.CHAT_RATE_SESSION = '2';
        const s = session();
        await chat({ session: s, messages: convo('hoi') });
        await chat({ session: s, messages: convo('hoi') });
        const { status, json } = await chat({ session: s, messages: convo('hoi') });
        delete process.env.CHAT_RATE_SESSION;
        assert.equal(status, 429);
        assert.equal(json.action, 'lead_offer');
    });
});

describe('gate en flow (unit)', () => {
    it('herkent prijzen en geen prijzen', () => {
        assert.equal(gate.hasPrice('Het kost 1.125 excl. btw'), true);
        assert.equal(gate.hasPrice('Vanaf €1.095,-'), true);
        assert.equal(gate.hasPrice('rond de twaalfhonderd'), true);
        assert.equal(gate.hasPrice('We deden al 1.500+ onderzoeken.'), false);
        assert.equal(gate.hasPrice('Rond week 42 en week 104 is dat belangrijk.'), false);
    });

    it('vindt e-mail en Nederlandse telefoonnummers', () => {
        assert.deepEqual(gate.findContact('mail me op a.b@firma.nl'), { email: 'a.b@firma.nl', telefoon: '' });
        assert.equal(gate.findContact('bel 06-12345678').telefoon, '0612345678');
        assert.equal(gate.findContact('+31 6 1234 5678').telefoon, '0612345678');
        assert.equal(gate.findContact('085 087 0307').telefoon, '');
    });
});

describe('widget-bestanden', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat', 'chat-widget.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'chat', 'chat-widget.css'), 'utf8');

    it('bevat geen gedachtestreepjes in de UI-teksten', () => {
        assert.equal(/[\u2014\u2013]/.test(js), false);
        for (const f of ['flow.js', 'prompt.js', 'index.js']) {
            const src = fs.readFileSync(path.join(__dirname, '..', 'chat', f), 'utf8');
            assert.equal(/[\u2014\u2013]/.test(src), false, f);
        }
    });

    it('zet de chatknop 12 px boven de contactknop en verbergt ze wederzijds', () => {
        assert.match(js, /OFFSET = typeof C\.offset === 'number' \? C\.offset : 12/);
        assert.match(css, /html\.adc-chat-open \.adc-fab\{visibility:hidden/);
        assert.match(css, /\.adc-chat\.is-fab-open\{visibility:hidden/);
        assert.match(css, /html\.adc-on \.fab-whatsapp\{display:none/);
    });

    it('stuurt GA4-events alleen via gtag als die geladen is', () => {
        assert.match(js, /typeof window\.gtag === 'function'/);
        for (const ev of ['chat_open', 'chat_message', 'contact_click', 'generate_lead', 'chat_lead_submit', 'chat_price_gate']) {
            assert.match(js, new RegExp("'" + ev + "'"), ev);
        }
        assert.equal(/dataLayer\.push/.test(js), false);
    });

    it('bevat geen API-sleutel of xAI-endpoint in de browsercode', () => {
        assert.equal(/api\.x\.ai|XAI_API_KEY|Bearer/.test(js), false);
    });
});
