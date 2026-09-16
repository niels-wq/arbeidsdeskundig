'use strict';

// Gedeelde validatie voor alle lead-formulieren. De server is de bron van
// waarheid: een lege POST mag nooit een e-mail met "onbekend" opleveren.

const PLACEHOLDER_NAMES = new Set([
    'onbekend',
    'unknown',
    'n/a',
    'na',
    'n.v.t.',
    'nvt',
    'geen',
    '-',
    '.',
    'niet bekend',
    'niet bekend / nvt',
]);

const DIENST_VALUES = new Set([
    'Regulier onderzoek',
    'Spoedonderzoek',
    'Bezwaar / herbeoordeling',
]);
const WET_VALUES = new Set([
    'Wet Verbetering Poortwachter',
    'WGA',
    'Ziektewet',
]);
const VORM_VALUES = new Set(['Online', 'Fysiek', 'Weet niet']);
const GROOTTE_VALUES = new Set(['klein', 'midden', 'groot']);

const HONEYPOT_KEY = /(^|-)(website|url|honeypot|_hp)$/i;

function firstString(fields, keys) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return '';
    for (const key of keys) {
        const val = fields[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
        if (typeof val === 'number' && Number.isFinite(val)) return String(val).trim();
    }
    return '';
}

function isHoneypotKey(key) {
    return HONEYPOT_KEY.test(String(key || ''));
}

function isHoneypotTriggered(fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return false;
    return Object.entries(fields).some(([key, val]) => {
        if (!isHoneypotKey(key)) return false;
        return String(val == null ? '' : val).trim() !== '';
    });
}

function isPlaceholderName(naam) {
    const n = String(naam || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!n || n.length < 2) return true;
    return PLACEHOLDER_NAMES.has(n);
}

function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

function isValidPhone(phone) {
    if (!phone) return false;
    const digits = String(phone).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
}

function contactErrors({ naam, email, telefoon, requireEmail, requirePhone }) {
    const errors = [];
    if (isPlaceholderName(naam)) {
        errors.push('Vul je naam in.');
    }
    const hasEmail = isValidEmail(email);
    const hasPhone = isValidPhone(telefoon);
    if (requireEmail && !hasEmail) errors.push('Vul een geldig e-mailadres in.');
    if (requirePhone && !hasPhone) errors.push('Vul een geldig telefoonnummer in.');
    if (!requireEmail && !requirePhone && !hasEmail && !hasPhone) {
        errors.push('Vul een e-mailadres of telefoonnummer in.');
    }
    return errors;
}

function pickOfferteLead(fields) {
    return {
        naam: firstString(fields, ['of-naam', 'naam']),
        bedrijf: firstString(fields, ['of-bedrijf', 'bedrijf']),
        email: firstString(fields, ['of-email', 'email']),
        telefoon: firstString(fields, ['of-telefoon', 'telefoon']),
        grootte: firstString(fields, ['of-grootte', 'grootte']),
        vorm: firstString(fields, ['of-vorm', 'vorm']),
        omschrijving: firstString(fields, ['of-omschrijving', 'omschrijving']),
        bron: firstString(fields, ['bron', 'aanvraagtype']) || 'offerte',
        dienst: 'Arbeidsdeskundig onderzoek',
    };
}

function validateOfferteLead(fields) {
    const lead = pickOfferteLead(fields);
    const errors = contactErrors({
        naam: lead.naam,
        email: lead.email,
        telefoon: lead.telefoon,
        requireEmail: true,
        requirePhone: true,
    });
    if (lead.vorm && !VORM_VALUES.has(lead.vorm)) {
        errors.push('Kies een geldige onderzoeksvorm.');
    }
    if (lead.grootte && !GROOTTE_VALUES.has(lead.grootte)) {
        errors.push('Kies een geldige bedrijfsgrootte.');
    }
    return errors.length ? { ok: false, errors, lead } : { ok: true, lead };
}

function pickAanmeldLead(fields) {
    const spoor2Raw = fields && (fields['chk-spoor2'] ?? fields.spoor2);
    return {
        naam: firstString(fields, ['inp-aanvrager-naam', 'naam']),
        email: firstString(fields, ['inp-aanvrager-email', 'email']),
        telefoon: firstString(fields, ['inp-aanvrager-tel', 'inp-aanvrager-telefoon', 'telefoon']),
        dienst: firstString(fields, ['dienst', 'type', 'inp-dienst']),
        wet: firstString(fields, ['wet', 'inp-wet']),
        vorm: firstString(fields, ['vorm', 'inp-vorm']),
        grootte: firstString(fields, ['grootte', 'inp-grootte']),
        spoor2: spoor2Raw === true || spoor2Raw === 'true' || spoor2Raw === 'on' || spoor2Raw === 1,
    };
}

function validateAanmeldLead(fields) {
    const lead = pickAanmeldLead(fields);
    const errors = contactErrors({
        naam: lead.naam,
        email: lead.email,
        telefoon: lead.telefoon,
        requireEmail: true,
        requirePhone: true,
    });
    if (!lead.dienst || !DIENST_VALUES.has(lead.dienst)) {
        errors.push('Kies het type dienstverlening.');
    }
    if (!lead.wet || !WET_VALUES.has(lead.wet)) {
        errors.push('Kies om welke wet het gaat.');
    }
    if (!lead.vorm || !VORM_VALUES.has(lead.vorm)) {
        errors.push('Kies online of fysiek.');
    }
    if (!lead.grootte || !GROOTTE_VALUES.has(lead.grootte)) {
        errors.push('Kies de bedrijfsgrootte.');
    }
    return errors.length ? { ok: false, errors, lead } : { ok: true, lead };
}

function pickChecklistLead(fields) {
    return {
        naam: firstString(fields, ['cl-naam', 'naam']),
        email: firstString(fields, ['cl-email', 'email']),
        telefoon: firstString(fields, ['cl-telefoon', 'telefoon']),
        dienst: 'Checklist',
    };
}

function validateChecklistLead(fields) {
    const lead = pickChecklistLead(fields);
    const errors = contactErrors({
        naam: lead.naam,
        email: lead.email,
        telefoon: '',
        requireEmail: true,
        requirePhone: false,
    });
    return errors.length ? { ok: false, errors, lead } : { ok: true, lead };
}

function pickBelMeTerugLead(fields) {
    return {
        naam: firstString(fields, ['bt-naam', 'naam']),
        telefoon: firstString(fields, ['bt-telefoon', 'telefoon']),
        email: firstString(fields, ['bt-email', 'email']),
        moment: firstString(fields, ['bt-moment', 'moment']) || 'Niet opgegeven',
        dienst: 'Bel-me-terug',
    };
}

function validateBelMeTerugLead(fields) {
    const lead = pickBelMeTerugLead(fields);
    const errors = contactErrors({
        naam: lead.naam,
        email: lead.email,
        telefoon: lead.telefoon,
        requireEmail: false,
        requirePhone: true,
    });
    return errors.length ? { ok: false, errors, lead } : { ok: true, lead };
}

const TEST_EMAIL_DOMAINS = new Set([
    'example.com', 'example.org', 'example.net',
    'test.com', 'test.nl', 'localhost',
    'mailinator.com', 'guerrillamail.com',
]);
const TEST_NAME_RE = /^(test|tester|test user|testuser|testing)(\s+\d+)?$/i;
const DUMMY_PHONES = new Set([
    '0612345678',
    '31612345678',
    '0123456789',
    '0600000000',
    '0611111111',
]);

function isDummyPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return false;
    if (DUMMY_PHONES.has(digits)) return true;
    if (digits.length >= 8 && /^(\d)\1+$/.test(digits)) return true;
    return false;
}

function isTestLead(lead, rawFields) {
    if (rawFields && (rawFields.test === true || rawFields.lead_test === true || rawFields.test === 'true')) {
        return true;
    }
    if (!lead) return false;
    const email = String(lead.email || '').trim().toLowerCase();
    const domain = email.split('@')[1] || '';
    if (domain && TEST_EMAIL_DOMAINS.has(domain)) return true;
    const naam = String(lead.naam || '').trim();
    if (TEST_NAME_RE.test(naam)) return true;
    if (isDummyPhone(lead.telefoon) && TEST_NAME_RE.test(naam)) return true;
    if (isDummyPhone(lead.telefoon) && (!lead.email || TEST_EMAIL_DOMAINS.has(domain))) return true;
    return false;
}

// Laatste vangnet: de productiemail van 16 sep was subject "... — onbekend"
// met `<table></table>`. Die combinatie mag nooit de deur uit, ook niet als
// een toekomstige mapping-fout lege velden weer wegfiltert.
function notifyIsSafe(subject, html, lead) {
    if (!lead || isPlaceholderName(lead.naam)) return false;
    if (/onbekend/i.test(String(subject || ''))) return false;
    const compact = String(html || '').replace(/\s+/g, '');
    if (!compact || compact.includes('<table></table>')) return false;
    if (!isValidEmail(lead.email) && !isValidPhone(lead.telefoon)) return false;
    if (!String(lead.dienst || '').trim()) return false;
    return true;
}

function leadDedupeKey(kind, lead) {
    const naam = String((lead && lead.naam) || '').trim().toLowerCase();
    const email = String((lead && lead.email) || '').trim().toLowerCase();
    const telefoon = String((lead && lead.telefoon) || '').replace(/\D/g, '');
    return [kind, naam, email, telefoon].join('|');
}

module.exports = {
    PLACEHOLDER_NAMES,
    DIENST_VALUES,
    WET_VALUES,
    VORM_VALUES,
    GROOTTE_VALUES,
    firstString,
    isHoneypotTriggered,
    isPlaceholderName,
    isValidEmail,
    isValidPhone,
    pickOfferteLead,
    validateOfferteLead,
    pickAanmeldLead,
    validateAanmeldLead,
    pickChecklistLead,
    validateChecklistLead,
    pickBelMeTerugLead,
    validateBelMeTerugLead,
    isTestLead,
    leadDedupeKey,
    notifyIsSafe,
    isDummyPhone,
};
