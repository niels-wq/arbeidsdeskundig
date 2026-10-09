'use strict';

// Chatbot + contactknop voor arbeidsdeskundig.com (PREVIEW, achter een vlag).
//
// Aan/uit: CHAT_WIDGET_ENABLED=true. Standaard UIT. Staat de vlag uit, dan
//   - injecteert renderPage() niets in de HTML (de site blijft byte-voor-byte gelijk),
//   - geven /api/chat/* en /chat/* een 404.
// Sleutel: XAI_API_KEY (Railway variable). Nooit in de code of de repo, nooit gelogd,
//   nooit naar de browser. Zonder sleutel draait de chat op het gescripte prijsgesprek
//   (flow.js), zodat er nooit een bedrag vóór contact verschijnt.
// Leads: een e-mailadres of telefoonnummer in de chat gaat via deliverSalesLead()
//   (dezelfde Resend-mailflow als /api/offerte) naar info@. Het formulier in de chat
//   post naar het bestaande /api/offerte met bron "chat".
// Limieten (env, optioneel): CHAT_RATE_SESSION (20), CHAT_RATE_IP_HOUR (60), CHAT_RATE_DAY (1500).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const gate = require('./gate');
const flow = require('./flow');
const prompt = require('./prompt');

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'chat');
const SALT = crypto.randomBytes(16).toString('hex');
const DAY_MS = 24 * 60 * 60 * 1000;
const ASSET_VERSION = '1';

function enabled() {
    return String(process.env.CHAT_WIDGET_ENABLED || '').toLowerCase() === 'true';
}

function num(name, def) {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) && n > 0 ? n : def;
}

function hash(s) {
    return crypto.createHash('sha256').update(SALT + String(s)).digest('hex').slice(0, 32);
}

function clip(text, len) {
    return String(text == null ? '' : text).replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, len);
}

function tidy(text) {
    let t = String(text || '').replace(/<[^>]*>/g, '');
    t = t.replace(/\s+[\u2014\u2013]\s+/g, ', ').replace(/[\u2014\u2013]/g, '-');
    return t.replace(/\n{3,}/g, '\n\n').trim().slice(0, 1500);
}

function cleanHistory(raw) {
    const out = [];
    for (const m of Array.isArray(raw) ? raw : []) {
        if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
        const c = clip(m.content, m.role === 'assistant' ? 1500 : 500);
        if (c) out.push({ role: m.role, content: c });
    }
    const last = out.slice(-10);
    while (last.length && last[0].role !== 'user') last.shift();
    return last;
}

function fallbackText() {
    return 'Sorry, ik kan je vraag nu even niet beantwoorden. Bel ons op ' + flow.PHONE + ' of mail naar ' + flow.EMAIL + '. Of laat je gegevens achter via de knop hieronder, dan nemen we binnen 24 uur contact met je op.';
}

const TOOLS = [{
    type: 'function',
    function: {
        name: 'open_lead_form',
        description: 'Toon het korte contactformulier in de chat (naam, organisatie, e-mail, telefoon). Alleen als de bezoeker zelf uitdrukkelijk een offerte, terugbelverzoek of kennismaking wil, of wil starten. Nooit bij een prijsvraag: voer dan het PRIJSGESPREK in de chat.',
        parameters: {
            type: 'object',
            properties: {
                reason: { type: 'string' },
                reply: { type: 'string', description: 'Kort bericht boven het formulier (max 40 woorden).' },
            },
            required: [],
        },
    },
}];

function createChat({ getKnowledge, deliverLead, escapeHtml, fieldsToHtml, fetchImpl } = {}) {
    const sessions = new Map(); // hash(session) -> { email, telefoon, lead, count, t }
    const ipHits = new Map(); // hash(ip) -> { n, t }
    let day = { key: '', n: 0 };
    let knowledgeCache = null;
    const doFetch = (...a) => (fetchImpl || globalThis.fetch)(...a);

    function knowledge() {
        if (knowledgeCache === null) {
            try { knowledgeCache = getKnowledge ? prompt.buildKnowledge(getKnowledge()) : ''; } catch (e) { knowledgeCache = ''; }
        }
        return knowledgeCache;
    }

    function sweep() {
        const now = Date.now();
        for (const [k, v] of sessions) if (now - v.t > DAY_MS) sessions.delete(k);
        for (const [k, v] of ipHits) if (now - v.t > 60 * 60 * 1000) ipHits.delete(k);
    }

    function rateCheck(sKey, ipKey) {
        sweep();
        const s = sessions.get(sKey) || { email: '', telefoon: '', lead: false, count: 0, t: Date.now() };
        const ip = ipHits.get(ipKey) || { n: 0, t: Date.now() };
        const today = new Date().toISOString().slice(0, 10);
        if (day.key !== today) day = { key: today, n: 0 };
        if (s.count >= num('CHAT_RATE_SESSION', 20)) return 'session';
        if (ip.n >= num('CHAT_RATE_IP_HOUR', 60)) return 'ip';
        if (day.n >= num('CHAT_RATE_DAY', 1500)) return 'day';
        s.count++; s.t = Date.now(); sessions.set(sKey, s);
        ip.n++; ipHits.set(ipKey, ip);
        day.n++;
        return '';
    }

    function sameOrigin(req) {
        const origin = req.get('origin');
        if (!origin) return true;
        try {
            const o = new URL(origin).host.replace(/^www\./, '').toLowerCase();
            const h = String(req.get('host') || '').replace(/^www\./, '').toLowerCase();
            return o === h;
        } catch (e) { return false; }
    }

    async function sendChatLead(state, history, pagePath) {
        if (!deliverLead) return { ok: false };
        const a = flow.analyse(history);
        const k = a.known;
        const fields = {
            Aanvraag: 'Chatbot (arbeidsdeskundig.com)',
            'E-mail': state.email,
            Telefoon: state.telefoon,
            'Soort vraag': k.soort ? flow.LABELS[k.soort] : '',
            Verzuimweek: k.weken ? String(k.weken) : (k.spoed ? 'spoed' : ''),
            Medewerkers: k.mw ? String(k.mw) : '',
            Pagina: pagePath || '',
            'Berichten bezoeker': history.filter((m) => m.role === 'user').map((m) => m.content).join(' | ').slice(0, 1500),
        };
        const contactLabel = state.email || state.telefoon;
        try {
            return await deliverLead({
                kind: 'chat',
                lead: { naam: 'Chatbezoeker', email: state.email, telefoon: state.telefoon, dienst: 'Arbeidsdeskundig onderzoek (chat)' },
                rawFields: {},
                notifySubject: 'Nieuwe chatlead arbeidsdeskundig.com: ' + contactLabel,
                notifyHtml: '<h2>Nieuwe chatlead via arbeidsdeskundig.com</h2><table>' + fieldsToHtml(fields) + '</table>',
                replyTo: state.email || undefined,
            });
        } catch (e) {
            console.error('[chat] lead doorsturen mislukt');
            return { ok: false };
        }
    }

    async function complete(history, sessionKey, page, contact, justNow) {
        const key = process.env.XAI_API_KEY || '';
        if (!key) return fallback(history, contact, justNow, 'nokey');
        const body = {
            model: process.env.XAI_MODEL || 'grok-4.20-0309-non-reasoning',
            messages: [{ role: 'system', content: prompt.systemMessage({ knowledge: knowledge(), pageTitle: page.title, pagePath: page.path, contact, justNow, history }) }, ...history],
            max_tokens: 350,
            temperature: 0.3,
            tools: TOOLS,
            tool_choice: 'auto',
            stream: false,
        };
        let json;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), num('CHAT_TIMEOUT_MS', 20000));
        try {
            const r = await doFetch((process.env.XAI_API_BASE || 'https://api.x.ai/v1') + '/chat/completions', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'x-grok-conv-id': sessionKey },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
            if (!r.ok) {
                console.error('[chat] xAI HTTP', r.status);
                return fallback(history, contact, justNow, 'api_' + r.status);
            }
            json = await r.json();
        } catch (e) {
            console.error('[chat] xAI-verzoek mislukt');
            return fallback(history, contact, justNow, 'http');
        } finally {
            clearTimeout(timer);
        }
        const msg = json && json.choices && json.choices[0] && json.choices[0].message;
        if (!msg) return fallback(history, contact, justNow, 'empty');
        let reply = typeof msg.content === 'string' ? msg.content : '';
        let action = '';
        for (const tc of Array.isArray(msg.tool_calls) ? msg.tool_calls : []) {
            if (tc && tc.function && tc.function.name === 'open_lead_form') {
                action = 'lead_form';
                try {
                    const args = JSON.parse(tc.function.arguments || '{}');
                    if (!reply.trim() && args.reply) reply = String(args.reply);
                } catch (e) { /* negeren */ }
            }
        }
        reply = tidy(reply);
        if (!reply) reply = action ? 'Leuk! Laat hieronder je gegevens achter, dan nemen we binnen 24 uur contact met je op.' : fallbackText();
        let gated = false;
        let steered = false;
        const a = flow.analyse(history);
        const last = history[history.length - 1];
        const asked = last ? flow.wantsContact(last.content) : false;
        if (action === 'lead_form' && a.price && !asked) {
            // Een prijsvraag opent nooit vanzelf het formulier.
            action = '';
            if (!contact || /formulier|hieronder|gegevens achter/i.test(reply)) {
                reply = contact ? flow.priceReply(history, false) : flow.reply(history);
                steered = true;
            }
        }
        if (!contact && gate.hasPrice(reply)) {
            // Harde poort: bedrag zonder contact -> hele antwoord vervangen door de volgende gespreksstap.
            reply = flow.reply(history);
            action = '';
            gated = true;
        } else if (!contact && a.price && a.next !== 'contact' && !asked && flow.asksContact(reply)) {
            reply = flow.reply(history);
            action = '';
            steered = true;
        }
        return { ok: true, reply, action, gated, steered, code: 'ok' };
    }

    function fallback(history, contact, justNow, code) {
        const a = flow.analyse(history);
        const last = history[history.length - 1];
        if (a.price) {
            let reply = '';
            if (!contact) reply = flow.reply(history);
            else if (justNow || (last && flow.isPriceQuestion(last.content))) reply = flow.priceReply(history, justNow);
            if (reply) return { ok: true, reply, action: '', gated: false, steered: false, scripted: true, code: code + '_flow' };
        }
        if (contact && justNow) {
            return { ok: true, reply: 'Dank je! Een arbeidsdeskundige neemt binnen 24 uur contact met je op. Heb je intussen nog een vraag? Stel hem gerust.', action: '', scripted: true, code: code + '_flow' };
        }
        if (last && flow.wantsContact(last.content)) {
            return { ok: true, reply: 'Leuk! Laat hieronder je gegevens achter, dan nemen we binnen 24 uur contact met je op.', action: 'lead_form', scripted: true, code: code + '_flow' };
        }
        return { ok: false, reply: fallbackText(), action: 'lead_offer', fallback: true, code };
    }

    function register(app, express) {
        const guard = (req, res, next) => (enabled() ? next() : res.status(404).type('txt').send('Not found'));
        const noStore = (res) => res.set({ 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex' });

        app.get('/chat/:file(chat-widget\\.js|chat-widget\\.css)', guard, (req, res) => {
            res.set('Cache-Control', 'public, max-age=300');
            res.sendFile(path.join(PUBLIC_DIR, req.params.file));
        });

        app.post('/api/chat/message', guard, async (req, res) => {
            noStore(res);
            if (!sameOrigin(req)) return res.status(403).json({ ok: false, code: 'origin' });
            const p = req.body || {};
            const session = String(p.session || '').replace(/[^A-Za-z0-9_-]/g, '');
            if (session.length < 12 || session.length > 64) return res.status(400).json({ ok: false, code: 'session' });
            const history = cleanHistory(p.messages);
            if (!history.length || history[history.length - 1].role !== 'user') return res.status(400).json({ ok: false, code: 'history' });
            const sKey = hash(session);
            const limited = rateCheck(sKey, hash(req.ip || ''));
            if (limited) {
                return res.status(429).json({ ok: false, code: 'rate_' + limited, action: 'lead_offer', reply: 'Je hebt het maximale aantal berichten bereikt. Bel ons op ' + flow.PHONE + ' of laat je gegevens achter via de knop hieronder.' });
            }
            const state = sessions.get(sKey);
            const hadContact = gate.hasContact(state);
            const found = gate.scanHistory(history);
            if (found.email) state.email = found.email;
            if (found.telefoon) state.telefoon = found.telefoon;
            const contact = gate.hasContact(state);
            const justNow = contact && !hadContact;
            const page = { title: clip(p.page && p.page.title, 120), path: clip(p.page && p.page.path, 200) };
            let lead = false;
            if (justNow && !state.lead) {
                state.lead = true;
                const d = await sendChatLead(state, history, page.path);
                lead = !!(d && d.ok);
            }
            const out = await complete(history, sKey, page, contact, justNow);
            res.status(200).json({
                ok: out.ok !== false,
                reply: out.reply,
                action: out.action || '',
                gated: !!out.gated,
                steered: !!out.steered,
                fallback: !!out.fallback,
                code: out.code,
                contact,
                lead,
                remaining: Math.max(0, num('CHAT_RATE_SESSION', 20) - state.count),
            });
        });
    }

    function snippet() {
        if (!enabled()) return '';
        const cfg = {
            api: '/api/chat/message',
            lead: '/api/offerte',
            avatar: '/assets/niels-chat-avatar.webp?v=' + ASSET_VERSION,
            phone: flow.PHONE,
            phoneHref: 'tel:0850870307',
            email: flow.EMAIL,
            whatsapp: 'https://wa.me/31650213593?text=' + encodeURIComponent('Hallo, ik heb een vraag over een arbeidsdeskundig onderzoek'),
            privacy: flow.PRIVACY_URL,
            calendly: flow.CALENDLY,
            leadValue: 250,
            offset: 12,
        };
        return '<link rel="stylesheet" href="/chat/chat-widget.css?v=' + ASSET_VERSION + '">\n'
            + '<script>window.AD_CHAT=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script>\n'
            + '<script src="/chat/chat-widget.js?v=' + ASSET_VERSION + '" defer></script>\n';
    }

    return { register, snippet, enabled, _sessions: sessions, _cleanHistory: cleanHistory, _tidy: tidy };
}

module.exports = { createChat, enabled, ASSET_VERSION };
