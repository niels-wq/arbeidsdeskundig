'use strict';

// Prijsgesprek (naar voorbeeld van matchvermogen.nl-chat 0.1.2, class-mvchat-flow.php).
// Een prijsvraag start een kort, echt gesprek in plaats van een sprong naar contactgegevens:
//  - analyse() leest de geschoonde geschiedenis: is er een prijsvraag, hoeveel antwoorden kwamen erna,
//    welke feiten zijn bekend (soort vraag, verzuimweek of spoed, medewerkers, doel, wat al geprobeerd is, online/fysiek).
//  - De server geeft het model per beurt de VOLGENDE STAP mee (statusblok). Pas na MIN_ANSWERS antwoorden
//    mag om e-mail of telefoon gevraagd worden.
//  - reply() vervangt een geblokkeerd antwoord, en is ook het gescripte gesprek zonder API-sleutel of bij een storing.
// Alle teksten in je-vorm, zonder gedachtestreepjes.

const { TARIFFS } = require('./gate');

const MIN_ANSWERS = 2;
const CALENDLY = 'https://calendly.com/matchvermogen/call-15-min';
const PHONE = '085 087 0307';
const EMAIL = 'info@arbeidsdeskundig.com';
const PRIVACY_URL = 'https://matchvermogen.nl/privacyverklaring/';

function isPriceQuestion(text) {
    return /\bkost|\bkosten\b|prijs|prijzen|tarie[fv]|wat betaal|hoeveel betaal|wat reken|korting|\bbudget\b|offerte bedrag/.test(String(text || '').toLowerCase());
}

function wantsContact(text) {
    return /offerte|terug ?bel|bel me|bellen|contact op|afspraak|kennismak|starten|aanmelden|aanvragen|aanvraag doen|formulier|gegevens achter/.test(String(text || '').toLowerCase());
}

const TYPES = [
    ['poortwachter', /poortwachter|eerstejaars|jaarevaluatie|spoor ?1|spoor ?2|re-?integratie|urenopbouw/],
    ['wga', /\bwga\b|spoor ?3|eigenrisico|\bwia\b/],
    ['ziektewet', /ziektewet|ziek uit dienst|vangnet/],
    ['bezwaar', /bezwaar|herbeoordeling|beroep|second opinion/],
    ['vroeg', /vroegtijdig|vroeg|preventie|preventief|eerste signalen/],
];
const LABELS = {
    poortwachter: 'Poortwachter-onderzoek (spoor 1 / spoor 2)',
    wga: 'WGA / WIA',
    ziektewet: 'Ziektewet-onderzoek',
    bezwaar: 'bezwaar / herbeoordeling',
    vroeg: 'vroegtijdig onderzoek',
};

function emptyFacts() {
    return { soort: '', weken: 0, spoed: false, mw: 0, doel: false, geprobeerd: false, vorm: '' };
}

function factsIn(text, prev) {
    const t = String(text || '').toLowerCase();
    const pv = String(prev || '').toLowerCase();
    const f = emptyFacts();
    for (const [k, rx] of TYPES) { if (rx.test(t)) { f.soort = k; break; } }
    let m;
    if ((m = t.match(/week\s*(\d{1,3})\b/))) f.weken = +m[1];
    else if ((m = t.match(/(\d{1,3})\s*(weken|week|wk)\b/))) f.weken = +m[1];
    else if ((m = t.match(/(\d{1,2})\s*(maanden|maand)\b/))) f.weken = Math.round(+m[1] * 4.33);
    else if (/anderhalf jaar/.test(t)) f.weken = 78;
    else if ((m = t.match(/(\d)\s*jaar\b/))) f.weken = 52 * +m[1];
    else if (/\b(een|ruim een|bijna een) jaar\b/.test(t)) f.weken = 52;
    else if (/half jaar/.test(t)) f.weken = 26;
    if (/spoed|haast|urgent|zo snel mogelijk|asap/.test(t)) f.spoed = true;
    if ((m = t.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:medewerkers|werknemers|mensen|man\b|fte|personen|collega)/))) {
        f.mw = parseInt(m[1].replace(/\./g, ''), 10);
    } else if (/medewerkers|werknemers|organisatie/.test(pv) && (m = t.trim().match(/^\D{0,25}(\d{1,6})\D{0,30}$/)) && !/week|maand|jaar/.test(t)) {
        f.mw = parseInt(m[1], 10);
    }
    if (/\b(willen|wil graag|wil weten|doel|bereiken|terugkeer|terug naar|terug in|eigen werk|ander werk|aangepast werk|duidelijkheid|advies over|uitzoeken|weten of)\b/.test(t)
        || (/bereiken|doel/.test(pv) && t.trim().length > 3)) {
        f.doel = true;
    }
    if (/\bfysiek|op locatie|langskomen/.test(t)) f.vorm = 'fysiek';
    else if (/\bonline|video|teams\b/.test(t)) f.vorm = 'online';
    return f;
}

function nextTopic(k, answers) {
    const verzuimRelevant = k.soort !== 'bezwaar';
    const open = [];
    if (!k.soort) open.push('soort');
    if (verzuimRelevant && !k.weken && !k.spoed) open.push('verzuim');
    if (!k.mw) open.push('mw');
    if (!k.doel) open.push('doel');
    if (!k.geprobeerd && verzuimRelevant) open.push('geprobeerd');
    const enough = answers >= MIN_ANSWERS && (k.mw || answers >= 4);
    if (enough || !open.length) return answers >= MIN_ANSWERS ? 'contact' : (open[0] || 'extra');
    if (answers >= MIN_ANSWERS && !k.mw) return 'mw';
    return open[0];
}

function analyse(history) {
    const h = Array.isArray(history) ? history : [];
    let price = false;
    let answers = 0;
    const known = emptyFacts();
    let last = emptyFacts();
    let prev = '';
    h.forEach((m, i) => {
        if (m.role === 'assistant') { prev = String(m.content || ''); return; }
        if (!price && isPriceQuestion(m.content)) price = true;
        else if (price && prev && !isPriceQuestion(m.content)) answers++;
        const f = factsIn(m.content, prev);
        if (/geprobeerd/.test(prev.toLowerCase()) && String(m.content || '').trim().length > 2) known.geprobeerd = true;
        for (const [k, v] of Object.entries(f)) { if (v) known[k] = v; }
        if (i === h.length - 1) last = f;
        prev = '';
    });
    return { price, answers, known, last, next: nextTopic(known, answers) };
}

const QUESTIONS = {
    soort: 'Om wat voor vraag gaat het? Bijvoorbeeld een Poortwachter-onderzoek rond de eerstejaarsevaluatie (spoor 1 of spoor 2), een WGA- of Ziektewet-vraag, of een bezwaar of herbeoordeling.',
    verzuim: 'Hoe lang is de medewerker al ziek? Of anders gezegd: in welke week van het verzuim zit je nu?',
    mw: 'Hoeveel medewerkers heeft jullie organisatie ongeveer?',
    doel: 'Wat wil je met het onderzoek bereiken? Bijvoorbeeld duidelijkheid of het eigen werk nog passend te maken is, of weten of spoor 2 nodig is.',
    geprobeerd: 'Wat is er tot nu toe al geprobeerd om de medewerker weer aan het werk te helpen?',
    extra: 'Is er nog iets bijzonders aan de situatie dat ik moet weten? Bijvoorbeeld een deadline van UWV of spanningen op de werkvloer.',
};
const TOPIC_LABELS = {
    soort: 'het soort vraag of onderzoek',
    verzuim: 'hoe lang de medewerker al ziek is (week van het verzuim) of of er spoed is',
    mw: 'het aantal medewerkers van de organisatie',
    doel: 'wat ze met het onderzoek willen bereiken',
    geprobeerd: 'wat er al geprobeerd is',
    extra: 'bijzonderheden in de situatie',
};

function question(topic) { return QUESTIONS[topic] || QUESTIONS.doel; }

function reaction(f, first) {
    if (first) return 'Goede vraag! Ik denk graag even met je mee, zodat ik je straks een prijsindicatie kan geven die bij je situatie past.';
    const w = f.weken | 0;
    if (w > 0) {
        if (w <= 12) return 'Fijn dat je er zo vroeg bij bent. In deze fase kan een arbeidsdeskundige nog veel bijsturen en voorkom je onnodig lang verzuim.';
        if (w <= 34) return 'Goed dat je er nu al mee bezig bent. Met een onderzoek in deze fase heb je ruim de tijd om bij te sturen voor de eerstejaarsevaluatie.';
        if (w <= 52) return 'Week ' + w + ' zit precies rond de eerstejaarsevaluatie. Dan kun je nog bijsturen voordat het tweede ziektejaar begint.';
        if (w <= 90) return 'In het tweede ziektejaar telt elke week. Dan wil je zeker weten dat spoor 1 en spoor 2 goed zijn ingevuld, zodat je richting de WIA-aanvraag geen loonsanctie riskeert.';
        if (w < 104) return 'Dan komt de WIA-aanvraag dichtbij. Het is belangrijk dat het re-integratiedossier nu op orde is, zodat UWV geen loonsanctie oplegt.';
        return 'Dan is de wachttijd voorbij. Een goed onderzoek helpt om de WGA-situatie scherp in beeld te brengen.';
    }
    if (f.spoed) return 'Ik snap dat het haast heeft. Een spoedonderzoek is mogelijk.';
    const mw = f.mw | 0;
    if (mw > 0) {
        if (mw <= 5) return 'Bij een klein team weegt één zieke collega zwaar, dus snel duidelijkheid is extra waardevol.';
        if (mw <= 100) return 'Dank je. In een organisatie van die omvang merk je langdurige uitval goed, dus een helder advies over de volgende stap is echt waardevol.';
        return 'Dank je, dat helpt om de juiste aanpak te kiezen.';
    }
    const r = {
        poortwachter: 'Een Poortwachter-onderzoek is ons meest gevraagde onderzoek. We kijken dan of het eigen werk passend is of passend te maken is (spoor 1), of dat spoor 2 nodig is.',
        wga: 'Bij WGA en WIA helpt een goed onderzoek om de arbeidsmogelijkheden en de gevolgen scherp in beeld te brengen.',
        ziektewet: 'Bij een Ziektewet-vraag letten we extra op wat iemand nog wel kan, in concrete functies vertaald.',
        bezwaar: 'Bij bezwaar of een herbeoordeling kijken we of de beperkingen goed zijn vertaald naar de geduide functies.',
        vroeg: 'Goed dat je er vroeg bij bent. Eerder inzetten bespaart tijd en verkleint de kans op een loonsanctie.',
    };
    if (f.soort && r[f.soort]) return r[f.soort];
    if (f.doel) return 'Helder, dan weet ik waar het advies op moet focussen.';
    return 'Dank je, dat helpt.';
}

function privacyLink() { return '[privacyverklaring](' + PRIVACY_URL + ')'; }
function contactSentence() { return 'We gebruiken dit alleen om contact met je op te nemen over je vraag (' + privacyLink() + ').'; }

function contactRequest() {
    return 'Dan heb ik een goed beeld van je situatie. Wil je je e-mailadres of telefoonnummer delen? Dan geef ik je een prijsindicatie voor jullie situatie en neemt een arbeidsdeskundige contact met je op om je casus kort door te nemen. ' + contactSentence();
}

function reply(history) {
    const a = analyse(history);
    const first = a.answers === 0;
    let r = reaction(a.last, first);
    const end = history[history.length - 1];
    if (!first && end && end.role === 'user' && isPriceQuestion(end.content)) {
        r = a.next === 'contact'
            ? 'Ik snap dat je graag meteen een bedrag wilt zien.'
            : 'Ik snap dat je graag meteen een bedrag wilt zien. Ik denk eerst nog even met je mee, dan past de indicatie ook echt bij je situatie.';
    }
    if (a.next === 'contact') return r + ' ' + contactRequest();
    return r + ' ' + question(a.next);
}

function eur(n) { return '€ ' + Number(n).toLocaleString('nl-NL'); }

function tierFor(mw) {
    if (!mw) return '';
    if (mw <= 5) return 'klein';
    if (mw <= 100) return 'midden';
    return 'groot';
}

function priceReply(history, thanks = true) {
    const a = analyse(history);
    const mw = a.known.mw | 0;
    const t = TARIFFS;
    let s = (thanks ? 'Dank je! ' : '') + 'We werken met vaste tarieven, afhankelijk van de grootte van je organisatie: ' + eur(t.klein) + ' (tot 5 medewerkers of een kleine stichting), ' + eur(t.midden) + ' (tot 100 medewerkers) of ' + eur(t.groot) + ' (groot zakelijk), excl. btw, voor een online onderzoek.';
    const tier = tierFor(mw);
    if (tier) s += ' Met ' + mw + ' medewerkers kom je uit op ' + eur(t[tier]) + ' excl. btw.';
    s += ' Fysiek op locatie is ' + eur(t.fysiek) + ' extra, spoed ' + eur(t.spoed) + ' extra.';
    s += '\n\nWe nemen je casus altijd eerst even kort door voordat je de definitieve offerte krijgt. Plan hier een gesprek van 15 minuten: ' + CALENDLY + ' of bel ' + PHONE + '. Heb je intussen nog een vraag? Stel hem gerust.';
    return s;
}

function asksContact(text) {
    return /e-?mailadres of (je )?telefoonnummer|telefoonnummer of (je )?e-?mailadres|(je|jouw) (e-?mailadres|e-?mail|telefoonnummer|nummer|contactgegevens|gegevens)\b.{0,40}(delen|achter|geven|sturen|doorgeven|invullen)|contactgegevens/i.test(String(text || ''));
}

function statusLines(history, contact, justNow) {
    const a = analyse(history);
    if (!a.price) {
        return contact ? '' : '\n- Er loopt geen prijsgesprek. Beantwoord gewoon de vraag. Vraag niet uit jezelf om contactgegevens en open het formulier alleen als de bezoeker zelf een offerte, terugbelverzoek of kennismaking wil.';
    }
    const k = a.known;
    const known = [];
    const open = [];
    if (k.soort) known.push('soort vraag: ' + LABELS[k.soort]); else open.push('soort vraag of onderzoek');
    if (k.weken) known.push('verzuim: ongeveer week ' + k.weken); else if (k.spoed) known.push('spoed'); else open.push('verzuimduur (week)');
    if (k.mw) known.push('medewerkers: ' + k.mw); else open.push('aantal medewerkers');
    if (k.doel) known.push('doel bekend'); else open.push('wat ze willen bereiken');
    if (k.vorm) known.push('voorkeur: ' + k.vorm);
    let b = '\n- PRIJSGESPREK: actief. Antwoorden van de bezoeker sinds de prijsvraag: ' + a.answers + ' (minimaal ' + MIN_ANSWERS + ' voordat je om contactgegevens vraagt).';
    b += '\n- Bekend: ' + (known.length ? known.join('; ') : 'nog niets') + '. Nog onbekend: ' + (open.length ? open.join('; ') : 'niets') + '.';
    if (contact) {
        if (justNow) {
            const tier = tierFor(k.mw);
            b += '\n- VOLGENDE STAP: bedank kort (zonder de gegevens te herhalen). Geef dan de vaste tarieven uit de KENNISBANK (online, excl. btw) en noem ' + (tier ? 'welk tarief past bij ' + k.mw + ' medewerkers' : 'dat het tarief afhangt van de organisatiegrootte; vraag daarna naar het aantal medewerkers') + '. Noem de toeslag voor fysiek en spoed. Zeg dat we de casus altijd eerst kort doornemen voordat de definitieve offerte komt, en stel voor om te bellen (' + PHONE + ') of een gesprek van 15 minuten te plannen via ' + CALENDLY + '. Roep open_lead_form niet aan. Zeg niet dat alles maatwerk is.';
        }
        return b;
    }
    if (a.next === 'contact') {
        b += '\n- VOLGENDE STAP: reageer eerst kort, inhoudelijk en empathisch op het laatste antwoord. Vraag daarna vriendelijk om een e-mailadres of telefoonnummer, ongeveer zo: dan geef ik je een prijsindicatie voor jullie situatie en neemt een arbeidsdeskundige contact met je op om je casus kort door te nemen. Zet er deze zin bij: ' + contactSentence() + ' Open geen formulier.';
    } else {
        b += '\n- VOLGENDE STAP: reageer eerst inhoudelijk en empathisch op het laatste antwoord (1 of 2 zinnen)' + (a.answers === 0 ? ', of op de vraag zelf' : '') + '. Stel daarna precies één vraag, over: ' + (TOPIC_LABELS[a.next] || TOPIC_LABELS.doel) + '. Vraag nog NIET om een e-mailadres of telefoonnummer en open geen formulier.';
    }
    return b;
}

module.exports = {
    MIN_ANSWERS, CALENDLY, PHONE, EMAIL, PRIVACY_URL, LABELS,
    isPriceQuestion, wantsContact, factsIn, analyse, question, reaction, reply, priceReply,
    asksContact, statusLines, contactSentence, tierFor,
};
