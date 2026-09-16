'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isHoneypotTriggered,
    isPlaceholderName,
    validateOfferteLead,
    validateAanmeldLead,
    validateChecklistLead,
    validateBelMeTerugLead,
} = require('../lead-validation');

describe('placeholder names', () => {
    it('rejects empty, onbekend and other stand-ins', () => {
        assert.equal(isPlaceholderName(''), true);
        assert.equal(isPlaceholderName('onbekend'), true);
        assert.equal(isPlaceholderName('Onbekend'), true);
        assert.equal(isPlaceholderName('  ONBEKEND  '), true);
        assert.equal(isPlaceholderName('n/a'), true);
        assert.equal(isPlaceholderName('a'), true);
    });

    it('accepts a real name', () => {
        assert.equal(isPlaceholderName('Jan Jansen'), false);
        assert.equal(isPlaceholderName('José'), false);
    });
});

describe('honeypot', () => {
    it('triggers on filled website/url fields', () => {
        assert.equal(isHoneypotTriggered({ naam: 'Jan', website: 'http://spam.test' }), true);
        assert.equal(isHoneypotTriggered({ 'of-website': 'bot' }), true);
        assert.equal(isHoneypotTriggered({ naam: 'Jan', website: '' }), false);
        assert.equal(isHoneypotTriggered({ 'of-naam': 'Jan' }), false);
    });
});

describe('offerte lead', () => {
    it('rejects a completely empty body', () => {
        const result = validateOfferteLead({});
        assert.equal(result.ok, false);
        assert.ok(result.errors.includes('Vul je naam in.'));
        assert.ok(result.errors.includes('Vul een geldig e-mailadres in.'));
        assert.ok(result.errors.includes('Vul een geldig telefoonnummer in.'));
    });

    it('rejects name onbekend even with contact details', () => {
        const result = validateOfferteLead({
            naam: 'onbekend',
            email: 'jan@bedrijf.nl',
            telefoon: '0612345678',
        });
        assert.equal(result.ok, false);
        assert.ok(result.errors.includes('Vul je naam in.'));
    });

    it('requires both email and phone when the form has both', () => {
        const noPhone = validateOfferteLead({
            naam: 'Jan Jansen',
            email: 'jan@bedrijf.nl',
        });
        assert.equal(noPhone.ok, false);
        assert.ok(noPhone.errors.includes('Vul een geldig telefoonnummer in.'));

        const noEmail = validateOfferteLead({
            naam: 'Jan Jansen',
            telefoon: '0612345678',
        });
        assert.equal(noEmail.ok, false);
        assert.ok(noEmail.errors.includes('Vul een geldig e-mailadres in.'));
    });

    it('accepts of- prefixed fields from the live form', () => {
        const result = validateOfferteLead({
            'of-naam': 'Piet Pietersen',
            'of-email': 'piet@bedrijf.nl',
            'of-telefoon': '06 12 34 56 78',
            'of-bedrijf': 'Voorbeeld BV',
            grootte: 'midden',
            vorm: 'Online',
        });
        assert.equal(result.ok, true);
        assert.equal(result.lead.naam, 'Piet Pietersen');
        assert.equal(result.lead.email, 'piet@bedrijf.nl');
        assert.equal(result.lead.telefoon, '06 12 34 56 78');
        assert.equal(result.lead.grootte, 'midden');
        assert.equal(result.lead.vorm, 'Online');
    });
});

describe('aanmelding lead', () => {
    const valid = {
        'inp-aanvrager-naam': 'Sara de Vries',
        'inp-aanvrager-email': 'sara@bedrijf.nl',
        'inp-aanvrager-tel': '0850870307',
        dienst: 'Regulier onderzoek',
        wet: 'WGA',
        vorm: 'Fysiek',
        grootte: 'klein',
    };

    it('rejects missing service type even with contact data', () => {
        const { dienst, ...rest } = valid;
        const result = validateAanmeldLead(rest);
        assert.equal(result.ok, false);
        assert.ok(result.errors.includes('Kies het type dienstverlening.'));
    });

    it('accepts a complete wizard payload', () => {
        const result = validateAanmeldLead({ ...valid, 'chk-spoor2': true });
        assert.equal(result.ok, true);
        assert.equal(result.lead.dienst, 'Regulier onderzoek');
        assert.equal(result.lead.spoor2, true);
    });
});

describe('checklist lead', () => {
    it('requires name and email (no phone field on this form)', () => {
        assert.equal(validateChecklistLead({ 'cl-naam': 'Jan' }).ok, false);
        const ok = validateChecklistLead({ 'cl-naam': 'Jan Jansen', 'cl-email': 'jan@bedrijf.nl' });
        assert.equal(ok.ok, true);
    });
});

describe('bel-me-terug lead', () => {
    it('requires name and phone (no email field on this form)', () => {
        assert.equal(validateBelMeTerugLead({ 'bt-naam': 'Jan Jansen' }).ok, false);
        const ok = validateBelMeTerugLead({
            'bt-naam': 'Jan Jansen',
            'bt-telefoon': '0612345678',
            'bt-moment': 'Morgen',
        });
        assert.equal(ok.ok, true);
        assert.equal(ok.lead.moment, 'Morgen');
    });
});
