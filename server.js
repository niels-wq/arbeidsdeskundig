// server.js — arbeidsdeskundig.com
// Dunne Express-laag rond de bestaande single-file frontend (public/index.html).
// Doel: elke pagina/artikel krijgt een eigen, echte URL met eigen <title>, meta
// description, canonical en (voor artikelen) Article-structured-data, zodat
// Google en LLM-crawlers elke pagina los kunnen indexeren — in plaats van alles
// onder één URL (zoals het geval was toen dit alleen een los HTML-bestand was).

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const {
    isHoneypotTriggered,
    isTestLead,
    leadDedupeKey,
    notifyIsSafe,
    validateOfferteLead,
    validateAanmeldLead,
    validateChecklistLead,
    validateBelMeTerugLead,
} = require('./lead-validation');

const app = express();

// Vangnet: een onverwachte fout ergens in het proces mag de server nooit
// stilzwijgend laten crashen (dat zou lopende verzoeken afbreken met een
// leeg/ongeldig antwoord — precies het "unexpected end of JSON input"-symptoom).
process.on('uncaughtException', (err) => {
    console.error('[proces] Onverwachte fout (proces blijft draaien):', err);
});
process.on('unhandledRejection', (err) => {
    console.error('[proces] Onverwachte afgewezen promise (proces blijft draaien):', err);
});
const PORT = process.env.PORT || 3000;
// Altijd zonder trailing slash, zodat sitemap/canonicals nooit // in de URL krijgen
// als BASE_URL in Railway per ongeluk mét slash is gezet.
const BASE_URL = (process.env.BASE_URL || 'https://www.arbeidsdeskundig.com').replace(/\/$/, '');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Persoonlijke foto voor het bedankblok onderaan de offerte-PDF. Optioneel: als
// het bestand ontbreekt (bijv. nog niet geüpload), slaat de PDF dit blok gewoon over.
let PERSONAL_PHOTO = null;
try {
    PERSONAL_PHOTO = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'niels-foto.png'));
} catch (e) {
    console.log('[Offerte-PDF] Geen persoonlijke foto gevonden op public/assets/niels-foto.png — sectie wordt overgeslagen.');
}

let MATCHVERMOGEN_LOGO = null;
let MATCHVERMOGEN_LOGO_RATIO = 1434 / 383;
try {
    MATCHVERMOGEN_LOGO = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'matchvermogen-logo.png'));
} catch (e) {
    console.log('[Offerte-PDF] Geen Matchvermogen-logo gevonden op public/assets/matchvermogen-logo.png — tekstversie wordt gebruikt.');
}

// Artikel-metadata (slug, titel, meta description, tag) wordt bij het opstarten
// rechtstreeks uit de `posts`-array in public/index.html gehaald — dat is de
// enige bron van waarheid. Geen los posts.json-bestand meer om synchroon te
// houden: pas je een artikel aan in index.html, dan klopt de routing vanzelf.
function extractPosts(html) {
    try {
        const start = html.indexOf('const posts = [');
        if (start === -1) {
            console.error('[seo] Geen `const posts = [` gevonden in index.html — kennisbank-URLs ontbreken in sitemap.');
            return [];
        }
        const end = html.indexOf('\n  ];', start);
        const block = end === -1 ? html.slice(start) : html.slice(start, end);
        const lines = block.match(/\{ tag:.*? \},?/gs) || [];
        const field = (name, line) => {
            const m = line.match(new RegExp(name + ':"((?:[^"\\\\]|\\\\.)*)"'));
            return m ? m[1].replace(/\\"/g, '"') : null;
        };
        const extractBracketArray = (key, line) => {
            const needle = key + ':[';
            const idx = line.indexOf(needle);
            if (idx === -1) return null;
            // Balanced-bracket scan vanaf 'key:' tot de bijbehorende sluit-bracket.
            let depth = 0, i = idx + key.length, startIdx = -1;
            for (; i < line.length; i++) {
                if (line[i] === '[') { if (depth === 0) startIdx = i; depth++; }
                else if (line[i] === ']') { depth--; if (depth === 0) { i++; break; } }
            }
            const raw = line.slice(startIdx, i);
            try { return JSON.parse(raw); } catch (e) { return null; }
        };
        return lines
            .map((line) => ({
                slug: field('slug', line),
                title: field('title', line),
                meta: field('meta', line),
                tag: field('tag', line),
                read: field('read', line),
                kernpunten: extractBracketArray('kernpunten', line),
                faq: extractBracketArray('faq', line),
            }))
            .filter((p) => p.slug);
    } catch (err) {
        console.error('[seo] Posts uit index.html lezen mislukt — sitemap valt terug op statische pagina\'s:', err);
        return [];
    }
}

const posts = extractPosts(INDEX_HTML);

// Artikelteksten (template literals in `articleContent`) — nodig om kennisbank-
// URL's zonder JavaScript al unieke, crawlbare content te geven. Zonder dit
// ziet Google op elke artikel-URL dezelfde homepage (view-home is standaard
// `active`, `#artikel-body` is leeg) en classificeert dat als soft-404.
function extractArticleBodies(html) {
    const startMarker = 'const articleContent = {';
    const start = html.indexOf(startMarker);
    if (start === -1) return {};
    const end = html.indexOf('\n  const kGrid = ', start);
    if (end === -1) return {};
    const block = html.slice(start + startMarker.length, end);
    const bodies = {};
    const re = /(?:^|\n)(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:\s*`([\s\S]*?)`\s*,?/g;
    let m;
    while ((m = re.exec(block))) {
        bodies[m[1] || m[2]] = m[3];
    }
    return bodies;
}

const articleBodies = extractArticleBodies(INDEX_HTML);

// Oude of verkeerd geschreven slugs die Google nog crawlt → huidige artikel.
// Alleen permanente 301's naar een live equivalent; geen nieuwe pagina's.
const KENNISBANK_SLUG_REDIRECTS = {
    'mediations-arbeidsconflict': 'mediation-arbeidsconflict',
};

// personaData is pure JSON (gegenereerd met json.dumps), dus simpel te parsen —
// geen regex-gepuzzel zoals bij de `posts`-array met zijn JS-objectliteral-syntax.
function extractPersonas(html) {
    try {
        const start = html.indexOf('const personaData = ');
        if (start === -1) {
            console.error('[seo] Geen `const personaData` gevonden in index.html — /voor/-URLs ontbreken in sitemap.');
            return [];
        }
        const jsonStart = html.indexOf('[', start);
        if (jsonStart === -1) return [];
        let depth = 0, i = jsonStart;
        for (; i < html.length; i++) {
            if (html[i] === '[') depth++;
            else if (html[i] === ']') { depth--; if (depth === 0) { i++; break; } }
        }
        const parsed = JSON.parse(html.slice(jsonStart, i));
        return Array.isArray(parsed) ? parsed.filter((p) => p && p.slug) : [];
    } catch (e) {
        console.error('[seo] Personas uit index.html lezen mislukt — sitemap slaat /voor/-URLs over:', e);
        return [];
    }
}

const personas = extractPersonas(INDEX_HTML);

// Zichtbare FAQ's van /veelgestelde-vragen (bron: `const faqs` in index.html).
// Alleen Q+A — slugs/CTA's zijn client-only. Gebruikt voor JSON-LD én SSR-hydratie
// zodat Google de vragen ziet zonder JavaScript.
function extractSiteFaqs(html) {
    try {
        const start = html.indexOf('  const faqs = [');
        if (start === -1) return [];
        const end = html.indexOf('\n  ];', start);
        const block = end === -1 ? html.slice(start) : html.slice(start, end);
        const items = [];
        const re = /\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"/g;
        let m;
        while ((m = re.exec(block))) {
            items.push([
                m[1].replace(/\\"/g, '"'),
                m[2].replace(/\\"/g, '"'),
            ]);
        }
        return items;
    } catch (err) {
        console.error('[seo] Site-FAQ uit index.html lezen mislukt:', err);
        return [];
    }
}

const siteFaqs = extractSiteFaqs(INDEX_HTML);

// Twee vragen die daadwerkelijk in de homepage-HTML staan (niet de volledige FAQ).
const HOME_VISIBLE_FAQ = [
    ['Wat kost een arbeidsdeskundig onderzoek?', 'Vanaf €1.095,- exclusief btw. Het exacte tarief hangt af van bedrijfsgrootte. Zie de volledige FAQ voor alle tarieven.'],
    ['Kan het onderzoek ook fysiek?', 'Ja. Online is het snelst en standaard inbegrepen, maar een bezoek op locatie is altijd bespreekbaar — bijvoorbeeld als een werkplekonderzoek meerwaarde heeft.'],
];

console.log(`[seo] ${posts.length} kennisbank-artikelen, ${personas.length} doelgroep-pagina's en ${siteFaqs.length} FAQ-vragen geladen`);
const DEFAULT_TITLE = 'arbeidsdeskundig.com — Arbeidsdeskundig onderzoek, online én fysiek';
const DEFAULT_DESC = 'Arbeidsdeskundig onderzoek vanaf €1.095,-. Online of fysiek, door heel Nederland. Specialist in WGA, Ziektewet en Wet Poortwachter.';

app.use(compression());
app.disable('x-powered-by');
// CSP staat uit: de frontend leunt zwaar op inline <script>/style="" (single-file
// opzet), en een niet-grondig-geteste CSP kan de site stuk breken. De overige
// helmet-headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// HSTS, enz.) staan wel aan — dat is winst zonder risico. Wil je later een
// strikte CSP, dan hoort daar eerst een refactor naar externe .js/.css bij.
// CORP staat op cross-origin: dit is een publieke marketingsite. Helmet's
// default `same-origin` laat browsers (en sommige SEO-/fetch-tools) de
// sitemap als geblokkeerde cross-origin resource behandelen — dat wordt
// vaak als HTTP 500 of "couldn't fetch sitemap" gerapporteerd, terwijl
// curl wél 200 ziet.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '200kb' }));

// SEO: forceer één canonieke versie van de site. Zonder dit ziet Google
// arbeidsdeskundig.com én www.arbeidsdeskundig.com als twee aparte URL's met
// identieke content — met een 301 (permanente redirect) wordt overal
// eenduidig de www-versie de "echte" URL, in lijn met BASE_URL hieronder.
//
// BELANGRIJK: /api/-aanroepen slaan we hier bewust over. Een 301 op een POST
// laat de browser het verzoek herhalen als GET, zonder de meegestuurde data —
// daarmee zou elk formulier (offerte, aanmelden, checklist) stuklopen zodra
// iemand de site via het kale domein had geopend. Er is voor API-aanroepen
// ook geen SEO-reden om te redirecten; Google indexeert die toch niet.
app.use((req, res, next) => {
    if (req.hostname === 'arbeidsdeskundig.com' && !req.path.startsWith('/api/')) {
        return res.redirect(301, `https://www.arbeidsdeskundig.com${req.originalUrl}`);
    }
    next();
});

// Statische assets (indien later toegevoegd, bv. /public/afbeeldingen) cachen agressief.
// De hoofd-HTML zelf wordt NIET via express.static geserveerd, want die krijgt
// per route aangepaste <head>-tags — zie renderPage() hieronder.
//
// LET OP: door 'immutable' hieronder cachen browsers deze bestanden tot 30
// dagen zonder ooit opnieuw te controleren. Vervang je een bestaand bestand in
// public/assets/ door een nieuwe versie (bijv. een andere teamfoto), dan blijft
// een browser die de oude versie al eerder heeft opgehaald gewoon de oude
// versie tonen. Voeg in dat geval altijd een cache-bust toe aan de verwijzing,
// bijvoorbeeld `/assets/niels-foto.png?v=2` -> `?v=3` bij de volgende wijziging.
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
    maxAge: '30d',
    immutable: true,
}));

// ---------------------------------------------------------------------------
// Helper: render de basis-HTML met per-pagina title/meta/canonical/JSON-LD en
// een geïnjecteerde __ROUTE__ zodat de client-JS meteen de juiste view toont
// (geen flits van de homepage, en werkend zonder JavaScript-afhankelijke SPA-router).
// ---------------------------------------------------------------------------
function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function activateView(html, view) {
    if (!view || view === 'home') return html;
    html = html.replace('<div class="view active" id="view-home">', '<div class="view" id="view-home">');
    const viewId = 'view-' + view;
    html = html.replace(`<div class="view" id="${viewId}">`, `<div class="view active" id="${viewId}">`);
    if (view === 'offerte' || view === 'aanmelden') {
        html = html.replace('<body>', `<body class="conv-page conv-${view}">`);
    }
    return html;
}

function hydrateArtikelView(html, post, body) {
    if (!post) return html;
    html = html.replace(
        'id="artikel-tag" onclick="filterKennisbankVanArtikel()">Ziektewet</button>',
        `id="artikel-tag" onclick="filterKennisbankVanArtikel()">${escapeHtml(post.tag)}</button>`
    );
    html = html.replace('id="artikel-titel">Titel</h1>', `id="artikel-titel">${escapeHtml(post.title)}</h1>`);
    html = html.replace('id="artikel-breadcrumb-tag"></span>', `id="artikel-breadcrumb-tag">${escapeHtml(post.tag)}</span>`);
    html = html.replace('id="artikel-breadcrumb-titel"></span>', `id="artikel-breadcrumb-titel">${escapeHtml(post.title)}</span>`);
    const readLabel = post.read ? `Leestijd: ${escapeHtml(post.read)} · Laatst bijgewerkt: 2026` : 'Laatst bijgewerkt: 2026';
    html = html.replace('id="artikel-meta">Leestijd: 6 minuten · Laatst bijgewerkt: 2026</p>', `id="artikel-meta">${readLabel}</p>`);
    html = html.replace('id="artikel-metadesc"></p>', `id="artikel-metadesc">${escapeHtml(post.meta || '')}</p>`);
    if (post.kernpunten && post.kernpunten.length) {
        const items = post.kernpunten.map((k) => `<li>${escapeHtml(k)}</li>`).join('');
        html = html.replace(
            'id="artikel-kernpunten" style="margin:8px 0 0; padding-left:18px; font-size:.87rem; color:var(--muted); line-height:1.6;"></ul>',
            `id="artikel-kernpunten" style="margin:8px 0 0; padding-left:18px; font-size:.87rem; color:var(--muted); line-height:1.6;">${items}</ul>`
        );
    }
    if (body) {
        html = html.replace('id="artikel-body"></div>', `id="artikel-body">${body}</div>`);
    }
    if (post.faq && post.faq.length) {
        const faqHtml = post.faq.map(([q, a]) => (
            `<div class="accordion-item open">` +
            `<button class="accordion-head" onclick="toggleAccordion(this)">${escapeHtml(q)}<span class="accordion-icon">+</span></button>` +
            `<div class="accordion-body" style="max-height:none;"><div class="accordion-body-inner">${escapeHtml(a)}</div></div>` +
            `</div>`
        )).join('');
        html = html.replace('id="artikel-faq-wrap" class="hidden"', 'id="artikel-faq-wrap"');
        html = html.replace('id="artikel-faq-list" style="margin-top:12px;"></div>', `id="artikel-faq-list" style="margin-top:12px;">${faqHtml}</div>`);
    }
    return html;
}

function faqPageJsonLd(pairs) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: (pairs || []).map(([q, a]) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
        })),
    };
}

// FAQPage hoort alleen op pagina's die die vragen ook tonen. Het statische
// @graph-blok in index.html bevatte een site-brede FAQPage — die werd daardoor
// op elke URL herhaald (homepage, offerte, casussen). Die strippen we hier.
function stripSitewideFaqPage(html) {
    return html.replace(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
        (full, json) => {
            try {
                const data = JSON.parse(json);
                if (!Array.isArray(data['@graph'])) return full;
                const next = data['@graph'].filter((n) => n && n['@type'] !== 'FAQPage');
                if (next.length === data['@graph'].length) return full;
                data['@graph'] = next;
                return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
            } catch (e) {
                return full;
            }
        }
    );
}

function hydrateFaqView(html, faqs) {
    if (!faqs || !faqs.length) return html;
    const faqHtml = faqs.map(([q, a]) => (
        `<div class="accordion-item">` +
        `<button class="accordion-head" onclick="toggleAccordion(this)">${escapeHtml(q)}<span class="accordion-icon">+</span></button>` +
        `<div class="accordion-body"><div class="accordion-body-inner">${escapeHtml(a)}</div></div>` +
        `</div>`
    )).join('');
    return html.replace(
        'id="faq-list" style="margin-top:20px;"></div>',
        `id="faq-list" style="margin-top:20px;">${faqHtml}</div>`
    );
}

function renderPage(res, { title, description, canonicalPath, route, articleJsonLd, breadcrumbJsonLd, faqJsonLd, statusCode }) {
    const canonical = BASE_URL + canonicalPath;
    const safeTitle = escapeHtml(title || DEFAULT_TITLE);
    const safeDesc = escapeHtml(description || DEFAULT_DESC);

    let html = INDEX_HTML;
    html = activateView(html, route && route.view);
    if (route && route.view === 'artikel' && route.slug) {
        const post = posts.find((p) => p.slug === route.slug);
        html = hydrateArtikelView(html, post, articleBodies[route.slug]);
    }
    if (route && route.view === 'faq') {
        html = hydrateFaqView(html, siteFaqs);
    }
    html = stripSitewideFaqPage(html);

    // <title>
    html = html.replace(/<title>.*?<\/title>/s, `<title>${safeTitle}</title>`);
    // <meta name="description">
    html = html.replace(
        /<meta name="description" content=".*?">/s,
        `<meta name="description" content="${safeDesc}">`
    );
    // canonical
    html = html.replace(
        /<link rel="canonical" href=".*?">/s,
        `<link rel="canonical" href="${canonical}">`
    );
    // Open Graph + Twitter
    html = html.replace(/<meta property="og:title" content=".*?">/s, `<meta property="og:title" content="${safeTitle}">`);
    html = html.replace(/<meta property="og:description" content=".*?">/s, `<meta property="og:description" content="${safeDesc}">`);
    html = html.replace(/<meta property="og:url" content=".*?">/s, `<meta property="og:url" content="${canonical}">`);
    html = html.replace(/<meta name="twitter:title" content=".*?">/s, `<meta name="twitter:title" content="${safeTitle}">`);
    html = html.replace(/<meta name="twitter:description" content=".*?">/s, `<meta name="twitter:description" content="${safeDesc}">`);

    // Extra per-pagina JSON-LD (Article + BreadcrumbList + FAQPage waar de
    // vragen ook zichtbaar zijn) vóór </head> toevoegen, naast het site-brede
    // JSON-LD-blok (ProfessionalService/Blog). FAQPage staat bewust niet meer
    // in dat site-brede blok — zie stripSitewideFaqPage().
    let extraJsonLd = '';
    if (articleJsonLd) extraJsonLd += `<script type="application/ld+json">${JSON.stringify(articleJsonLd)}</script>\n`;
    if (breadcrumbJsonLd) extraJsonLd += `<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>\n`;
    if (faqJsonLd) extraJsonLd += `<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>\n`;
    if (extraJsonLd) html = html.replace('</head>', extraJsonLd + '</head>');

    // GA4 en Meta Pixel: de ID's worden altijd meegegeven (als de env vars zijn
    // gezet), maar de daadwerkelijke scripts laden pas client-side, en alleen
    // ná expliciete toestemming via de cookiebanner (zie CONSENT_KEY in de HTML).
    // Zonder env vars of zonder toestemming laadt er niets.
    const GA4_ID = process.env.GA4_MEASUREMENT_ID || '';
    const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
    const analyticsIdsScript = `<script>window.__ANALYTICS_IDS__ = ${JSON.stringify({ ga4: GA4_ID, metaPixel: META_PIXEL_ID })};</script>\n`;
    html = html.replace('</head>', analyticsIdsScript + '</head>');

    // __ROUTE__ injecteren zodat de client meteen de juiste view rendert.
    const routeScript = `<script>window.__ROUTE__ = ${JSON.stringify(route)};</script>\n`;
    html = html.replace('<script>', routeScript + '<script>');

    res.status(statusCode || 200).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

function breadcrumbFor(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.name,
            item: BASE_URL + it.path,
        })),
    };
}

function xmlEscape(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[c]));
}

function absoluteUrl(pathname) {
    if (!pathname || pathname === '/') return BASE_URL + '/';
    return BASE_URL + (pathname.startsWith('/') ? pathname : '/' + pathname);
}

function sitemapUrlEl(loc, { changefreq = 'weekly', priority = '0.7' } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    return `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

function buildSitemapXml() {
    const staticPaths = [
        '/', '/rekentool', '/keuzehulp', '/veelgestelde-vragen',
        '/over-ons', '/offerte-aanvragen', '/aanmelden', '/kennisbank',
    ];
    const personaList = Array.isArray(personas) ? personas : [];
    const postList = Array.isArray(posts) ? posts : [];
    const urls = [
        ...staticPaths.map((p) => sitemapUrlEl(absoluteUrl(p), {
            changefreq: 'weekly',
            priority: p === '/' ? '1.0' : '0.7',
        })),
        ...personaList
            .filter((p) => p && p.slug)
            .map((p) => sitemapUrlEl(absoluteUrl('/voor/' + p.slug), {
                changefreq: 'monthly',
                priority: '0.7',
            })),
        ...postList
            .filter((p) => p && p.slug)
            .map((p) => sitemapUrlEl(absoluteUrl('/kennisbank/' + p.slug), {
                changefreq: 'monthly',
                priority: '0.6',
            })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

// ---------------------------------------------------------------------------
// Routes — één per "view" in de bestaande frontend
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
    renderPage(res, {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        canonicalPath: '/',
        route: { view: 'home' },
        faqJsonLd: faqPageJsonLd(HOME_VISIBLE_FAQ),
    });
});

app.get('/rekentool', (req, res) => {
    renderPage(res, {
        title: 'Rekentool: bereken je tijdwinst — arbeidsdeskundig.com',
        description: 'Bereken hoeveel tijd en geld eerder starten met een arbeidsdeskundig onderzoek oplevert in jouw situatie.',
        canonicalPath: '/rekentool',
        route: { view: 'calculator' },
    });
});

app.get('/keuzehulp', (req, res) => {
    renderPage(res, {
        title: 'Gratis keuzehulp: online of fysiek onderzoek? — arbeidsdeskundig.com',
        description: 'Beantwoord twee korte vragen en ontdek of een online of fysiek arbeidsdeskundig onderzoek het beste bij jouw situatie past.',
        canonicalPath: '/keuzehulp',
        route: { view: 'advies' },
    });
});

app.get('/veelgestelde-vragen', (req, res) => {
    renderPage(res, {
        title: 'Veelgestelde vragen over arbeidsdeskundig onderzoek — arbeidsdeskundig.com',
        description: 'Antwoord op de meest gestelde vragen over arbeidsdeskundig onderzoek: kosten, doorlooptijd, WGA, Ziektewet en meer.',
        canonicalPath: '/veelgestelde-vragen',
        route: { view: 'faq' },
        faqJsonLd: siteFaqs.length ? faqPageJsonLd(siteFaqs) : null,
        breadcrumbJsonLd: breadcrumbFor([{ name: 'Home', path: '/' }, { name: 'Veelgestelde vragen', path: '/veelgestelde-vragen' }]),
    });
});

app.get('/over-ons', (req, res) => {
    renderPage(res, {
        title: 'Over ons — Matchvermogen B.V. / arbeidsdeskundig.com',
        description: 'Onderdeel van Matchvermogen B.V.: ruim 20 geregistreerde arbeidsdeskundigen en 40 re-integratiecoaches, actief door heel Nederland.',
        canonicalPath: '/over-ons',
        route: { view: 'over' },
    });
});

app.get('/offerte-aanvragen', (req, res) => {
    renderPage(res, {
        title: 'Offerte aanvragen — arbeidsdeskundig.com',
        description: 'Vraag vrijblijvend een offerte aan. Vanaf €1.095,-, reactie binnen 24 uur, 4,9/5. Of plan eerst 15 minuten kennismaking.',
        canonicalPath: '/offerte-aanvragen',
        route: { view: 'offerte' },
    });
});

app.get('/aanmelden', (req, res) => {
    renderPage(res, {
        title: 'Aanmelden voor een arbeidsdeskundig onderzoek — arbeidsdeskundig.com',
        description: 'Meld je aan voor een arbeidsdeskundig onderzoek. Vanaf €1.095,-, binnen 24 uur opgepakt. Of plan eerst 15 minuten kennismaking.',
        canonicalPath: '/aanmelden',
        route: { view: 'aanmelden' },
    });
});

app.get('/kennisbank', (req, res) => {
    renderPage(res, {
        title: 'Kennisbank arbeidsdeskundig onderzoek — arbeidsdeskundig.com',
        description: 'Alles over arbeidsdeskundig onderzoek: de Wet Poortwachter, WGA, Ziektewet, WIA, WHK-premie en praktijkcasussen.',
        canonicalPath: '/kennisbank',
        route: { view: 'kennisbank' },
        breadcrumbJsonLd: breadcrumbFor([{ name: 'Home', path: '/' }, { name: 'Kennisbank', path: '/kennisbank' }]),
    });
});

app.get('/voor/:slug', (req, res, next) => {
    const persona = personas.find((p) => p.slug === req.params.slug);
    if (!persona) return next(); // -> 404 handler

    renderPage(res, {
        title: persona.title + ' — arbeidsdeskundig.com',
        description: persona.meta,
        canonicalPath: '/voor/' + persona.slug,
        route: { view: 'persona', slug: persona.slug },
        breadcrumbJsonLd: breadcrumbFor([
            { name: 'Home', path: '/' },
            { name: persona.label, path: '/voor/' + persona.slug },
        ]),
    });
});

app.get('/kennisbank/:slug', (req, res, next) => {
    const alias = KENNISBANK_SLUG_REDIRECTS[req.params.slug];
    if (alias) return res.redirect(301, '/kennisbank/' + alias);

    const post = posts.find((p) => p.slug === req.params.slug);
    if (!post) return next(); // -> 404 handler

    const articleJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.meta,
        articleSection: post.tag,
        keywords: post.tag + ', arbeidsdeskundig onderzoek, Wet Poortwachter',
        inLanguage: 'nl-NL',
        author: { '@type': 'Organization', name: 'Matchvermogen B.V.' },
        publisher: { '@type': 'Organization', name: 'arbeidsdeskundig.com' },
        mainEntityOfPage: BASE_URL + '/kennisbank/' + post.slug,
    };

    // Alleen artikelen die zelf FAQ-items tonen krijgen FAQPage-schema — niet
    // de site-brede FAQ, zodat we geen identieke FAQ-blokken overal herhalen.
    const faqJsonLd = (post.faq && post.faq.length) ? faqPageJsonLd(post.faq) : null;

    renderPage(res, {
        title: post.title + ' — arbeidsdeskundig.com',
        description: post.meta,
        canonicalPath: '/kennisbank/' + post.slug,
        route: { view: 'artikel', slug: post.slug },
        articleJsonLd,
        faqJsonLd,
        breadcrumbJsonLd: breadcrumbFor([
            { name: 'Home', path: '/' },
            { name: 'Kennisbank', path: '/kennisbank' },
            { name: post.title, path: '/kennisbank/' + post.slug },
        ]),
    });
});

// ---------------------------------------------------------------------------
// sitemap.xml — dynamisch, inclusief alle kennisbank-artikelen.
// Mag nooit 500 teruggeven: ontbrekende posts/personas → weglaten, niet crashen.
// ---------------------------------------------------------------------------
function sendSitemap(res, xml) {
    res.status(200)
        .set({
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
        })
        .send(xml);
}

app.get('/sitemap.xml', (req, res) => {
    try {
        sendSitemap(res, buildSitemapXml());
    } catch (err) {
        console.error('[sitemap] generatie mislukt, stuur minimale fallback:', err);
        const fallback = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrlEl(absoluteUrl('/'), { changefreq: 'weekly', priority: '1.0' })}\n</urlset>`;
        sendSitemap(res, fallback);
    }
});

// ---------------------------------------------------------------------------
// robots.txt — staat crawlers én de bekende AI-/LLM-crawlers expliciet toe
// ---------------------------------------------------------------------------
app.get('/robots.txt', (req, res) => {
    const txt = `User-agent: *
Allow: /

# AI- / LLM-crawlers expliciet toegestaan — relevant voor vindbaarheid in
# ChatGPT, Perplexity, Claude en vergelijkbare answer engines.
# Samenvatting voor die crawlers: ${BASE_URL}/llms.txt
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
    res.set({
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
    }).send(txt);
});

// ---------------------------------------------------------------------------
// llms.txt — opkomende conventie (vergelijkbaar met robots.txt) waarmee AI-/
// LLM-crawlers en answer engines in één oogopslag zien waar de site over gaat
// en welke content er is. Nog geen officiële standaard, maar kost weinig en
// kan alleen helpen bij vindbaarheid in ChatGPT/Perplexity/Claude e.d.
// ---------------------------------------------------------------------------
const LLMS_FEATURED_SLUGS = [
    'arbeidsdeskundig-onderzoek-gids',
    'wat-doet-arbeidsdeskundige',
    'kosten-arbeidsdeskundig-onderzoek',
    'verplicht-arbeidsdeskundig-onderzoek',
    'arbeidsdeskundig-onderzoek-na-1-jaar-ziekte',
    'second-opinion-arbeidsdeskundige',
    'nadelen-arbeidsdeskundig-onderzoek',
    'tips-werknemer-arbeidsdeskundig-onderzoek',
    'fml-izp-lezen-belastbaarheid',
    'riv-toets-bedrijfsarts-leidend',
    'beslistermijn-wia-16-weken',
    'poortwachter-tijdlijn',
    'online-fysiek',
];

function buildLlmsTxt() {
    const featured = LLMS_FEATURED_SLUGS
        .map((slug) => posts.find((p) => p.slug === slug))
        .filter(Boolean)
        .map((p) => `- [${p.title}](${BASE_URL}/kennisbank/${p.slug}): ${p.meta}`)
        .join('\n');

    return `# arbeidsdeskundig.com

> Arbeidsdeskundig onderzoek vanaf €1.095,- excl. btw. Online of fysiek, door heel Nederland. Binnen 24 uur opgepakt. UWV-proof, door geregistreerde arbeidsdeskundigen.

arbeidsdeskundig.com is het aanvraag- en kennisplatform voor arbeidsdeskundig onderzoek: een objectieve beoordeling van wat een werknemer nog kan werken, in het kader van de Wet Poortwachter, WGA, Ziektewet en WIA. 1.500+ onderzoeken, gemiddeld 4,9/5 op Google.

## Wat we wel doen

- Arbeidsdeskundig onderzoek: past eigen werk nog (spoor 1a), is ander werk intern mogelijk (spoor 1b), of is spoor 2 nodig?
- Vertalen van FML/IZP (belastbaarheid van de bedrijfsarts) naar concrete arbeidsmogelijkheden
- UWV-proof rapport voor re-integratieverslag, WGA, Ziektewet en WIA-voorbereiding
- Online (standaard) of fysiek op locatie, landelijk
- Warme overdracht naar spoor 2 via Best Match Re-integratie als dat volgt uit het onderzoek

## Wat we niet doen

- Geen medische diagnose, geen behandeling, geen FML (dat is de bedrijfsarts / verzekeringsarts)
- Geen casemanagement of Poortwachter-procesbewaking
- Geen UWV-uitkeringsbeslissing (WIA/WGA/IVA)
- Geen ontslagadvies
- Geen concurrent van matchvermogen.nl — zie hieronder

## Prijzen (2026, excl. btw)

- Vanaf €1.095,- voor een online onderzoek (tot 5 medewerkers, kleine stichtingen of vrijwilligersorganisaties)
- Tot 100 medewerkers: €1.125,-
- Groot zakelijk: €1.395,-
- Fysiek onderzoek: +€295,-; spoedonderzoek: +€300,-
- Exact tarief volgt uit de offerte; het tarief hangt af van bedrijfsgrootte, niet van dossiercomplexiteit

## Reactietijd

Reactie op offerte en aanmelding binnen 24 uur. Geen wekenlange wachtlijst.

## Verhouding tot matchvermogen.nl

Complementair, geen concurrentie. [matchvermogen.nl](https://matchvermogen.nl) is het moederbedrijf (Matchvermogen B.V., sinds 2019): breder adviesmerk voor arbeidsdeskundig onderzoek, WHK-advies en re-integratie. arbeidsdeskundig.com is het gespecialiseerde loket om een onderzoek te begrijpen, te vergelijken en aan te vragen (offerte, aanmelden, kennisbank). Spoor 2 en 3 lopen via [Best Match Re-integratie](https://bestmatchbv.nl). WHK-premie via [werkhervattingskas.nl](https://werkhervattingskas.nl).

## Belangrijkste pagina's

- [Home](${BASE_URL}/): diensten, tarieven vanaf €1.095,-, werkwijze
- [Offerte aanvragen](${BASE_URL}/offerte-aanvragen): vrijblijvende offerte, reactie binnen 24 uur
- [Aanmelden](${BASE_URL}/aanmelden): onderzoek starten, binnen 24 uur opgepakt
- [Kennisbank](${BASE_URL}/kennisbank): hub — alle artikelen per onderwerp
- [Veelgestelde vragen](${BASE_URL}/veelgestelde-vragen): hub — tarieven en praktijkvragen
- [Over ons](${BASE_URL}/over-ons): Matchvermogen B.V., team en werkwijze

## Hulpmiddelen

- [Rekentool](${BASE_URL}/rekentool): tijdwinst en besparing van vroeg starten
- [Gratis keuzehulp](${BASE_URL}/keuzehulp): online of fysiek onderzoek?

## Unieke kennisbank-artikelen

${featured}

De volledige index staat op ${BASE_URL}/kennisbank en in ${BASE_URL}/sitemap.xml — niet hier herhaald, om dunne duplicaten te voorkomen.
`;
}

function sendLlmsTxt(req, res) {
    try {
        res.set({
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
        }).send(buildLlmsTxt());
    } catch (err) {
        console.error('[llms.txt] generatie mislukt:', err);
        res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send(`# arbeidsdeskundig.com\n\n${BASE_URL}/\n`);
    }
}

app.get('/llms.txt', sendLlmsTxt);
app.get('/.well-known/llms.txt', sendLlmsTxt);

// Health check (handig voor Railway se deploy-status)
// ---------------------------------------------------------------------------
// E-mail via Resend — klaar voor gebruik, maar inactief zolang RESEND_API_KEY
// niet is gezet in Railway (Settings -> Variables). Zonder die key wordt de
// e-mail alleen gelogd in de server-console; er gaat dan niets verloren, maar
// er wordt ook niets verstuurd. Zodra je de key toevoegt, werkt dit direct.
//
// Benodigde env vars, later in te stellen:
//   RESEND_API_KEY     - API key uit resend.com
//   RESEND_FROM_EMAIL   - bijv. "arbeidsdeskundig.com <noreply@arbeidsdeskundig.com>"
//                          (het afzenderdomein moet geverifieerd zijn bij Resend)
// ---------------------------------------------------------------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'arbeidsdeskundig.com <noreply@arbeidsdeskundig.com>';
const NOTIFY_EMAIL = 'info@matchvermogen.nl';

async function sendEmail({ to, subject, html, replyTo, attachments }) {
    if (!RESEND_API_KEY) {
        console.log(`[Resend niet geconfigureerd] Zou e-mail sturen naar ${to}: "${subject}"${attachments ? ` (met ${attachments.length} bijlage(n))` : ''}`);
        return { skipped: true };
    }
    try {
        const body = { from: RESEND_FROM_EMAIL, to: [to], subject, html };
        if (replyTo) body.reply_to = replyTo;
        if (attachments && attachments.length) body.attachments = attachments;
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!r.ok) console.error('Resend-fout:', r.status, await r.text());
        return r;
    } catch (err) {
        console.error('Resend-verzoek mislukt:', err);
        return { error: true };
    }
}

// Zet een { veldnaam: waarde }-object om in een nette HTML-lijst voor in de e-mail.
function fieldsToHtml(fields) {
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0; color:#666; vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(v === true ? 'Ja' : String(v))}</td></tr>`)
        .join('');
}

function rejectLead(res, result) {
    return res.status(400).json({
        ok: false,
        error: (result.errors && result.errors[0]) || 'Controleer je gegevens en probeer opnieuw.',
        details: result.errors || [],
    });
}

function ignoreHoneypot(res, fields, label) {
    if (!isHoneypotTriggered(fields)) return false;
    console.log(`[${label}] honeypot gevuld — geen e-mail verstuurd`);
    res.json({ ok: true });
    return true;
}

function offerteMailFields(lead) {
    const bronLabel = lead.bron === 'offerte-pdf'
        ? 'PDF-offerte'
        : (lead.bron === 'offerte-contact' ? 'Contactverzoek' : 'Offerte');
    return {
        Aanvraag: bronLabel,
        Dienst: lead.dienst || 'Arbeidsdeskundig onderzoek',
        Naam: lead.naam,
        Bedrijf: lead.bedrijf,
        'E-mail': lead.email,
        Telefoon: lead.telefoon,
        Bedrijfsgrootte: OFFERTE_GROOTTE_LABELS[lead.grootte] || lead.grootte,
        Onderzoeksvorm: lead.vorm,
        Omschrijving: lead.omschrijving,
    };
}

function leftoverFormFields(raw, skipKeys) {
    const skip = new Set(skipKeys);
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, val] of Object.entries(raw)) {
        if (skip.has(key)) continue;
        if (/(^|-)(website|url|honeypot|_hp)$/i.test(key)) continue;
        if (key.startsWith('of-doc-')) continue;
        if (val === undefined || val === null || val === '') continue;
        out[key] = val;
    }
    return out;
}

// Voorkomt dat dezelfde lead binnen een paar seconden twee keer als
// sales-mail binnenkomt (dubbele klik, bot-retry). Alleen de notificatie
// naar info@ wordt overgeslagen; de HTTP-response blijft 200.
const recentLeadNotifies = new Map();
const LEAD_DEDUPE_MS = 8000;

function shouldSkipDuplicateNotify(kind, lead) {
    const now = Date.now();
    for (const [key, ts] of recentLeadNotifies) {
        if (now - ts > LEAD_DEDUPE_MS) recentLeadNotifies.delete(key);
    }
    const key = leadDedupeKey(kind, lead);
    const prev = recentLeadNotifies.get(key);
    if (prev && now - prev < LEAD_DEDUPE_MS) return true;
    recentLeadNotifies.set(key, now);
    return false;
}

async function deliverSalesLead({ kind, lead, rawFields, notifySubject, notifyHtml, replyTo, visitor }) {
    if (isTestLead(lead, rawFields)) {
        console.log(`[${kind}] testdata — geen sales-notificatie naar info@ (${lead.naam || ''}, ${lead.email || lead.telefoon || ''})`);
        return { ok: true, test: true };
    }
    if (!notifyIsSafe(notifySubject, notifyHtml, lead)) {
        // Productiemail 16 sep: subject "... — onbekend" + lege <table></table>.
        console.error(`[${kind}] geblokkeerd: onveilige notificatie (lege tabel, onbekend of ontbrekende contactgegevens)`);
        return { ok: false, blocked: true };
    }
    if (shouldSkipDuplicateNotify(kind, lead)) {
        console.log(`[${kind}] dubbele inzending binnen ${LEAD_DEDUPE_MS / 1000}s — tweede mail naar info@ overgeslagen`);
        return { ok: true, duplicate: true };
    }
    await sendEmail({
        to: NOTIFY_EMAIL,
        subject: notifySubject,
        html: notifyHtml,
        replyTo,
    });
    if (visitor && visitor.to) {
        await sendEmail(visitor);
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Formulier-endpoints: offerte, aanmelding, gratis checklist.
// Sturen (zodra geconfigureerd) altijd twee e-mails: een notificatie naar
// info@arbeidsdeskundig.com, en — als er een e-mailadres is ingevuld — een
// automatische bevestiging aan de aanvrager zelf.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Vrijblijvende offerte als PDF — een bewust ánder, lichter traject dan
// "direct aanmelden" (dat blijft de volledige 6-stappen-wizard met
// ondertekening). Hier: gegevens in, meteen een PDF-offerte terug (download +
// e-mail), zonder enige verplichting.
// ---------------------------------------------------------------------------
const PDFDocument = require('pdfkit');

const OFFERTE_GROOTTE_LABELS = {
    klein: 'Tot 5 medewerkers / stichting',
    midden: 'Tot 100 medewerkers',
    groot: 'Groot zakelijk',
};
const OFFERTE_PRICE_TIERS = { klein: 1095, midden: 1125, groot: 1395 };

function berekenOffertePrijs(grootte, vorm) {
    const basis = OFFERTE_PRICE_TIERS[grootte] || OFFERTE_PRICE_TIERS.midden;
    const fysiekToeslag = vorm === 'Fysiek' ? 295 : 0;
    return { basis, fysiekToeslag, totaal: basis + fysiekToeslag };
}

function euro(bedrag) {
    return '€ ' + bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Oplopend offertenummer, per jaar (OFF-2026-0001, OFF-2026-0002, ...).
// Wordt bijgehouden in een JSON-bestand op schijf, zodat het nummer blijft
// doortellen tussen aanvragen door (in plaats van bijvoorbeeld een timestamp,
// die geen logische volgorde heeft).
//
// LET OP — Railway-specifiek: het bestandssysteem van een Railway-service is
// standaard *ephemeral*: het overleeft een herstart van de container, maar
// NIET een nieuwe deploy. Zonder een Railway Volume gekoppeld aan dit pad,
// begint de teller na elke deploy dus weer bij 1. Voor een garantie dat het
// nummer nooit meer terugspringt, koppel je in Railway een Volume aan
// bijvoorbeeld `/data` en verwijs je COUNTER_FILE daarnaartoe (regel hieronder).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Offertenummer, per bedrijf (OFF-2026-0001-TestbedrijfBV). Het nummer telt op
// per bedrijf, niet globaal over alle klanten heen — dat is bewust: bij het
// huidige, ephemere bestandssysteem van Railway (overleeft een herstart, niet
// een nieuwe deploy) zou een globale teller na elke deploy weer bij 1 beginnen
// en zo de indruk wekken dat het steeds "onze allereerste offerte" is. Per
// bedrijf klopt "0001" bij een nieuwe klant echter altijd, deploy of niet — en
// vraagt hetzelfde bedrijf later nogmaals een offerte aan, dan telt het net zo
// netjes door (0002, 0003, ...), ook bij een andere contactpersoon.
// Zonder ingevulde bedrijfsnaam (bijv. een zzp'er) valt dit terug op de naam
// van de aanvrager, en anders op het e-mailadres.
// ---------------------------------------------------------------------------
const COUNTER_FILE = path.join(__dirname, 'data', 'offerte-counter.json');

function saniteerVoorNummer(tekst) {
    return (tekst || 'Klant')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // diakritische tekens eraf (é -> e)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 24) || 'Klant';
}

function volgendOfferteNummer(klantBedrijf, klantNaam, klantEmail) {
    const jaar = new Date().getFullYear();
    // Sleutel voor de telling: bedrijfsnaam als die er is, anders naam, anders e-mail.
    const sleutelBron = (klantBedrijf || klantNaam || klantEmail || 'klant').trim().toLowerCase();
    const sleutel = sleutelBron.replace(/[^a-z0-9]/g, '');
    // Weergave in het nummer zelf: dezelfde voorkeursvolgorde.
    const weergaveNaam = klantBedrijf || klantNaam || 'Klant';

    let staat = {};
    try {
        staat = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    } catch (e) {
        // Bestand bestaat nog niet (eerste keer) of is onleesbaar — begin leeg.
    }
    const huidig = staat[sleutel] && staat[sleutel].jaar === jaar ? staat[sleutel] : { jaar, laatsteNummer: 0 };
    huidig.laatsteNummer += 1;
    staat[sleutel] = huidig;
    try {
        fs.mkdirSync(path.dirname(COUNTER_FILE), { recursive: true });
        fs.writeFileSync(COUNTER_FILE, JSON.stringify(staat));
    } catch (e) {
        console.error('Kon offerte-teller niet wegschrijven:', e.message);
    }
    return 'OFF-' + jaar + '-' + String(huidig.laatsteNummer).padStart(4, '0') + '-' + saniteerVoorNummer(weergaveNaam);
}

function genereerOffertePdf(fields) {
    const naam = fields.naam || '';
    const bedrijf = fields.bedrijf || '';
    const email = fields.email || '';
    const telefoon = fields.telefoon || '';
    const grootte = fields.grootte || 'midden';
    const vorm = fields.vorm || 'Online';
    const omschrijving = fields.omschrijving || '';
    const { basis, fysiekToeslag, totaal } = berekenOffertePrijs(grootte, vorm);
    const vandaag = new Date();
    const geldigTot = new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000);
    const offerteNummer = volgendOfferteNummer(bedrijf, naam, email);
    const fmtDatum = (d) => d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 56 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const ink = '#12203A';
        const amber = '#D8A03D';
        const teal = '#1F6F5C';
        const muted = '#555555';

        if (MATCHVERMOGEN_LOGO) {
            const logoWidth = 160;
            const logoHeight = logoWidth / MATCHVERMOGEN_LOGO_RATIO;
            doc.image(MATCHVERMOGEN_LOGO, 56, 40, { width: logoWidth, height: logoHeight });
            doc.fillColor(ink).fontSize(15).font('Helvetica-Bold').text('Vrijblijvende offerte', 56, 40 + logoHeight + 14);
            doc.fillColor(muted).fontSize(9).font('Helvetica').text('Arbeidsdeskundig onderzoek — mede mogelijk gemaakt door arbeidsdeskundig.com', 56, 40 + logoHeight + 34);
        } else {
            // Terugvalvariant zolang er geen logo-bestand aanwezig is
            doc.fillColor(ink).fontSize(20).font('Helvetica-Bold').text('Matchvermogen B.V.', 56, 40);
            doc.fillColor(muted).fontSize(10).font('Helvetica').text('Vrijblijvende offerte — arbeidsdeskundig onderzoek, mede mogelijk gemaakt door arbeidsdeskundig.com', 56, 66);
        }

        doc.moveTo(56, 128).lineTo(doc.page.width - 56, 128).strokeColor(teal).lineWidth(2).stroke();
        doc.lineWidth(1);

        doc.fillColor(muted).fontSize(9).font('Helvetica')
            .text(`Offertenummer: ${offerteNummer}`, 56, 148)
            .text(`Datum: ${fmtDatum(vandaag)}`, 56, 162)
            .text(`Geldig tot: ${fmtDatum(geldigTot)}`, 56, 176)
            .text('Opgesteld door: Matchvermogen B.V.', 56, 190);

        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Aanvrager', 56, 220);
        doc.fillColor(muted).fontSize(10).font('Helvetica')
            .text(naam || '—', 56, 236)
            .text(bedrijf || '—', 56, 250)
            .text(email || '—', 56, 264)
            .text(telefoon || '—', 56, 278);

        let y = 312;
        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Onderzoek', 56, y);
        y += 20;
        const rows = [
            ['Dienst', 'Arbeidsdeskundig onderzoek'],
            ['Vorm', vorm === 'Fysiek' ? 'Fysiek, op locatie' : (vorm === 'Online' ? 'Online' : 'Nog te bepalen')],
            ['Bedrijfsgrootte', OFFERTE_GROOTTE_LABELS[grootte] || OFFERTE_GROOTTE_LABELS.midden],
        ];
        rows.forEach(([k, v]) => {
            doc.fillColor(muted).fontSize(9.5).font('Helvetica').text(k, 56, y, { width: 150 });
            doc.fillColor(ink).fontSize(9.5).font('Helvetica-Bold').text(v, 210, y, { width: 320 });
            y += 18;
        });
        if (omschrijving) {
            y += 4;
            doc.fillColor(muted).fontSize(9.5).font('Helvetica').text('Omschrijving', 56, y, { width: 150 });
            doc.fillColor(ink).fontSize(9.5).font('Helvetica').text(omschrijving, 210, y, { width: 320 });
            y += Math.max(18, doc.heightOfString(omschrijving, { width: 320 }) + 6);
        }

        y += 20;
        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#C7CCC4').stroke();
        y += 20;

        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Investering (excl. btw)', 56, y);
        y += 20;
        doc.fillColor(muted).fontSize(9.5).font('Helvetica').text('Arbeidsdeskundig onderzoek', 56, y);
        doc.fillColor(ink).fontSize(9.5).font('Helvetica').text(euro(basis), 400, y, { width: 130, align: 'right' });
        y += 18;
        if (fysiekToeslag) {
            doc.fillColor(muted).fontSize(9.5).font('Helvetica').text('Toeslag fysiek onderzoek', 56, y);
            doc.fillColor(ink).fontSize(9.5).font('Helvetica').text(euro(fysiekToeslag), 400, y, { width: 130, align: 'right' });
            y += 18;
        }
        y += 6;
        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#C7CCC4').stroke();
        y += 12;
        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Totaal (excl. btw)', 56, y);
        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text(euro(totaal), 400, y, { width: 130, align: 'right' });

        y += 50;
        if (PERSONAL_PHOTO) {
            const photoSize = 54;
            doc.save();
            doc.circle(56 + photoSize / 2, y + photoSize / 2, photoSize / 2).clip();
            doc.image(PERSONAL_PHOTO, 56, y, { width: photoSize, height: photoSize });
            doc.restore();
            doc.fillColor(ink).fontSize(9.5).font('Helvetica-Bold').text('Bedankt voor het aanvragen van deze offerte!', 56 + photoSize + 16, y + 4, { width: doc.page.width - 112 - photoSize - 16 });
            doc.fillColor(muted).fontSize(9).font('Helvetica').text('We gaan snel en graag voor je aan de slag.', 56 + photoSize + 16, y + 20, { width: doc.page.width - 112 - photoSize - 16 });
            y += photoSize + 24;
        }

        const disclaimerTekst = 'Deze offerte is geheel vrijblijvend en verplicht tot niets. Reactie op eventuele vervolgvragen meestal binnen 24 uur. ' +
            'Prijzen zijn exclusief btw. Aan deze offerte kunnen geen rechten worden ontleend na de vermelde geldigheidsdatum.';
        doc.fillColor(muted).fontSize(8.5).font('Helvetica').text(disclaimerTekst, 56, y, { width: doc.page.width - 112, lineBreak: true });
        y += doc.heightOfString(disclaimerTekst, { width: doc.page.width - 112 }) + 40;

        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#C7CCC4').stroke();
        y += 10;
        doc.fillColor(muted).fontSize(8).font('Helvetica').text(
            'Matchvermogen B.V. · Losplaats 16d, 5404 NJ Uden · 085 087 0307 · info@arbeidsdeskundig.com · KVK 85849618',
            56, y, { width: doc.page.width - 112, align: 'center' },
        );

        doc.end();
    });
}

app.post('/api/offerte-pdf', async (req, res) => {
    console.log('[offerte-pdf] verzoek ontvangen');
    const fields = req.body || {};
    if (ignoreHoneypot(res, fields, 'offerte-pdf')) return;
    const parsed = validateOfferteLead(fields);
    if (!parsed.ok) {
        console.log('[offerte-pdf] verplichte velden ontbreken, 400');
        return rejectLead(res, parsed);
    }
    const lead = parsed.lead;

    try {
        console.log('[offerte-pdf] PDF genereren...');
        const pdfBuffer = await genereerOffertePdf({
            naam: lead.naam,
            bedrijf: lead.bedrijf,
            email: lead.email,
            telefoon: lead.telefoon,
            grootte: lead.grootte || 'midden',
            vorm: lead.vorm || 'Online',
            omschrijving: lead.omschrijving,
        });
        console.log('[offerte-pdf] PDF klaar,', pdfBuffer.length, 'bytes');
        const pdfBase64 = pdfBuffer.toString('base64');
        const voornaam = lead.naam.split(' ')[0] || 'daar';
        const attachments = [{ filename: 'offerte-arbeidsdeskundig-onderzoek.pdf', content: pdfBase64 }];

        // De PDF gaat rechtstreeks als bestand terug (geen JSON/base64-omweg meer).
        // Dat scheelt ~33% aan bytes, en sluit uit dat een onderweg afgekapte
        // respons ooit nog als "unexpected end of JSON input" kan verschijnen —
        // er wordt voor de PDF zelf nergens meer JSON geparsed.
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="offerte-arbeidsdeskundig-onderzoek.pdf"');
        res.setHeader('X-Voornaam', encodeURIComponent(voornaam));
        res.setHeader('Access-Control-Expose-Headers', 'X-Voornaam');
        res.send(pdfBuffer);
        console.log('[offerte-pdf] PDF-bestand verstuurd naar browser');

        sendEmail({
            to: lead.email,
            subject: 'Je vrijblijvende offerte — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(voornaam)} — hierbij je vrijblijvende offerte als PDF. Geen verplichtingen: neem gerust de tijd, en stel vooral vragen als iets niet duidelijk is.</p>`,
            attachments,
        }).then(() => console.log('[offerte-pdf] e-mail naar aanvrager verstuurd')).catch((err) => console.error('[offerte-pdf] e-mail naar aanvrager mislukt:', err));

        if (!isTestLead(lead, fields) && !shouldSkipDuplicateNotify('offerte-pdf', lead)) {
            sendEmail({
                to: NOTIFY_EMAIL,
                subject: `Nieuwe PDF-offerte gegenereerd — ${lead.naam}`,
                html: `<h2>Vrijblijvende offerte gegenereerd via arbeidsdeskundig.com</h2><table>${fieldsToHtml(offerteMailFields({ ...lead, bron: lead.bron || 'offerte-pdf' }))}</table>`,
                replyTo: lead.email,
                attachments,
            }).then(() => console.log('[offerte-pdf] notificatiemail verstuurd')).catch((err) => console.error('[offerte-pdf] notificatiemail mislukt:', err));
        } else {
            console.log('[offerte-pdf] testdata of duplicaat — geen sales-notificatie');
        }
    } catch (err) {
        console.error('[offerte-pdf] FOUT tijdens verwerking:', err);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: 'Er ging iets mis bij het genereren van de offerte: ' + (err && err.message ? err.message : 'onbekende fout') });
        }
    }
});

app.post('/api/offerte', async (req, res) => {
    const fields = req.body || {};
    if (ignoreHoneypot(res, fields, 'offerte')) return;
    const parsed = validateOfferteLead(fields);
    if (!parsed.ok) {
        console.log('[offerte] afgewezen:', parsed.errors.join('; '));
        return rejectLead(res, parsed);
    }
    const lead = parsed.lead;
    const voornaam = lead.naam.split(' ')[0] || 'daar';
    const delivered = await deliverSalesLead({
        kind: 'offerte',
        lead,
        rawFields: fields,
        notifySubject: `Nieuwe offerteaanvraag — ${lead.naam}`,
        notifyHtml: `<h2>Nieuwe offerteaanvraag via arbeidsdeskundig.com</h2><table>${fieldsToHtml(offerteMailFields(lead))}</table>`,
        replyTo: lead.email,
        visitor: {
            to: lead.email,
            subject: 'Bedankt voor je offerteaanvraag — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(voornaam)} — we hebben je offerteaanvraag ontvangen en nemen binnen 24 uur contact met je op.</p>`,
        },
    });
    if (delivered.blocked) {
        return res.status(500).json({ ok: false, error: 'De aanvraag is ontvangen maar kon niet veilig worden doorgestuurd. Probeer het opnieuw of bel ons.' });
    }
    res.json({ ok: true, test: !!delivered.test });
});

app.post('/api/aanmelden', async (req, res) => {
    const fields = req.body || {};
    if (ignoreHoneypot(res, fields, 'aanmelden')) return;
    const parsed = validateAanmeldLead(fields);
    if (!parsed.ok) {
        console.log('[aanmelden] afgewezen:', parsed.errors.join('; '));
        return rejectLead(res, parsed);
    }
    const lead = parsed.lead;
    const voornaam = lead.naam.split(' ')[0] || 'daar';
    const notifyFields = {
        Aanvraag: 'Aanmelding',
        'Type dienstverlening': lead.dienst,
        Wet: lead.wet,
        Onderzoeksvorm: lead.vorm,
        Bedrijfsgrootte: OFFERTE_GROOTTE_LABELS[lead.grootte] || lead.grootte,
        'Naam aanvrager': lead.naam,
        'E-mail aanvrager': lead.email,
        'Telefoon aanvrager': lead.telefoon,
        'Spoor 2 aangevraagd': lead.spoor2 ? 'Ja' : 'Nee',
        ...leftoverFormFields(fields, [
            'dienst', 'wet', 'vorm', 'grootte', 'naam', 'email', 'telefoon', 'spoor2',
            'chk-spoor2', 'inp-aanvrager-naam', 'inp-aanvrager-email', 'inp-aanvrager-tel',
            'bron', 'aanvraagtype',
        ]),
    };

    const delivered = await deliverSalesLead({
        kind: 'aanmelden',
        lead,
        rawFields: fields,
        notifySubject: `Nieuwe aanmelding${lead.spoor2 ? ' (incl. Spoor 2)' : ''} — ${lead.naam}`,
        notifyHtml: `<h2>Nieuwe aanmelding via arbeidsdeskundig.com</h2><table>${fieldsToHtml(notifyFields)}</table>`,
        replyTo: lead.email,
        visitor: {
            to: lead.email,
            subject: 'Bedankt voor je aanmelding — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(voornaam)} — we hebben je aanmelding ontvangen en pakken dit binnen 24 uur op.</p>`,
        },
    });
    if (delivered.blocked) {
        return res.status(500).json({ ok: false, error: 'De aanvraag is ontvangen maar kon niet veilig worden doorgestuurd. Probeer het opnieuw of bel ons.' });
    }
    res.json({ ok: true, test: !!delivered.test });
});

app.post('/api/checklist', async (req, res) => {
    const fields = req.body || {};
    if (ignoreHoneypot(res, fields, 'checklist')) return;
    const parsed = validateChecklistLead(fields);
    if (!parsed.ok) {
        console.log('[checklist] afgewezen:', parsed.errors.join('; '));
        return rejectLead(res, parsed);
    }
    const lead = parsed.lead;

    const delivered = await deliverSalesLead({
        kind: 'checklist',
        lead,
        rawFields: fields,
        notifySubject: `Checklist aangevraagd — ${lead.naam}`,
        notifyHtml: `<h2>Gratis checklist aangevraagd via arbeidsdeskundig.com</h2><table>${fieldsToHtml({ Aanvraag: 'Checklist', Dienst: lead.dienst, Naam: lead.naam, 'E-mail': lead.email })}</table>`,
        replyTo: lead.email,
        visitor: {
            to: lead.email,
            subject: 'Je gratis checklist — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(lead.naam)} — hierbij de checklist waar je om vroeg.</p>`,
        },
    });
    if (delivered.blocked) {
        return res.status(500).json({ ok: false, error: 'De aanvraag is ontvangen maar kon niet veilig worden doorgestuurd. Probeer het opnieuw of bel ons.' });
    }
    res.json({ ok: true, test: !!delivered.test });
});

app.post('/api/bel-me-terug', async (req, res) => {
    const fields = req.body || {};
    if (ignoreHoneypot(res, fields, 'bel-me-terug')) return;
    const parsed = validateBelMeTerugLead(fields);
    if (!parsed.ok) {
        console.log('[bel-me-terug] afgewezen:', parsed.errors.join('; '));
        return rejectLead(res, parsed);
    }
    const lead = parsed.lead;

    console.log('[bel-me-terug] verzoek ontvangen van', lead.naam);
    try {
        await deliverSalesLead({
            kind: 'bel-me-terug',
            lead,
            rawFields: fields,
            notifySubject: `Bel-me-terug verzoek — ${lead.naam}`,
            notifyHtml: `<h2>Iemand wil teruggebeld worden</h2><table>${fieldsToHtml({
                Aanvraag: 'Bel-me-terug',
                Dienst: lead.dienst,
                Naam: lead.naam,
                Telefoonnummer: lead.telefoon,
                'E-mail': lead.email,
                Moment: lead.moment,
            })}</table>`,
        });
    } catch (err) {
        console.error('[bel-me-terug] e-mail mislukt:', err);
        // Validatie is al geslaagd; een falende notificatiemail is voor ons om
        // op te lossen. De bezoeker krijgt hieronder alsnog ok:true.
    }
    res.json({ ok: true });
});

// Google Search Console eigendomsverificatie (HTML-bestandsmethode). De inhoud
// moet exact overeenkomen met wat Google in het te downloaden bestand zet.
app.get('/googlea9befd16dd1488a4.html', (req, res) => {
    res.type('text/plain').send('google-site-verification: googlea9befd16dd1488a4.html');
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

// ---------------------------------------------------------------------------
// 404 — een eigen, simpele pagina (geen hergebruik van de homepage-SPA), zodat
// deze niet als near-duplicate van de homepage wordt gezien en de bezoeker
// meteen ziet dat de gevraagde pagina niet bestaat.
// ---------------------------------------------------------------------------
app.use((req, res) => {
    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagina niet gevonden (404) — arbeidsdeskundig.com</title>
<meta name="robots" content="noindex, follow">
<style>
  body{font-family:Arial,sans-serif; background:#EDEFEA; color:#12203A; margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; padding:24px;}
  .box{max-width:480px;}
  h1{font-size:2.2rem; margin-bottom:8px;}
  p{color:#4A5568; line-height:1.6;}
  a{display:inline-block; margin-top:20px; background:#D8A03D; color:#12203A; padding:12px 22px; border-radius:2px; text-decoration:none; font-weight:600;}
</style>
</head>
<body>
  <div class="box">
    <h1>404 — Pagina niet gevonden</h1>
    <p>De pagina <code>${escapeHtml(req.path)}</code> bestaat niet (meer). Mogelijk is de link verouderd of is er een typefout gemaakt.</p>
    <a href="/">Terug naar de homepage</a>
  </div>
</body>
</html>`;
    res.status(404).set({
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, follow',
    }).send(html);
});

// Vangnet: een throw in een route mag nooit een onduidelijke proxy-500 worden
// zonder logregel. Sitemap heeft zijn eigen try/catch en hoort hier niet te komen.
app.use((err, req, res, next) => {
    console.error('[express] Onverwachte fout op', req.method, req.path, err);
    if (res.headersSent) return next(err);
    if (req.path === '/sitemap.xml') {
        const fallback = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrlEl(absoluteUrl('/'), { changefreq: 'weekly', priority: '1.0' })}\n</urlset>`;
        return sendSitemap(res, fallback);
    }
    res.status(500).type('txt').send('Internal Server Error');
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`arbeidsdeskundig.com draait op poort ${PORT}`);
    });
}

module.exports = { app };
