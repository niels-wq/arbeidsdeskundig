'use strict';

// Stille spamfilter voor elk leadformulier. Geen externe dienst.
//
// FORM_SPAM_SECRET (optioneel) ondertekent het tijdstempel. Zonder die variabele
// kiest het proces bij het opstarten een willekeurige sleutel. Die sleutel
// verandert bij een herstart, dus een nog open tabblad wordt dan als spam
// gezien en stilzwijgend genegeerd.

const crypto = require('crypto');
const { isHoneypotTriggered } = require('./lead-validation');

const SECRET = process.env.FORM_SPAM_SECRET || crypto.randomBytes(32).toString('hex');

const TOKEN_FIELD = 'form_ts';
const MIN_AGE_MS = 3000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const hits = new Map();

function sign(ts) {
    return crypto.createHmac('sha256', SECRET).update(String(ts)).digest('hex');
}

function issueFormToken(issuedAt = Date.now()) {
    const ts = String(issuedAt);
    return ts + '.' + sign(ts);
}

function timingReason(token, now = Date.now()) {
    if (token == null) return 'missing';
    const raw = String(token).trim();
    if (!raw) return 'missing';
    if (raw.length > 100) return 'invalid';
    const dot = raw.indexOf('.');
    if (dot <= 0) return 'invalid';
    const ts = raw.slice(0, dot);
    const sig = raw.slice(dot + 1).toLowerCase();
    if (!/^\d{10,16}$/.test(ts) || !/^[a-f0-9]{64}$/.test(sig)) return 'invalid';
    const expected = sign(ts);
    const got = Buffer.from(sig, 'hex');
    const want = Buffer.from(expected, 'hex');
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return 'invalid';
    const age = now - Number(ts);
    if (age < MIN_AGE_MS) return 'too_fast';
    if (age > MAX_AGE_MS) return 'too_old';
    return null;
}

function normalizeIp(value) {
    return String(value || '').trim().replace(/^::ffff:/i, '');
}

// Railway hangt als proxy het adres van de verbinding achteraan X-Forwarded-For.
// Het rechter adres is de client die de proxy zag; een zelf meegestuurd
// voorvoegsel telt niet mee. Zonder header valt dit terug op het socket-adres.
function clientIp(req) {
    const header = req && req.headers && req.headers['x-forwarded-for'];
    if (header) {
        const parts = String(header).split(',').map((part) => normalizeIp(part)).filter(Boolean);
        if (parts.length) return parts[parts.length - 1];
    }
    const fallback = req && (req.ip || (req.socket && req.socket.remoteAddress));
    return normalizeIp(fallback) || 'unknown';
}

function prune(now) {
    if (hits.size < 1000) return;
    for (const [key, stamps] of hits) {
        const fresh = stamps.filter((t) => now - t < RATE_WINDOW_MS);
        if (fresh.length) hits.set(key, fresh);
        else hits.delete(key);
    }
}

function rateLimit(ip, now = Date.now()) {
    prune(now);
    const key = ip || 'unknown';
    const list = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (list.length >= RATE_MAX) {
        hits.set(key, list);
        return 'rate_limit';
    }
    list.push(now);
    hits.set(key, list);
    return null;
}

function tokenFromFields(fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return '';
    const val = fields[TOKEN_FIELD];
    if (typeof val === 'string') return val;
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    return '';
}

// Reden-string als het verzoek spam is, anders null.
// Volgorde: honeypot, tijdstempel, daarna de teller. Een ongeldig tijdstempel
// telt niet mee voor de limiet, zodat een leeg verzoek een echt formulier
// op hetzelfde IP niet buitensluit.
function assess({ fields, ip, now } = {}) {
    const safeFields = (fields && typeof fields === 'object' && !Array.isArray(fields)) ? fields : {};
    if (isHoneypotTriggered(safeFields)) return 'honeypot';
    const timing = timingReason(tokenFromFields(safeFields), now);
    if (timing) return timing;
    return rateLimit(ip || 'unknown', now);
}

function resetForTests() {
    hits.clear();
}

module.exports = {
    TOKEN_FIELD,
    MIN_AGE_MS,
    MAX_AGE_MS,
    RATE_MAX,
    RATE_WINDOW_MS,
    issueFormToken,
    timingReason,
    clientIp,
    rateLimit,
    assess,
    resetForTests,
};
