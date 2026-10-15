'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const flow = require('../chat/flow');

const ROOT = path.join(__dirname, '..');
const SOURCES = [
    'public/index.html',
    'server.js',
    'chat/index.js',
    'chat/flow.js',
    'chat/prompt.js',
    'chat/gate.js',
    'public/chat/chat-widget.js',
];

const MOBILE_DIGIT = '50213593';

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function mobileHits(text) {
    const hits = [];
    let idx = 0;
    while ((idx = text.indexOf(MOBILE_DIGIT, idx)) !== -1) {
        hits.push(text.slice(Math.max(0, idx - 48), idx + MOBILE_DIGIT.length + 8));
        idx += MOBILE_DIGIT.length;
    }
    return hits;
}

function allowedMobileContext(snippet) {
    return snippet.includes('wa.me/31650213593') || snippet.includes("'0650213593'") || snippet.includes('"0650213593"');
}

describe('contactkanalen: 06 alleen WhatsApp, bellen via 085', () => {
    it('het 06-nummer staat alleen in wa.me of in de chat-uitsluitlijst', () => {
        let seen = 0;
        for (const rel of SOURCES) {
            for (const hit of mobileHits(read(rel))) {
                seen += 1;
                assert.equal(allowedMobileContext(hit), true, `${rel}: ${hit}`);
            }
        }
        assert.ok(seen >= 3, `verwacht WhatsApp-link en uitsluitlijst, vond ${seen}`);
    });

    it('elke tel:-link is het vaste nummer 085 087 0307', () => {
        const telRe = /tel:[^"'\\\s<>)]+/gi;
        for (const rel of SOURCES) {
            const text = read(rel);
            const links = text.match(telRe) || [];
            assert.ok(links.length > 0 || rel !== 'public/index.html');
            for (const link of links) {
                assert.equal(link.toLowerCase(), 'tel:0850870307', `${rel} heeft ${link}`);
            }
            assert.doesNotMatch(text, /tel:\s*\+?316/i, rel);
            assert.doesNotMatch(text, /tel:\s*06/i, rel);
        }
    });

    it('zichtbare beltekst, chatbot, PDF en bevestigingsmail gebruiken het vaste nummer', () => {
        const html = read('public/index.html');
        assert.match(html, /href="tel:0850870307">085 087 0307</);
        assert.match(html, /href="tel:0850870307">📞 Bel 085 087 0307</);
        assert.match(html, /href="https:\/\/wa\.me\/31650213593\?text=/);
        assert.doesNotMatch(html, /06[\s-]*5021[\s-]*3593/);

        assert.equal(flow.PHONE, '085 087 0307');
        const chat = read('chat/index.js');
        assert.match(chat, /phoneHref: 'tel:0850870307'/);
        assert.match(chat, /wa\.me\/31650213593/);

        const server = read('server.js');
        assert.match(server, /085 087 0307/);
        assert.doesNotMatch(server, /50213593/);
        assert.match(server, /Bedankt, \$\{escapeHtml\(voornaam\)\} \u2014 we hebben je offerteaanvraag ontvangen/);
        assert.match(server, /Bedankt, \$\{escapeHtml\(voornaam\)\} \u2014 we hebben je aanmelding ontvangen/);
        assert.doesNotMatch(server, /tel:/);
    });
});
