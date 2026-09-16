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
};
