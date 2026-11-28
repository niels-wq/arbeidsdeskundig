'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { issueFormToken, resetForTests: resetSpam } = require('../form-spam');

const SLEUTEL = 'test-key-not-real-ad-advies';
process.env.XAI_API_KEY = SLEUTEL;

const captured = [];
const origLog = console.log;
console.log = (...args) => {
    captured.push(args.map(String).join(' '));
    origLog(...args);
};

const advies = require('../ad-advies');
const { app } = require('../server');

const DISCLAIMER = advies.DISCLAIMER;
let server;
let base;
let mock;
let mockBase;
let mockHits = 0;
let authKlopt = false;

function emailLogs() {
    return captured.filter((line) => line.includes('[Resend niet geconfigureerd]'));
}

function stamped(body) {
    return Object.assign({ website: '' }, body, { form_ts: issueFormToken(Date.now() - 5000) });
}

function geldig(extra) {
    return stamped(Object.assign({
        functie: 'Magazijnmedewerker',
        taken: 'Orderpicken, dozen tot 15 kg tillen, lopen door het magazijn en staand werken.',
        beperkingen: 'Kan niet lang staan en niet zwaar tillen. Lichte taken zittend gaan wel.',
        rubrieken: { dynamisch: ['tillen'], statisch: ['staan'] },
        eersteZiektedag: '2026-01-06',
        werkpercentage: 40,
        duurzaamheid: 'onbekend',
        email: 'jan@bedrijf.nl',
        telefoon: '',
        avg: true,
    }, extra || {}));
}

async function post(pathname, body, ip) {
    const res = await fetch(base + pathname, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': ip || '203.0.113.50',
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    return { status: res.status, json, text };
}

before(async () => {
    mock = http.createServer((req, res) => {
        mockHits += 1;
        authKlopt = req.headers.authorization === 'Bearer ' + process.env.XAI_API_KEY;
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
            let user = '';
            try { user = JSON.parse(raw).messages.map((m) => m.content).join('\n'); } catch (e) { user = ''; }
            if (user.includes(SLEUTEL) || /bearer/i.test(user)) authKlopt = false;
            const content = JSON.stringify({
                samenvatting: 'Kort beeld \u2014 van de magazijnmedewerker die nu 40 procent werkt.',
                belastbaarheid: 'Tillen en lang staan zijn beperkt. Lichte taken zittend gaan wel.',
                spoor1: 'Eigen werk kan met minder tillen. Ander licht werk bij de eigen werkgever is de tweede stap in spoor 1.',
                spoor2: 'Spoor 2 is pas aan de orde als passend werk bij de eigen werkgever niet haalbaar blijkt.',
                tijdlijn: 'Gebruik de meegestuurde datums voor week 6, 8, 42, 52, 88, 91 en 104.',
                risicos: 'Een loonsanctie kan volgen als de termijnen van de Wet verbetering poortwachter niet worden gehaald.',
                vervolgstappen: 'Werk spoor 1 uit en vraag een volwaardig arbeidsdeskundig onderzoek aan als een rapport nodig is.',
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { content } }] }));
        });
    });
    await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
    mockBase = 'http://127.0.0.1:' + mock.address().port + '/v1';
    process.env.XAI_API_BASE = mockBase;

    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
    console.log = origLog;
    delete process.env.XAI_API_BASE;
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await new Promise((resolve, reject) => mock.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
    resetSpam();
    advies.resetForTests();
    mockHits = 0;
    authKlopt = false;
});

describe('AD-adviesgenerator, pagina', () => {
    it('geeft 200, precies één h1, title, sitemap, JSON-LD en geen dashes', async () => {
        const res = await fetch(base + '/ad-advies-generator');
        assert.equal(res.status, 200);
        const html = await res.text();
        const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) || [];
        assert.equal(h1s.length, 1);
        assert.equal(h1s[0].replace(/<[^>]+>/g, '').trim(), 'Genereer vrijblijvend een arbeidsdeskundig advies');
        assert.match(html, /<title>Gratis AD-adviesgenerator \| Arbeidsdeskundig\.com<\/title>/);
        assert.match(html, /<link rel="canonical" href="https:\/\/www\.arbeidsdeskundig\.com\/ad-advies-generator">/);
        assert.match(html, /<meta name="description" content="[^"]+">/);
        assert.equal(html.includes('\u2014'), false);
        assert.equal(html.includes('\u2013'), false);
        assert.equal(html.includes(SLEUTEL), false);
        assert.equal(html.includes('XAI_API_KEY'), false);
        assert.equal(/api\.x\.ai|Bearer/i.test(html), false);

        const waarschuwing = 'Vul geen medische gegevens in (geen diagnoses, ziektes, medicatie of behandelingen) en geen namen of BSN. Beschrijf alleen wat iemand wel en niet kan.';
        assert.equal(html.split(waarschuwing).length - 1, 2);
        assert.equal(html.includes(DISCLAIMER), true);
        assert.match(html, /href="https:\/\/calendly\.com\/matchvermogen\/30min"/);
        assert.match(html, />085 087 0307</);
        assert.match(html, /Losplaats 16d, 5404 NJ Uden/);
        assert.match(html, /KVK 85849618/);
        assert.match(html, /Vraag een volwaardig arbeidsdeskundig onderzoek aan/);
        assert.match(html, /href="\/aanmelden"/);
        assert.match(html, /href="\/offerte-aanvragen"/);
        assert.match(html, /id="ad-website"/);
        assert.match(html, /<span class="lbl">Naam of organisatie<\/span>/);
        assert.doesNotMatch(html, /Naam of organisatie[\s\S]{0,80}<span class="req">/);
        assert.match(html, /id="ad-avg"/);

        const blocks = [];
        const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
        const appLd = blocks.find((b) => b['@type'] === 'WebApplication');
        const faq = blocks.find((b) => b['@type'] === 'FAQPage');
        assert.ok(appLd);
        assert.equal(appLd.name, 'AD-adviesgenerator');
        assert.equal(appLd.offers.price, '0');
        assert.ok(faq);
        assert.ok(faq.mainEntity.length >= 4 && faq.mainEntity.length <= 5);
        for (const vraag of faq.mainEntity) {
            assert.match(html, new RegExp(vraag.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
            assert.equal(vraag.name.includes('\u2014') || vraag.name.includes('\u2013'), false);
        }

        const xml = await (await fetch(base + '/sitemap.xml')).text();
        assert.match(xml, /<loc>https:\/\/www\.arbeidsdeskundig\.com\/ad-advies-generator<\/loc><lastmod>2026-11-28<\/lastmod>/);
        const llms = await (await fetch(base + '/llms.txt')).text();
        assert.match(llms, /https:\/\/www\.arbeidsdeskundig\.com\/ad-advies-generator/);
        assert.match(llms, /AD-adviesgenerator/);
    });

    it('staat in de navigatie, op de homepage, in een artikel, in de footer en in de sticky balk', async () => {
        const home = await (await fetch(base + '/')).text();
        assert.match(home, /class="nav-promo"[\s\S]*Genereer vrijblijvend een AD-advies/);
        assert.match(home, /id="navDesktop"[\s\S]*href="\/ad-advies-generator"/);
        assert.match(home, /id="navMobile"[\s\S]*href="\/ad-advies-generator"/);
        assert.match(home, /<section class="wrap ad-promo-home"[\s\S]*Genereer vrijblijvend een AD-advies/);
        assert.match(home, /class="footer-grid"[\s\S]*href="\/ad-advies-generator"/);
        assert.match(home, /class="sticky-cta"[\s\S]*Genereer vrijblijvend een AD-advies/);
        assert.match(home, /href="\/offerte-aanvragen"[^>]*>\s*Direct offerte & planning: reactie binnen 24 uur/);
        assert.equal(home.includes('id="view-adviesgenerator"'), false);

        const artikel = await (await fetch(base + '/kennisbank/wat-doet-arbeidsdeskundige')).text();
        assert.match(artikel, /id="ad-promo-artikel"/);
        assert.match(artikel, /Genereer vrijblijvend een AD-advies/);
        assert.equal((artikel.match(/<h1\b/g) || []).length, 1);
    });
});

describe('AD-adviesgenerator, invoer en lead', () => {
    it('toont geen rapport zonder contactgegevens en maakt geen lead', async () => {
        const before = emailLogs().length;
        const { status, json } = await post('/api/ad-advies', geldig({ email: '', telefoon: '' }), '203.0.113.61');
        assert.equal(status, 400);
        assert.equal(json.ok, false);
        assert.match(json.error, /e-mailadres of telefoonnummer/i);
        assert.equal(json.secties, undefined);
        assert.equal(json.id, undefined);
        assert.equal(emailLogs().length, before);
        assert.equal(mockHits, 0);
    });

    it('houdt medische termen en een BSN-patroon tegen zonder lead', async () => {
        const before = emailLogs().length;
        const medisch = await post('/api/ad-advies', geldig({
            beperkingen: 'De diagnose is depressie en er is medicatie.',
        }), '203.0.113.62');
        assert.equal(medisch.status, 400);
        assert.equal(medisch.json.error, advies.MEDISCH_FOUT);
        assert.equal(medisch.json.secties, undefined);
        assert.equal(medisch.text.includes('depressie'), false);

        const bsn = await post('/api/ad-advies', geldig({
            beperkingen: 'Kan niet tillen. BSN 123456782 staat per ongeluk in de tekst.',
        }), '203.0.113.63');
        assert.equal(bsn.status, 400);
        assert.equal(bsn.json.error, advies.MEDISCH_FOUT);
        assert.equal(bsn.text.includes('123456782'), false);
        assert.equal(emailLogs().length, before);
        assert.equal(mockHits, 0);
    });

    it('weigert een aanvraag zonder AVG-toestemming', async () => {
        const { status, json } = await post('/api/ad-advies', geldig({ avg: false }), '203.0.113.64');
        assert.equal(status, 400);
        assert.match(json.error, /toestemming/i);
        assert.equal(json.secties, undefined);
    });

    it('stuurt de lead naar dezelfde mailflow en zet het rapport pas daarna, zonder sleutel', async () => {
        const before = emailLogs().length;
        const { status, json, text } = await post('/api/ad-advies', geldig(), '203.0.113.65');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(json.fallback, false);
        assert.equal(json.secties.length, 7);
        assert.equal(json.disclaimer, DISCLAIMER);
        assert.equal(json.mijlpalen.length, 7);
        assert.equal(text.includes(SLEUTEL), false);
        assert.equal(text.includes('\u2014'), false);
        assert.equal(text.includes('\u2013'), false);
        assert.equal(authKlopt, true);
        assert.equal(mockHits, 1);

        const logs = emailLogs().slice(before);
        assert.ok(logs.some((line) => line.includes('info@matchvermogen.nl') && line.includes('Nieuw AD-advies: jan@bedrijf.nl')));
        assert.ok(logs.some((line) => line.includes('jan@bedrijf.nl') && line.includes('Je indicatieve AD-advies')));
        assert.equal(logs.some((line) => /onbekend/i.test(line)), false);

        const verwacht = advies.berekenTraject('2026-01-06');
        assert.equal(json.mijlpalen[0].datum, verwacht.mijlpalen[0].datumNl);
        assert.equal(json.kop.verzuimduur, verwacht.verzuimduur);
        assert.equal(json.kop.duurzaamheid, 'Onbekend');

        const pdfRes = await fetch(base + '/api/ad-advies-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: json.id }),
        });
        assert.equal(pdfRes.status, 200);
        assert.match(pdfRes.headers.get('content-type'), /application\/pdf/);
        const pdf = Buffer.from(await pdfRes.arrayBuffer());
        assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
        const pdfRuw = pdf.toString('latin1');
        const pdfTekst = [...pdfRuw.matchAll(/<([0-9A-Fa-f]+)>/g)]
            .filter((m) => m[1].length % 2 === 0)
            .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
            .join('');
        assert.equal(pdfTekst.includes('medische informatie'), true);
        assert.equal(pdfTekst.includes(SLEUTEL), false);
        assert.equal(pdfTekst.includes('jan@bedrijf.nl'), false);
        assert.equal(pdfRuw.includes(SLEUTEL), false);
    });

    it('bewaart de lead en toont een fallback als de generator faalt', async () => {
        const vorige = process.env.XAI_API_BASE;
        process.env.XAI_API_BASE = 'http://127.0.0.1:9';
        try {
            const before = emailLogs().length;
            const { status, json } = await post('/api/ad-advies', geldig({ email: 'piet@bedrijf.nl' }), '203.0.113.66');
            assert.equal(status, 200);
            assert.equal(json.ok, true);
            assert.equal(json.fallback, true);
            assert.equal(json.secties.length, 7);
            assert.equal(json.disclaimer, DISCLAIMER);
            assert.match(json.secties.map((s) => s.tekst).join(' '), /spoor 1/i);
            assert.ok(emailLogs().length > before);
        } finally {
            process.env.XAI_API_BASE = vorige;
        }
    });

    it('mailt geen testdata naar info@ maar toont wel het advies', async () => {
        const before = emailLogs().length;
        const { status, json } = await post('/api/ad-advies', geldig({ email: 'demo@example.com' }), '203.0.113.67');
        assert.equal(status, 200);
        assert.equal(json.ok, true);
        assert.equal(json.test, true);
        assert.ok(json.secties.length > 0);
        assert.equal(emailLogs().length, before);
    });
});

describe('AD-adviesgenerator, hulpen', () => {
    it('berekent verzuim en mijlpalen en herkent medische invoer', () => {
        const traject = advies.berekenTraject('2026-01-06', '2026-03-03');
        assert.equal(traject.ok, true);
        assert.equal(traject.verzuimduur, '8 weken');
        assert.equal(traject.mijlpalen.find((m) => m.weken === 6).datum, '2026-02-17');
        assert.equal(traject.mijlpalen.find((m) => m.weken === 104).datum, '2028-01-04');
        assert.equal(advies.vindMedisch('Kan niet tillen en wel administratie doen.'), '');
        assert.equal(advies.vindMedisch('De diagnose is een hernia.'), 'medisch');
        assert.equal(advies.vindMedisch('Nummer 123456782'), 'bsn');
        assert.equal(advies.vindMedisch('Eerste dag 2026-01-06 en 15 kg tillen.'), '');
        assert.equal(advies.elfproef('123456782'), true);
    });

    it('zet bron en niet-medische velden in de mail, met een onderwerp zonder onbekend', () => {
        const parsed = advies.validateAdviesLead(geldig({ email: 'jan@bedrijf.nl', telefoon: '0687654321' }));
        assert.equal(parsed.ok, true);
        assert.equal(parsed.lead.bron, 'ad-advies-generator');
        assert.equal(parsed.lead.dienst, 'AD-adviesgenerator');
        const fields = advies.adviesMailFields(parsed.lead);
        assert.equal(fields.Bron, 'ad-advies-generator');
        assert.equal(fields.Functie, 'Magazijnmedewerker');
        assert.match(fields['FML-rubrieken'], /Tillen of dragen/);
        assert.match(fields['FML-rubrieken'], /Staan/);
        assert.equal(fields['AVG-toestemming'], 'Ja');
        assert.equal(fields['Duurzaam benutbare mogelijkheden'], 'Onbekend');
        assert.equal(parsed.lead.naam, 'Adviesaanvrager');
        assert.equal(fields.Naam, 'Adviesaanvrager');
        const metNaam = advies.validateAdviesLead(geldig({ naam: 'Jansen Logistics' }));
        assert.equal(metNaam.ok, true);
        assert.equal(metNaam.lead.naam, 'Jansen Logistics');
        assert.equal(advies.adviesMailFields(metNaam.lead).Naam, 'Jansen Logistics');
        const zonderPlaatsvervanger = advies.validateAdviesLead(geldig({ naam: 'onbekend' }));
        assert.equal(zonderPlaatsvervanger.lead.naam, 'Adviesaanvrager');
        const subject = advies.safeSubject(parsed.lead.email, parsed.lead.telefoon);
        assert.equal(/onbekend/i.test(subject), false);
        assert.match(subject, /jan@bedrijf.nl/);
    });

    it('vraagt om tijdig en parallel spoor 2, in ongeveer 600 tot 700 woorden', () => {
        const prompt = advies.systeemPrompt();
        assert.match(prompt, /parallel aan spoor 1/);
        assert.match(prompt, /niet pas als spoor 1 is mislukt/);
        assert.match(prompt, /eerstejaarsevaluatie/);
        assert.match(prompt, /600 tot 700 woorden/);
        assert.equal(prompt.includes('\u2014'), false);
        assert.equal(prompt.includes('\u2013'), false);
        const lead = advies.validateAdviesLead(geldig()).lead;
        const fb = advies.fallbackSecties(lead);
        assert.match(fb.spoor2, /parallel aan spoor 1/);
        assert.match(fb.spoor2, /eerstejaarsevaluatie/);
        assert.match(fb.vervolgstappen, /parallel/);
    });

    it('zet het woordmerk in de PDF en begint een kop niet onderaan de pagina', async () => {
        const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'ad-advies.js'), 'utf8');
        assert.equal(src.includes('matchvermogen-logo'), false);
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', margin: 56 });
        const onderaan = doc.page.height - doc.page.margins.bottom - 40;
        doc.y = onderaan;
        const startVoor = doc.bufferedPageRange().start;
        advies.zorgVoorKopruimte(doc, 100);
        assert.equal(doc.bufferedPageRange().start, startVoor + 1);
        assert.ok(doc.y <= doc.page.margins.top + 1);
        const startNa = doc.bufferedPageRange().start;
        doc.y = 120;
        advies.zorgVoorKopruimte(doc, 100);
        assert.equal(doc.bufferedPageRange().start, startNa);
        assert.equal(doc.y, 120);
        doc.end();

        const pdf = await advies.schrijfPdf({
            functie: 'Magazijnmedewerker',
            eersteZiektedagNl: '6 januari 2026',
            verzuimduur: '8 weken',
            peildatumNl: '3 maart 2026',
            werkpercentage: 40,
            fallback: false,
            secties: [
                { titel: 'Samenvatting', tekst: 'Kort beeld.' },
                { titel: 'Belastbaarheid versus belasting van de functie', tekst: 'Tillen is beperkt.' },
            ],
            mijlpalen: [{ label: 'Week 6, probleemanalyse', datumNl: '17 februari 2026' }],
        });
        const tekst = [...pdf.toString('latin1').matchAll(/<([0-9A-Fa-f]+)>/g)]
            .filter((m) => m[1].length % 2 === 0)
            .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
            .join('');
        assert.match(tekst, /arbeidsdeskundig\.com/);
        assert.match(tekst, /Berekende Poortwachter-mijlpalen/);
        assert.match(pdf.toString('latin1'), /https:\/\/www\.arbeidsdeskundig\.com\/aanmelden/);
        assert.match(pdf.toString('latin1'), /https:\/\/calendly\.com\/matchvermogen\/30min/);
        assert.match(tekst, /085 087 0307/);
        assert.match(tekst, /info@arbeidsdeskundig\.com/);
        assert.match(tekst, /www\.arbeidsdeskundig\.com/);
        assert.match(tekst, /Losplaats 16d, 5404 NJ Uden/);
        assert.match(tekst, /KVK 85849618/);
        assert.match(tekst, /Pagina 1/);
        assert.equal(/matchvermogen-logo/i.test(tekst), false);
        assert.equal(require('fs').existsSync(require('path').join(__dirname, '..', 'assets', 'logo-arbeidsdeskundig.png')), true);
    });
});
