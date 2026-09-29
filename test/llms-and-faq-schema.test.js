'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

let server;
let base;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

function parseLdJsonBlocks(html) {
    const blocks = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        blocks.push(JSON.parse(m[1]));
    }
    return blocks;
}

function faqPages(html) {
    return parseLdJsonBlocks(html).filter((b) => b['@type'] === 'FAQPage');
}

function graphTypes(html) {
    const types = [];
    for (const block of parseLdJsonBlocks(html)) {
        if (Array.isArray(block['@graph'])) {
            for (const node of block['@graph']) {
                if (node && node['@type']) types.push(node['@type']);
            }
        } else if (block['@type']) {
            types.push(block['@type']);
        }
    }
    return types;
}

describe('llms.txt', () => {
    it('serves a curated machine-readable summary, not a thin article dump', async () => {
        const res = await fetch(base + '/llms.txt');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/plain/);
        const txt = await res.text();

        assert.match(txt, /^# arbeidsdeskundig\.com/m);
        assert.match(txt, /vanaf €1\.095/);
        assert.match(txt, /binnen 24 uur/i);
        assert.match(txt, /## Wat we wel doen/);
        assert.match(txt, /## Wat we niet doen/);
        assert.match(txt, /Geen medische diagnose/);
        assert.match(txt, /## Verhouding tot matchvermogen\.nl/);
        assert.match(txt, /https:\/\/matchvermogen\.nl/);
        assert.match(txt, /Complementair/);

        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/offerte-aanvragen/);
        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/aanmelden/);
        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/kennisbank/);
        assert.match(txt, /https:\/\/www\.arbeidsdeskundig\.com\/veelgestelde-vragen/);
        assert.match(txt, /kennisbank\/arbeidsdeskundig-onderzoek-gids/);
        assert.match(txt, /kennisbank\/wat-doet-arbeidsdeskundige/);
        assert.match(txt, /kennisbank\/arbeidsdeskundig-rapport-voorbeeld/);
        assert.match(txt, /kennisbank\/arbeidsdeskundig-rapport-checklist/);
        assert.match(txt, /kennisbank\/loonsanctie-voorkomen-dossierfouten/);
        assert.match(txt, /kennisbank\/kosten-arbeidsdeskundig-onderzoek/);
        assert.match(txt, /kennisbank\/second-opinion-arbeidsdeskundige/);
        assert.match(txt, /kennisbank\/deskundigenoordeel-vs-arbeidsdeskundig-onderzoek/);
        assert.match(txt, /kennisbank\/fml-izp-hr-beslissen-actualiseren/);
        assert.match(txt, /kennisbank\/belastbaarheid-verouderd-nieuwe-fml-izp/);

        for (const path of [
            '/voor/hr-adviseur',
            '/voor/werknemer',
            '/voor/casemanager',
            '/voor/wga-specialist',
            '/voor/directeur-eigenaar',
            '/voor/letselschadejurist',
            '/kennisbank/fml-uitleg',
            '/kennisbank/bezwaar-wia',
            '/kennisbank/wia-aanvraag',
            '/kennisbank/deskundigenoordeel',
            '/kennisbank/hoe-lang-duurt-onderzoek',
        ]) {
            assert.match(txt, new RegExp('https://www\\.arbeidsdeskundig\\.com' + path.replace(/\//g, '\\/')));
        }
        const doelgroepen = txt.split('## Doelgroepen')[1].split('## Hulpmiddelen')[0];
        assert.match(doelgroepen, /\/voor\/hr-adviseur/);
        assert.doesNotMatch(doelgroepen, /—/);
        const extraRoutes = txt.split('## Belangrijke kennisbank-routes')[1].split('De volledige index')[0];
        assert.match(extraRoutes, /\/kennisbank\/fml-uitleg/);
        assert.doesNotMatch(extraRoutes, /—/);

        assert.doesNotMatch(txt, /casus-60plus/);
        assert.doesNotMatch(txt, /### Basiskennis/);
        assert.doesNotMatch(txt, /Kennisbank, per onderwerp/);
        // Headroom above the previous 9000 cap: doelgroep- and kennisbank-routes
        // are required links. Still far below a dump of every artikel.
        assert.ok(txt.length < 11000, `llms.txt should stay curated, got ${txt.length} chars`);
        const kennisbankLinks = txt.match(/\/kennisbank\/[a-z0-9-]+/g) || [];
        assert.ok(kennisbankLinks.length < 40, `too many kennisbank links: ${kennisbankLinks.length}`);
    });

    it('only lists audience and kennisbank routes that the sitemap also emits', async () => {
        const [llmsRes, mapRes] = await Promise.all([
            fetch(base + '/llms.txt'),
            fetch(base + '/sitemap.xml'),
        ]);
        assert.equal(llmsRes.status, 200);
        assert.equal(mapRes.status, 200);
        const txt = await llmsRes.text();
        const map = await mapRes.text();
        const linked = [...txt.matchAll(/https:\/\/www\.arbeidsdeskundig\.com(\/[a-z0-9\-\/]+)/g)].map((m) => m[1]);
        const local = linked.filter((p) => p.startsWith('/voor/') || [
            '/kennisbank/fml-uitleg',
            '/kennisbank/bezwaar-wia',
            '/kennisbank/wia-aanvraag',
            '/kennisbank/deskundigenoordeel',
            '/kennisbank/hoe-lang-duurt-onderzoek',
        ].includes(p));
        assert.ok(local.some((p) => p.startsWith('/voor/')));
        for (const path of local) {
            assert.match(map, new RegExp('https://www\\.arbeidsdeskundig\\.com' + path.replace(/\//g, '\\/') + '<'), path);
        }
    });

    it('is also available at /.well-known/llms.txt', async () => {
        const res = await fetch(base + '/.well-known/llms.txt');
        assert.equal(res.status, 200);
        const txt = await res.text();
        assert.match(txt, /vanaf €1\.095/);
        assert.match(txt, /\/aanmelden/);
    });
});

describe('robots.txt AI-bot allows', () => {
    it('keeps GPTBot and other AI crawlers allowed', async () => {
        const res = await fetch(base + '/robots.txt');
        assert.equal(res.status, 200);
        const txt = await res.text();
        for (const bot of [
            'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot',
            'OAI-SearchBot', 'Perplexity-User', 'Applebot-Extended',
        ]) {
            assert.match(txt, new RegExp(`User-agent: ${bot}\\s+Allow: /`));
        }
        assert.match(txt, /User-agent: \*\s+Allow: \//);
        assert.doesNotMatch(txt, /Disallow: \//);
        assert.match(txt, /\/llms\.txt/);
        assert.match(txt, /Sitemap: https:\/\/www\.arbeidsdeskundig\.com\/sitemap\.xml/);
    });
});

function graphNodes(html) {
    const nodes = [];
    for (const block of parseLdJsonBlocks(html)) {
        if (Array.isArray(block['@graph'])) nodes.push(...block['@graph']);
        else nodes.push(block);
    }
    return nodes;
}

describe('homepage JSON-LD organization, website and logo', () => {
    it('parses Organization + ProfessionalService, logo, WebSite and kennisbank publisher', async () => {
        const res = await fetch(base + '/');
        assert.equal(res.status, 200);
        const html = await res.text();
        const nodes = graphNodes(html);
        const org = nodes.find((n) => n['@id'] === 'https://www.arbeidsdeskundig.com/#organization');
        assert.ok(org);
        assert.deepEqual(org['@type'], ['Organization', 'ProfessionalService']);
        assert.equal(org.logo['@type'], 'ImageObject');
        assert.equal(org.logo.url, 'https://www.arbeidsdeskundig.com/logo.svg');
        assert.equal(org.image, 'https://www.arbeidsdeskundig.com/logo.svg');
        assert.equal(org.sameAs, undefined);
        assert.deepEqual(org.aggregateRating, {
            '@type': 'AggregateRating',
            ratingValue: 4.9,
            reviewCount: 21,
            bestRating: 5,
        });
        assert.equal(org.review.length, 9);
        assert.equal(org.review[0].author.name, 'Jolande van de Graaf');

        const site = nodes.find((n) => n['@id'] === 'https://www.arbeidsdeskundig.com/#website');
        assert.ok(site);
        assert.equal(site['@type'], 'WebSite');
        assert.equal(site.url, 'https://www.arbeidsdeskundig.com/');
        assert.equal(site.name, 'arbeidsdeskundig.com');
        assert.equal(site.inLanguage, 'nl-NL');
        assert.deepEqual(site.publisher, { '@id': 'https://www.arbeidsdeskundig.com/#organization' });

        const blog = nodes.find((n) => n['@id'] === 'https://www.arbeidsdeskundig.com/#kennisbank');
        assert.equal(blog['@type'], 'Blog');
        assert.deepEqual(blog.publisher, { '@id': 'https://www.arbeidsdeskundig.com/#organization' });
    });
});

describe('static logo and assets', () => {
    it('serves /logo.svg as SVG', async () => {
        const res = await fetch(base + '/logo.svg');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
        assert.match(res.headers.get('cache-control') || '', /max-age=/);
        const body = await res.text();
        assert.match(body, /#12203A/);
        assert.match(body, /#D8A03D/);
        assert.match(body, />A</);
    });

    it('serves an existing file from the repo assets folder', async () => {
        const res = await fetch(base + '/assets/niels-foto.png');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /image\/png/);
        assert.match(res.headers.get('cache-control') || '', /public/);
        assert.match(res.headers.get('cache-control') || '', /max-age=/);
        const buf = Buffer.from(await res.arrayBuffer());
        assert.ok(buf.length > 1000);
        assert.equal(buf.subarray(0, 4).toString('hex'), '89504e47');

        const versioned = await fetch(base + '/assets/niels-foto.png?v=2');
        assert.equal(versioned.status, 200);
        assert.match(versioned.headers.get('content-type'), /image\/png/);

        const jpg = await fetch(base + '/assets/audrey-regenschot.jpg');
        assert.equal(jpg.status, 200);
        assert.match(jpg.headers.get('content-type'), /image\/jpeg/);

        const missing = await fetch(base + '/assets/does-not-exist.png');
        assert.equal(missing.status, 404);
    });

    it('points og:image and twitter:image at that real png', async () => {
        const res = await fetch(base + '/');
        const html = await res.text();
        assert.match(html, /property="og:image" content="https:\/\/www\.arbeidsdeskundig\.com\/assets\/niels-foto\.png"/);
        assert.match(html, /name="twitter:image" content="https:\/\/www\.arbeidsdeskundig\.com\/assets\/niels-foto\.png"/);
        assert.match(html, /property="og:image:width" content="500"/);
        assert.match(html, /property="og:image:height" content="421"/);
        assert.doesNotMatch(html, /og-image\.png/);
    });

    it('every homepage img src on this host resolves', async () => {
        const res = await fetch(base + '/');
        const html = await res.text();
        const start = html.indexOf('id="view-home"');
        const end = html.indexOf('id="view-', start + 10);
        assert.ok(start !== -1 && end > start);
        const srcs = [...html.slice(start, end).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(srcs.length >= 1, 'homepage should have at least one image');
        const local = srcs.filter((src) => src.startsWith('/'));
        for (const src of local) {
            const img = await fetch(base + src);
            assert.equal(img.status, 200, src);
            assert.match(img.headers.get('content-type') || '', /^image\//);
        }
    });
});

describe('FAQPage structured data is page-specific', () => {
    it('homepage FAQPage matches the two visible homepage questions', async () => {
        const res = await fetch(base + '/');
        assert.equal(res.status, 200);
        const html = await res.text();
        const pages = faqPages(html);
        assert.equal(pages.length, 1, 'homepage should have exactly one FAQPage');
        const names = pages[0].mainEntity.map((q) => q.name);
        assert.deepEqual(names, [
            'Wat kost een arbeidsdeskundig onderzoek?',
            'Kan het onderzoek ook fysiek?',
        ]);
        assert.match(pages[0].mainEntity[0].acceptedAnswer.text, /€1\.095/);
        assert.doesNotMatch(graphTypes(html).join(','), /FAQPage.*FAQPage/);
        assert.ok(!graphTypes(html).includes('FAQPage') || pages.length === 1);
        assert.ok(!parseLdJsonBlocks(html).some((b) => Array.isArray(b['@graph']) && b['@graph'].some((n) => n['@type'] === 'FAQPage')));
    });

    it('FAQ hub has SSR questions and matching FAQPage schema', async () => {
        const res = await fetch(base + '/veelgestelde-vragen');
        assert.equal(res.status, 200);
        const html = await res.text();
        const pages = faqPages(html);
        assert.equal(pages.length, 1);
        assert.ok(pages[0].mainEntity.length >= 14, `expected full FAQ, got ${pages[0].mainEntity.length}`);
        assert.ok(pages[0].mainEntity.some((q) => /second opinion/i.test(q.name)));
        assert.ok(pages[0].mainEntity.some((q) => /€1\.095/.test(q.acceptedAnswer.text)));
        assert.match(html, /id="faq-list"[^>]*>[\s\S]*Wat kost een arbeidsdeskundig onderzoek\?/);
        assert.match(html, /id="faq-list"[^>]*>[\s\S]*Is een arbeidsdeskundig onderzoek verplicht\?/);
    });

    it('does not repeat FAQPage on conversion or casus pages', async () => {
        for (const path of ['/offerte-aanvragen', '/aanmelden', '/kennisbank/casus-wga']) {
            const res = await fetch(base + path);
            assert.equal(res.status, 200, path);
            const html = await res.text();
            assert.equal(faqPages(html).length, 0, `${path} should not carry FAQPage`);
        }
    });

    it('knowledge articles keep their own FAQPage only', async () => {
        const res = await fetch(base + '/kennisbank/wat-doet-arbeidsdeskundige');
        assert.equal(res.status, 200);
        const html = await res.text();
        const pages = faqPages(html);
        assert.equal(pages.length, 1);
        assert.ok(pages[0].mainEntity.some((q) => /diagnose/i.test(q.name) || /bedrijfsarts/i.test(q.name)));
        assert.ok(!pages[0].mainEntity.some((q) => q.name === 'Kan het onderzoek ook fysiek?'));
    });
});
