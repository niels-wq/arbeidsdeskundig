'use strict';

// Gratis AD-adviesgenerator.
// De xAI-sleutel komt alleen uit XAI_API_KEY (zelfde variabele als de chatbot).
// Die sleutel gaat nooit naar de browser, nooit naar een logregel en nooit naar een antwoord.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
    firstString,
    isPlaceholderName,
    isValidEmail,
    isValidPhone,
} = require('./lead-validation');

const DISCLAIMER = 'Dit is een automatisch gegenereerd, indicatief advies op basis van jouw invoer. Het is geen medisch advies, geen vervanging van een arbeidsdeskundig onderzoek en er kunnen geen rechten aan worden ontleend. De juistheid en adequaatheid voor jouw situatie zijn niet gegarandeerd. Voer geen medische informatie in.';

const MEDISCH_FOUT = 'We kunnen dit niet verwerken. Haal medische gegevens weg (geen diagnoses, ziektes, medicatie of behandelingen) en haal nummers zoals een BSN weg. Beschrijf alleen wat iemand wel en niet kan.';

const ADVIES_FAQS = [
    ['Wat doet de AD-adviesgenerator?', 'De generator maakt een vrijblijvend, indicatief advies op basis van de functie, de functionele beperkingen, de verzuimduur en het werkpercentage. Het is geen arbeidsdeskundig onderzoek.'],
    ['Mag ik een diagnose of andere medische gegevens invullen?', 'Nee. Vul geen diagnoses, ziektes, medicatie, behandelingen, namen of BSN in. Beschrijf alleen wat iemand wel en niet kan.'],
    ['Wanneer verschijnt het advies?', 'Het advies verschijnt op deze pagina nadat je een e-mailadres of telefoonnummer invult en toestemming geeft. Je kunt het daarna als PDF downloaden.'],
    ['Hoe worden de Poortwachter-mijlpalen berekend?', 'Vanaf de eerste ziektedag rekenen we week 6, week 8, week 42, week 52, week 88, week 91 en week 104 uit, telkens als dat aantal weken na de eerste ziektedag.'],
    ['Kunnen er rechten aan dit advies worden ontleend?', 'Nee. Het is een automatisch en indicatief advies. Het vervangt geen medisch advies en geen arbeidsdeskundig onderzoek.'],
];

const FML = [
    {
        id: 'persoonlijk',
        label: 'Persoonlijk functioneren',
        items: [
            ['concentreren', 'Concentreren van de aandacht'],
            ['aandacht', 'Verdelen van de aandacht'],
            ['herinneren', 'Herinneren'],
            ['zelfstandig', 'Zelfstandig handelen'],
            ['doelmatig', 'Doelmatig handelen'],
            ['tempo', 'Handelingstempo'],
        ],
    },
    {
        id: 'sociaal',
        label: 'Sociaal functioneren',
        items: [
            ['zien', 'Zien'],
            ['horen', 'Horen'],
            ['spreken', 'Spreken'],
            ['samenwerken', 'Samenwerken'],
            ['conflicten', 'Omgaan met conflicten'],
            ['gevoelens', 'Eigen gevoelens uiten'],
        ],
    },
    {
        id: 'omgeving',
        label: 'Aanpassing aan fysieke omgeving',
        items: [
            ['hitte', 'Hitte'],
            ['kou', 'Koude'],
            ['geluid', 'Geluid'],
            ['trillingen', 'Trillingen'],
            ['stof', 'Stof, rook, gassen of dampen'],
            ['bescherming', 'Beschermende middelen'],
        ],
    },
    {
        id: 'dynamisch',
        label: 'Dynamische handelingen',
        items: [
            ['tillen', 'Tillen of dragen'],
            ['duwen', 'Duwen of trekken'],
            ['lopen', 'Lopen'],
            ['trappen', 'Trappenlopen'],
            ['reiken', 'Reiken'],
            ['handen', 'Hand- en vingergebruik'],
        ],
    },
    {
        id: 'statisch',
        label: 'Statische houdingen',
        items: [
            ['zitten', 'Zitten'],
            ['staan', 'Staan'],
            ['gebogen', 'Gebogen of getordeerd actief zijn'],
            ['schouder', 'Boven schouderhoogte actief zijn'],
            ['afwisselen', 'Afwisseling van houding'],
        ],
    },
    {
        id: 'werktijden',
        label: 'Werktijden',
        items: [
            ['uren-dag', 'Uren per dag'],
            ['uren-week', 'Uren per week'],
            ['nacht', 'Werken in de nacht'],
            ['onregelmatig', 'Onregelmatige tijden'],
        ],
    },
];

const MIJLPAAL = [
    [6, 'Week 6, probleemanalyse'],
    [8, 'Week 8, plan van aanpak'],
    [42, 'Week 42, melding bij UWV'],
    [52, 'Week 52, eerstejaarsevaluatie'],
    [88, 'Week 88, start van de WIA-aanvraag'],
    [91, 'Week 91, re-integratieverslag bij de WIA-aanvraag'],
    [104, 'Week 104, einde van de wachttijd'],
];

const SECTIE_TITELS = [
    ['samenvatting', 'Samenvatting'],
    ['belastbaarheid', 'Belastbaarheid versus belasting van de functie'],
    ['spoor1', 'Mogelijkheden in spoor 1'],
    ['spoor2', 'Indicatie voor spoor 2'],
    ['tijdlijn', 'Poortwachter-tijdlijn'],
    ['risicos', 'Risico\'s'],
    ['vervolgstappen', 'Aanbevolen vervolgstappen'],
];

const MAANDEN = [
    'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

const MEDISCHE_TERM = new RegExp(
    '\\b(?:' + [
        'gediagnosticeerd', 'geneesmiddelen', 'geneesmiddel', 'antidepressiva',
        'fysiotherapie', 'psychotherapie', 'angststoornis', 'fibromyalgie',
        'schizofrenie', 'aandoeningen', 'aandoening', 'ziektebeeld',
        'behandelingen', 'behandeling', 'medicijngebruik', 'burgerservicenummer',
        'long covid', 'longcovid', 'medicijnen', 'medicatie', 'medicijn',
        'antibiotica', 'antibioticum', 'prednisolon', 'sertraline', 'citalopram',
        'paracetamol', 'ibuprofen', 'oxycodon', 'diagnose', 'diagnoses',
        'burn-out', 'burnout', 'depressief', 'depressie', 'epilepsie',
        'whiplash', 'parkinson', 'artrose', 'beroerte', 'diabetes', 'migraine',
        'autisme', 'therapie', 'operatie', 'chemokuur', 'ziekten', 'ziekte',
        'kanker', 'hernia', 'corona', 'griep', 'astma', 'reuma', 'tumor',
        'morfine', 'covid', 'ptsd', 'ptss', 'adhd', 'bipolair',
    ].sort((a, b) => b.length - a.length).map(escapeRe).join('|') + ')\\b',
    'i'
);

const ITEM_LABEL = new Map();
const ITEM_RUBRIEK = new Map();
for (const rubriek of FML) {
    for (const [id, label] of rubriek.items) {
        ITEM_LABEL.set(rubriek.id + ':' + id, label);
        ITEM_RUBRIEK.set(rubriek.id + ':' + id, rubriek.label);
    }
}

const reports = new Map();
const rateHits = new Map();
const REPORT_TTL_MS = 2 * 60 * 60 * 1000;

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function num(name, def) {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) && n > 0 ? n : def;
}

function schoon(value, max) {
    return String(value == null ? '' : value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max);
}

function tidy(text) {
    return String(text || '')
        .replace(/\u2014/g, ', ')
        .replace(/\u2013/g, '-')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +\n/g, '\n')
        .trim();
}

function redact(text, key) {
    let out = String(text || '');
    if (key) out = out.split(key).join('');
    return out.replace(/Bearer\s+\S+/gi, '').replace(/XAI_API_KEY/g, '');
}

function nlDatum(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const maand = MAANDEN[Number(m[2]) - 1];
    if (!maand) return '';
    return Number(m[3]) + ' ' + maand + ' ' + m[1];
}

function parseIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return '';
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return m[1] + '-' + m[2] + '-' + m[3];
}

function vandaagIso(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
    return parts;
}

function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}

function dagenTussen(van, tot) {
    const [y1, m1, d1] = van.split('-').map(Number);
    const [y2, m2, d2] = tot.split('-').map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
}

function verzuimTekst(dagen) {
    const weken = Math.floor(dagen / 7);
    const rest = dagen % 7;
    const w = weken === 1 ? '1 week' : weken + ' weken';
    const r = rest === 1 ? '1 dag' : rest + ' dagen';
    if (weken <= 0) return r;
    if (rest === 0) return w;
    return w + ' en ' + r;
}

function berekenTraject(iso, vandaag) {
    const start = parseIso(iso);
    const peil = parseIso(vandaag) || vandaagIso();
    if (!start) return { ok: false, error: 'Vul een geldige eerste ziektedag in.' };
    const dagen = dagenTussen(start, peil);
    if (dagen < 0) return { ok: false, error: 'De eerste ziektedag kan niet in de toekomst liggen.' };
    if (dagen > 3660) return { ok: false, error: 'De eerste ziektedag ligt te ver in het verleden. Controleer de datum.' };
    const mijlpalen = MIJLPAAL.map(([weken, label]) => {
        const datum = addDays(start, weken * 7);
        return { weken, label, datum, datumNl: nlDatum(datum) };
    });
    return {
        ok: true,
        eersteZiektedag: start,
        eersteZiektedagNl: nlDatum(start),
        peildatum: peil,
        peildatumNl: nlDatum(peil),
        dagen,
        verzuimduur: verzuimTekst(dagen),
        mijlpalen,
    };
}

function elfproef(digits) {
    let d = String(digits || '');
    if (d.length === 8) d = '0' + d;
    if (!/^\d{9}$/.test(d) || d === '000000000') return false;
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += (9 - i) * Number(d[i]);
    sum -= Number(d[8]);
    return sum % 11 === 0;
}

function heeftBsn(tekst) {
    const raw = String(tekst || '').replace(/\d{4}-\d{2}-\d{2}/g, ' ');
    if (/\b(?:bsn|burgerservicenummer|sofinummer)\b/i.test(raw)) return true;
    const re = /(?<!\d)(?:\d[\s.]?){8,9}(?!\d)/g;
    let m;
    while ((m = re.exec(raw))) {
        const digits = m[0].replace(/\D/g, '');
        if ((digits.length === 8 || digits.length === 9) && elfproef(digits)) return true;
    }
    return false;
}

function vindMedisch(tekst) {
    const raw = String(tekst || '');
    if (heeftBsn(raw)) return 'bsn';
    if (MEDISCHE_TERM.test(raw)) return 'medisch';
    return '';
}

function waarheid(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'ja';
}

function leesRubrieken(raw) {
    const gekozen = [];
    const bron = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    for (const rubriek of FML) {
        const lijst = bron[rubriek.id];
        const items = Array.isArray(lijst) ? lijst : [];
        for (const item of items) {
            const id = String(item || '').trim();
            const key = rubriek.id + ':' + id;
            if (ITEM_LABEL.has(key)) gekozen.push(key);
        }
    }
    return [...new Set(gekozen)];
}

function rubriekenTekst(keys) {
    const perRubriek = new Map();
    for (const key of keys) {
        const rubriek = ITEM_RUBRIEK.get(key);
        const label = ITEM_LABEL.get(key);
        if (!perRubriek.has(rubriek)) perRubriek.set(rubriek, []);
        perRubriek.get(rubriek).push(label);
    }
    return [...perRubriek.entries()].map(([rubriek, labels]) => rubriek + ': ' + labels.join(', ')).join('. ');
}

function naamUitContact(email) {
    const local = String(email || '').split('@')[0].replace(/[._+-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
    if (local && /[a-z]/i.test(local) && !isPlaceholderName(local) && !/onbekend/i.test(local)) {
        return local.slice(0, 80);
    }
    return 'Adviesaanvrager';
}

function safeSubject(email, telefoon) {
    const contact = (email || telefoon || 'nieuw contact').trim();
    const zichtbaar = /onbekend/i.test(contact) ? 'nieuw contact' : contact;
    return 'Nieuw AD-advies: ' + zichtbaar;
}

function validateAdviesLead(fields, now = new Date()) {
    const src = (fields && typeof fields === 'object' && !Array.isArray(fields)) ? fields : {};
    const email = schoon(firstString(src, ['email', 'ad-email']), 120);
    const telefoon = schoon(firstString(src, ['telefoon', 'ad-telefoon']), 30);
    const functie = schoon(firstString(src, ['functie', 'functienaam', 'ad-functie']), 120);
    const taken = schoon(firstString(src, ['taken', 'taakomschrijving', 'ad-taken']), 1500);
    const beperkingen = schoon(firstString(src, ['beperkingen', 'ad-beperkingen']), 2000);
    const duurzaamheid = schoon(firstString(src, ['duurzaamheid', 'ad-duurzaamheid']), 20).toLowerCase();
    const rubriekKeys = leesRubrieken(src.rubrieken);
    const errors = [];

    if (!isValidEmail(email) && !isValidPhone(telefoon)) {
        errors.push('Vul een e-mailadres of telefoonnummer in.');
    } else {
        if (email && !isValidEmail(email)) errors.push('Vul een geldig e-mailadres in.');
        if (telefoon && !isValidPhone(telefoon)) errors.push('Vul een geldig telefoonnummer in.');
    }
    if (!waarheid(src.avg)) {
        errors.push('Vink aan dat je toestemming geeft om je gegevens te gebruiken voor dit advies en om contact op te nemen.');
    }
    if (functie.length < 2) errors.push('Vul de functienaam in.');
    if (taken.length < 8) errors.push('Vul een korte taakomschrijving in.');
    if (beperkingen.length < 8 && !rubriekKeys.length) {
        errors.push('Beschrijf de functionele beperkingen of vink minstens één rubriek aan.');
    }
    const duurzaamOk = duurzaamheid === 'ja' || duurzaamheid === 'nee' || duurzaamheid === 'onbekend';
    if (!duurzaamOk) errors.push('Geef aan of er duurzaam benutbare mogelijkheden zijn: ja, nee of onbekend.');

    let percentage = NaN;
    const percRaw = src.werkpercentage != null ? src.werkpercentage : src['ad-percentage'];
    if (typeof percRaw === 'number' && Number.isFinite(percRaw)) percentage = percRaw;
    else if (typeof percRaw === 'string' && percRaw.trim() !== '') percentage = Number(percRaw.trim());
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
        errors.push('Vul een werkpercentage tussen 0 en 100 in.');
    }

    const traject = berekenTraject(firstString(src, ['eersteZiektedag', 'eerste-ziektedag', 'ad-ziektedag']), vandaagIso(now));
    if (!traject.ok) errors.push(traject.error);

    const lead = {
        naam: naamUitContact(email),
        email: isValidEmail(email) ? email : '',
        telefoon: isValidPhone(telefoon) ? telefoon : '',
        dienst: 'AD-adviesgenerator',
        bron: 'ad-advies-generator',
        functie,
        taken,
        beperkingen,
        rubriekKeys,
        rubriekenTekst: rubriekenTekst(rubriekKeys),
        duurzaamheid: duurzaamOk ? duurzaamheid : '',
        werkpercentage: Number.isInteger(percentage) ? percentage : null,
        avg: waarheid(src.avg),
    };
    if (traject.ok) Object.assign(lead, traject);

    if (errors.length) return { ok: false, errors, lead };
    return { ok: true, lead };
}

function invoerTekst(lead) {
    return [lead.functie, lead.taken, lead.beperkingen, lead.rubriekenTekst].join('\n');
}

function alleVrijeTekst(fields) {
    const src = (fields && typeof fields === 'object' && !Array.isArray(fields)) ? fields : {};
    const skip = new Set([
        'email', 'telefoon', 'ad-email', 'ad-telefoon', 'form_ts', 'website',
        'avg', 'werkpercentage', 'ad-percentage', 'duurzaamheid', 'ad-duurzaamheid',
        'eersteZiektedag', 'eerste-ziektedag', 'ad-ziektedag',
    ]);
    const parts = [];
    for (const [key, val] of Object.entries(src)) {
        if (skip.has(key)) continue;
        if (typeof val === 'string') parts.push(val);
        else if (Array.isArray(val)) parts.push(val.filter((item) => typeof item === 'string').join(' '));
        else if (val && typeof val === 'object') {
            for (const nested of Object.values(val)) {
                if (typeof nested === 'string') parts.push(nested);
                else if (Array.isArray(nested)) parts.push(nested.filter((item) => typeof item === 'string').join(' '));
            }
        }
    }
    return parts.join('\n');
}

function mijlpalenTekst(lead) {
    return (lead.mijlpalen || []).map((m) => m.label + ': ' + m.datumNl).join('; ');
}

function adviesMailFields(lead) {
    const duurLabel = lead.duurzaamheid === 'ja' ? 'Ja' : (lead.duurzaamheid === 'nee' ? 'Nee' : 'Onbekend');
    return {
        Aanvraag: 'AD-adviesgenerator',
        Bron: 'ad-advies-generator',
        Dienst: lead.dienst,
        Naam: lead.naam,
        'E-mail': lead.email,
        Telefoon: lead.telefoon,
        Functie: lead.functie,
        Taakomschrijving: lead.taken,
        'Functionele beperkingen': lead.beperkingen,
        'FML-rubrieken': lead.rubriekenTekst,
        'Eerste ziektedag': lead.eersteZiektedagNl,
        Verzuimduur: lead.verzuimduur,
        Werkpercentage: lead.werkpercentage + ' procent',
        'Duurzaam benutbare mogelijkheden': duurLabel,
        'Poortwachter-mijlpalen': mijlpalenTekst(lead),
        'AVG-toestemming': 'Ja',
    };
}

function systeemPrompt() {
    return [
        'Je bent een geregistreerd arbeidsdeskundige en schrijft een vrijblijvend, indicatief advies. Je bent geen arts.',
        'Schrijf uitsluitend in het Nederlands. Gebruik geen emdash en geen endash.',
        'Kader: de WIA, de Wet verbetering poortwachter, spoor 1 en spoor 2, en passende arbeid.',
        'Een loonwaarde noem je alleen kwalitatief, bijvoorbeeld beperkt, redelijk of goed. Noem geen percentage als loonwaarde. Het werkpercentage in de invoer is het percentage dat iemand nu werkt, niet de loonwaarde.',
        'Gebruik alleen de feiten uit de invoer en de meegestuurde Poortwachter-datums. Verzin geen ECLI-nummers, geen bedragen, geen boetes en geen statistieken. Als iets niet uit de invoer volgt, zeg dan dat het ontbreekt.',
        'Medische gegevens horen niet in de invoer. Ga er niet op in en noem geen diagnose.',
        'Antwoord alleen met JSON, zonder markdown, in precies deze velden: samenvatting, belastbaarheid, spoor1, spoor2, tijdlijn, risicos, vervolgstappen.',
        'samenvatting: kort beeld van functie, beperkingen, werkpercentage en verzuimduur.',
        'belastbaarheid: wat iemand volgens de invoer wel en niet kan, afgezet tegen de belasting van de functie.',
        'spoor1: mogelijkheden in eigen werk aangepast en in ander werk bij de eigen werkgever.',
        'spoor2: indicatie of oriëntatie op werk bij een andere werkgever logisch is, en waarom.',
        'tijdlijn: de Poortwachter-mijlpalen op de meegestuurde datums (week 6, 8, 42, 52, 88, 91 en 104).',
        'risicos: het risico op een loonsanctie als termijnen of re-integratie-inspanningen niet op orde zijn, zonder bedragen.',
        'vervolgstappen: concrete volgende stappen voor werkgever en werknemer, waaronder een volwaardig arbeidsdeskundig onderzoek als een onderbouwd rapport nodig is.',
        'Houd elk veld beknopt. Samen ongeveer 700 woorden.',
    ].join('\n');
}

function gebruikersPrompt(lead) {
    const duur = lead.duurzaamheid === 'ja'
        ? 'ja, er lijken duurzaam benutbare mogelijkheden te zijn'
        : (lead.duurzaamheid === 'nee'
            ? 'nee, er lijken geen duurzaam benutbare mogelijkheden te zijn'
            : 'niet bekend of er duurzaam benutbare mogelijkheden zijn');
    const mijlpalen = (lead.mijlpalen || []).map((m) => '- ' + m.label + ': ' + m.datumNl + ' (' + m.datum + ')').join('\n');
    return [
        'Functie: ' + lead.functie,
        'Taken: ' + lead.taken,
        'Functionele beperkingen, vrije tekst: ' + (lead.beperkingen || 'geen vrije tekst'),
        'Aangevinkte beperkingen: ' + (lead.rubriekenTekst || 'geen'),
        'Eerste ziektedag: ' + lead.eersteZiektedagNl,
        'Verzuimduur op ' + lead.peildatumNl + ': ' + lead.verzuimduur,
        'Huidig werkpercentage: ' + lead.werkpercentage + ' procent. Dit is geen loonwaarde.',
        'Duurzaam benutbare mogelijkheden: ' + duur,
        'Poortwachter-mijlpalen, al berekend. Gebruik deze datums en verzin er geen:',
        mijlpalen,
    ].join('\n');
}

function fallbackSecties(lead) {
    const duur = lead.duurzaamheid === 'ja'
        ? 'Volgens de invoer lijken er duurzaam benutbare mogelijkheden te zijn.'
        : (lead.duurzaamheid === 'nee'
            ? 'Volgens de invoer lijken er geen duurzaam benutbare mogelijkheden te zijn. Dat is een indicatie, geen vaststelling.'
            : 'Of er duurzaam benutbare mogelijkheden zijn, is niet ingevuld. Dat vraagt om een oordeel van de bedrijfsarts en een arbeidsdeskundige.');
    return {
        samenvatting: 'Indicatief beeld bij de functie ' + lead.functie + '. De persoon werkt nu ' + lead.werkpercentage + ' procent. De verzuimduur is ' + lead.verzuimduur + ', gerekend tot ' + lead.peildatumNl + '. ' + duur,
        belastbaarheid: 'Taken in de functie: ' + lead.taken + '. Beperkingen volgens de invoer: ' + (lead.beperkingen || 'geen vrije tekst') + '. Aangevinkt: ' + (lead.rubriekenTekst || 'geen rubrieken') + '. Zet dit af tegen wat de functie vraagt. Waar de belasting hoger is dan de belastbaarheid, is aanpassing of ander werk nodig. Een loonwaarde is hier alleen kwalitatief te noemen: zonder onderzoek is niet te zeggen of die beperkt, redelijk of goed is.',
        spoor1: 'Kijk eerst of het eigen werk kan worden aangepast, in taken, uren, tempo of hulpmiddelen, en of er ander passend werk bij de eigen werkgever is. Spoor 1 is pas afgerond als dat aantoonbaar is onderzocht.',
        spoor2: 'Spoor 2, werk bij een andere werkgever, komt in beeld als passend werk in spoor 1 niet haalbaar lijkt. Deze generator geeft daar alleen een indicatie. Een arbeidsdeskundige stelt vast of spoor 2 aan de orde is.',
        tijdlijn: 'De mijlpalen zijn berekend als een vast aantal weken na de eerste ziektedag ' + lead.eersteZiektedagNl + '. Gebruik die datums in het plan van aanpak en het re-integratieverslag. Week 6 is de probleemanalyse, week 8 het plan van aanpak, week 42 de melding bij UWV, week 52 de eerstejaarsevaluatie, week 88 en 91 de WIA-aanvraag met het re-integratieverslag, en week 104 het einde van de wachttijd.',
        risicos: 'Een loonsanctie kan volgen als de werkgever de re-integratie-inspanningen of de termijnen van de Wet verbetering poortwachter niet nakomt, bijvoorbeeld een te late probleemanalyse, een ontbrekend plan van aanpak of een te late WIA-aanvraag. Deze tekst noemt geen bedrag: de hoogte hangt van het loon af en wordt door UWV vastgesteld.',
        vervolgstappen: 'Leg de beperkingen naast de taken. Werk spoor 1 uit: eigen werk aangepast en ander werk bij de eigen werkgever. Bewaak de mijlpalen. Vraag een volwaardig arbeidsdeskundig onderzoek aan als je een onderbouwd rapport nodig hebt.',
    };
}

function naarSecties(obj, key) {
    return SECTIE_TITELS.map(([id, titel]) => ({
        id,
        titel,
        tekst: tidy(redact(obj[id], key)).slice(0, 2500),
    }));
}

function parseModel(text, key) {
    let raw = redact(tidy(text), key);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    let obj;
    try { obj = JSON.parse(raw.slice(start, end + 1)); } catch (e) { return null; }
    if (!obj || typeof obj !== 'object') return null;
    for (const [id] of SECTIE_TITELS) {
        if (typeof obj[id] !== 'string' || !tidy(obj[id])) return null;
    }
    const joined = SECTIE_TITELS.map(([id]) => obj[id]).join('\n');
    if (/ECLI\s*:/i.test(joined)) return null;
    return naarSecties(obj, key);
}

function rateLimited(ip, now = Date.now()) {
    const max = num('AD_ADVIES_RATE_MAX', 6);
    const windowMs = num('AD_ADVIES_RATE_WINDOW_MS', 60 * 60 * 1000);
    const key = ip || 'unknown';
    const list = (rateHits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
        rateHits.set(key, list);
        return true;
    }
    list.push(now);
    rateHits.set(key, list);
    return false;
}

async function vraagModel(lead, fetchImpl) {
    const key = process.env.XAI_API_KEY || '';
    if (!key) {
        const err = new Error('nokey');
        err.code = 'nokey';
        throw err;
    }
    const doFetch = fetchImpl || globalThis.fetch;
    const url = (process.env.XAI_API_BASE || 'https://api.x.ai/v1').replace(/\/$/, '') + '/chat/completions';
    const body = {
        model: process.env.XAI_MODEL || 'grok-4.20-0309-non-reasoning',
        messages: [
            { role: 'system', content: systeemPrompt() },
            { role: 'user', content: gebruikersPrompt(lead) },
        ],
        max_tokens: num('AD_ADVIES_MAX_TOKENS', 1200),
        temperature: 0.2,
        stream: false,
    };
    const timeoutMs = num('AD_ADVIES_TIMEOUT_MS', 25000);
    const r = await doFetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
        console.error('[ad-advies] xAI HTTP', r.status);
        const err = new Error('api');
        err.code = 'api';
        throw err;
    }
    const json = await r.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    const secties = parseModel(typeof content === 'string' ? content : '', key);
    if (!secties) {
        const err = new Error('parse');
        err.code = 'parse';
        throw err;
    }
    return secties;
}

function pruneReports(now = Date.now()) {
    for (const [id, rec] of reports) {
        if (now - rec.created > REPORT_TTL_MS) reports.delete(id);
    }
    while (reports.size > 400) {
        const oldest = reports.keys().next().value;
        reports.delete(oldest);
    }
}

function storeReport(rec) {
    pruneReports();
    const id = crypto.randomBytes(16).toString('hex');
    reports.set(id, Object.assign({ created: Date.now() }, rec));
    return id;
}

function getReport(id) {
    pruneReports();
    if (!/^[a-f0-9]{32}$/.test(String(id || ''))) return null;
    return reports.get(String(id)) || null;
}

function loadLogo() {
    try {
        return fs.readFileSync(path.join(__dirname, 'assets', 'matchvermogen-logo.png'));
    } catch (e) {
        return null;
    }
}

function schrijfPdf(rec) {
    const logo = loadLogo();
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 56, compress: false });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.info.Title = 'Indicatief arbeidsdeskundig advies';
        doc.info.Author = 'arbeidsdeskundig.com';

        const ink = '#12203A';
        const amber = '#D8A03D';
        const teal = '#1F6F5C';
        const muted = '#555555';
        const width = doc.page.width - 112;

        if (logo) {
            const logoWidth = 150;
            const logoHeight = logoWidth / (1434 / 383);
            doc.image(logo, 56, 40, { width: logoWidth, height: logoHeight });
            doc.fillColor(ink).fontSize(16).font('Helvetica-Bold').text('Indicatief arbeidsdeskundig advies', 56, 40 + logoHeight + 12, { width });
            doc.fillColor(muted).fontSize(9).font('Helvetica').text('arbeidsdeskundig.com, onderdeel van Matchvermogen B.V.', 56, 40 + logoHeight + 32, { width });
            doc.y = 40 + logoHeight + 52;
        } else {
            doc.fillColor(ink).fontSize(16).font('Helvetica-Bold').text('arbeidsdeskundig.com', 56, 40);
            doc.fillColor(ink).fontSize(13).font('Helvetica-Bold').text('Indicatief arbeidsdeskundig advies', 56, 62);
            doc.y = 88;
        }

        doc.moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).strokeColor(teal).lineWidth(2).stroke();
        doc.lineWidth(1);
        doc.moveDown(0.6);
        doc.fillColor(muted).fontSize(9).font('Helvetica');
        doc.text('Functie: ' + (rec.functie || ''), { width });
        doc.text('Eerste ziektedag: ' + (rec.eersteZiektedagNl || ''), { width });
        doc.text('Verzuimduur: ' + (rec.verzuimduur || '') + ' (peildatum ' + (rec.peildatumNl || '') + ')', { width });
        doc.text('Werkpercentage nu: ' + (rec.werkpercentage == null ? '' : rec.werkpercentage + ' procent'), { width });
        if (rec.fallback) {
            doc.moveDown(0.4);
            doc.fillColor(ink).font('Helvetica-Oblique').text('De automatische generator was even niet beschikbaar. Dit is een basisadvies op basis van de invoer.', { width });
            doc.font('Helvetica');
        }

        for (const sectie of rec.secties || []) {
            doc.moveDown(0.8);
            doc.fillColor(ink).fontSize(12).font('Helvetica-Bold').text(sectie.titel, { width });
            doc.moveDown(0.2);
            doc.fillColor('#222222').fontSize(10).font('Helvetica').text(sectie.tekst || '', { width, lineGap: 2 });
        }

        doc.moveDown(0.8);
        doc.fillColor(ink).fontSize(12).font('Helvetica-Bold').text('Berekende Poortwachter-mijlpalen', { width });
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica');
        for (const m of rec.mijlpalen || []) {
            doc.fillColor(muted).text(m.label, { continued: false, width });
            doc.fillColor(ink).text(m.datumNl, { width });
            doc.moveDown(0.15);
        }

        doc.moveDown(0.8);
        doc.fillColor(amber).rect(56, doc.y, width, 2).fill();
        doc.moveDown(0.5);
        doc.fillColor(muted).fontSize(8).font('Helvetica').text(DISCLAIMER, { width, lineGap: 1 });
        doc.moveDown(1);
        doc.fillColor(muted).fontSize(8).text(
            'Matchvermogen B.V., Losplaats 16d, 5404 NJ Uden, 085 087 0307, info@arbeidsdeskundig.com, KVK 85849618',
            { width, align: 'center' }
        );
        doc.end();
    });
}

function resetForTests() {
    reports.clear();
    rateHits.clear();
}

function register(app, deps) {
    const deliverSalesLead = deps.deliverSalesLead;
    const fieldsToHtml = deps.fieldsToHtml;
    const escapeHtml = deps.escapeHtml;
    const formSpam = deps.formSpam;
    const rejectLead = deps.rejectLead;
    const fetchImpl = deps.fetchImpl;

    app.post('/api/ad-advies', async (req, res) => {
        if (formSpam.assess({ fields: req.body, ip: formSpam.clientIp(req) })) {
            console.log('[ad-advies] spam gedropt');
            return res.json({ ok: true });
        }
        const parsed = validateAdviesLead(req.body);
        if (!parsed.ok) {
            console.log('[ad-advies] afgewezen:', parsed.errors[0]);
            return rejectLead(res, parsed);
        }
        const lead = parsed.lead;
        if (vindMedisch(invoerTekst(lead) + '\n' + alleVrijeTekst(req.body))) {
            console.log('[ad-advies] medische invoer of BSN tegengehouden');
            return res.status(400).json({ ok: false, error: MEDISCH_FOUT });
        }
        if (rateLimited(formSpam.clientIp(req))) {
            return res.status(429).json({
                ok: false,
                error: 'Je hebt te vaak een advies aangevraagd. Probeer het over een uur opnieuw, of bel ons op 085 087 0307.',
            });
        }

        const mailFields = adviesMailFields(lead);
        const subject = safeSubject(lead.email, lead.telefoon);
        let delivered;
        try {
            delivered = await deliverSalesLead({
                kind: 'ad-advies-generator',
                lead,
                rawFields: req.body,
                notifySubject: subject,
                notifyHtml: '<h2>Nieuw indicatief AD-advies via arbeidsdeskundig.com</h2><table>' + fieldsToHtml(mailFields) + '</table>',
                replyTo: lead.email || undefined,
                visitor: lead.email ? {
                    to: lead.email,
                    subject: 'Je indicatieve AD-advies, arbeidsdeskundig.com',
                    html: '<p>Bedankt. We hebben je aanvraag ontvangen. Het advies staat op de pagina waar je het hebt aangevraagd. ' + escapeHtml(DISCLAIMER) + '</p>',
                } : null,
            });
        } catch (err) {
            console.error('[ad-advies] lead doorsturen mislukt');
            delivered = { ok: false };
        }
        if (!delivered || delivered.blocked || delivered.ok === false) {
            return res.status(500).json({
                ok: false,
                error: 'Je aanvraag kon niet veilig worden doorgezet. Probeer het opnieuw of bel ons op 085 087 0307.',
            });
        }

        let secties;
        let fallback = false;
        try {
            secties = await vraagModel(lead, fetchImpl);
        } catch (err) {
            const code = (err && err.code) || (err && err.cause && err.cause.code) || 'fout';
            console.error('[ad-advies] generator niet gelukt', code);
            fallback = true;
            secties = naarSecties(fallbackSecties(lead), '');
        }

        const id = storeReport({
            secties,
            mijlpalen: lead.mijlpalen,
            verzuimduur: lead.verzuimduur,
            peildatumNl: lead.peildatumNl,
            eersteZiektedagNl: lead.eersteZiektedagNl,
            functie: lead.functie,
            werkpercentage: lead.werkpercentage,
            fallback,
        });

        const duurLabel = lead.duurzaamheid === 'ja' ? 'Ja' : (lead.duurzaamheid === 'nee' ? 'Nee' : 'Onbekend');
        res.json({
            ok: true,
            id,
            fallback,
            test: !!delivered.test,
            disclaimer: DISCLAIMER,
            kop: {
                functie: lead.functie,
                verzuimduur: lead.verzuimduur,
                peildatum: lead.peildatumNl,
                eersteZiektedag: lead.eersteZiektedagNl,
                werkpercentage: lead.werkpercentage,
                duurzaamheid: duurLabel,
            },
            mijlpalen: lead.mijlpalen.map((m) => ({ label: m.label, datum: m.datumNl })),
            secties,
        });
    });

    app.post('/api/ad-advies-pdf', async (req, res) => {
        const id = req.body && req.body.id;
        const rec = getReport(id);
        if (!rec) {
            return res.status(404).json({ ok: false, error: 'Dit rapport is verlopen. Genereer het opnieuw.' });
        }
        try {
            const pdf = await schrijfPdf(rec);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="ad-advies-arbeidsdeskundig.pdf"');
            res.send(pdf);
        } catch (err) {
            console.error('[ad-advies] pdf mislukt');
            if (!res.headersSent) {
                res.status(500).json({ ok: false, error: 'De PDF kon niet worden gemaakt. Het advies blijft wel op het scherm staan.' });
            }
        }
    });
}

module.exports = {
    DISCLAIMER,
    MEDISCH_FOUT,
    ADVIES_FAQS,
    FML,
    MIJLPAAL,
    berekenTraject,
    vindMedisch,
    elfproef,
    validateAdviesLead,
    adviesMailFields,
    safeSubject,
    fallbackSecties,
    register,
    resetForTests,
    getReport,
};
