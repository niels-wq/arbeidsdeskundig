'use strict';

// Prijsregel voor de chat (naar voorbeeld van de matchvermogen.nl-chatplugin 0.1.2).
// - Geen enkel bedrag voordat de bezoeker een e-mailadres of telefoonnummer heeft gegeven.
// - De server bepaalt dat, nooit de browser: elke beurt scannen we alle bezoekersberichten.
// - Eigen nummers en eigen domeinen tellen niet als contact.
// - Een modelantwoord met een bedrag zonder contact wordt in zijn geheel vervangen
//   (geen gedeeltelijke redactie) door de volgende stap van het gesprek (zie flow.js).

const OWN_PHONES = new Set(['0850870307', '0650213593']);
const OWN_EMAIL_RE = /@(arbeidsdeskundig\.com|matchvermogen\.nl|bestmatchbv\.nl)$/i;

// Tarieven van de site (2026, excl. btw), zie /llms.txt en de offerte-PDF in server.js.
const TARIFFS = { klein: 1095, midden: 1125, groot: 1395, fysiek: 295, spoed: 300 };

function normalizePhone(raw) {
    const s = String(raw || '').trim();
    let d = s.replace(/\D/g, '');
    if (/^(?:\+|00)\s*31/.test(s)) {
        d = '0' + d.replace(/^(?:00)?31/, '').replace(/^0+/, '');
    }
    if (d.startsWith('00') || !/^0[1-9]\d{8}$/.test(d)) return '';
    if (OWN_PHONES.has(d)) return '';
    return d;
}

function findContact(text) {
    const t = String(text || '');
    const out = { email: '', telefoon: '' };
    const emails = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/g) || [];
    for (const e of emails) {
        const low = e.toLowerCase();
        if (!OWN_EMAIL_RE.test(low)) { out.email = low; break; }
    }
    const phones = t.match(/(?<![\d.,])(?:(?:\+|00)31[\s.-]?(?:\(0\)[\s.-]?)?|\(?0)(?:[\s.()-]*\d){9}(?![\d,])/g) || [];
    for (const p of phones) {
        const n = normalizePhone(p);
        if (n) { out.telefoon = n; break; }
    }
    return out;
}

function scanHistory(history) {
    const out = { email: '', telefoon: '' };
    for (const m of history || []) {
        if (!m || m.role !== 'user') continue;
        const f = findContact(m.content);
        if (f.email) out.email = f.email;
        if (f.telefoon) out.telefoon = f.telefoon;
    }
    return out;
}

function hasContact(state) {
    return !!(state && (state.email || state.telefoon));
}

let knownCache = null;
function knownAmounts() {
    if (knownCache) return knownCache;
    const base = [TARIFFS.klein, TARIFFS.midden, TARIFFS.groot];
    const set = new Set([...base, TARIFFS.fysiek, TARIFFS.spoed]);
    for (const b of base) {
        set.add(b + TARIFFS.fysiek);
        set.add(b + TARIFFS.spoed);
        set.add(b + TARIFFS.fysiek + TARIFFS.spoed);
        set.add(Math.round(b * 1.21)); // incl. btw
    }
    knownCache = set;
    return set;
}

const PRICE_WORDS = /kost|prijs|tarief|vanaf|bedraagt|bedrag|investering|excl|incl|btw|per onderzoek|per rapport|ongeveer|rond de|circa|tussen|tot maximaal|korting|toeslag/;

function hasPrice(text) {
    const t = ' ' + String(text || '').replace(/<[^>]*>/g, ' ') + ' ';
    if (/€|&euro;|\beuro(?:'s)?\b|\beur\b|\d\s?,-/i.test(t)) return true;
    const known = knownAmounts();
    const re = /(?<![\d.,])(\d{1,3}(?:[.\s]\d{3})+|\d{3,6})(?:,\d{1,2})?(?!\d|\.\d)/g;
    let m;
    while ((m = re.exec(t))) {
        const n = parseInt(m[1].replace(/\D/g, ''), 10);
        const after = t.slice(m.index + m[0].length, m.index + m[0].length + 2).trim();
        if (known.has(n) && !after.startsWith('+')) return true;
        if (n >= 250 && n <= 50000 && (n < 2015 || n > 2035) && !after.startsWith('+')) {
            const win = t.slice(Math.max(0, m.index - 45), m.index + m[0].length + 35).toLowerCase();
            if (PRICE_WORDS.test(win)) return true;
        }
    }
    if (/(kost|prijs|tarief|vanaf|ongeveer|circa|rond de)[^.?!]{0,30}\b\w*(honderd|duizend)\b/i.test(t)) return true;
    return false;
}

module.exports = { TARIFFS, OWN_PHONES, normalizePhone, findContact, scanHistory, hasContact, hasPrice, knownAmounts };
