'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('../server');

const INDEX = path.join(__dirname, '..', 'public', 'index.html');
const OG_DIR = path.join(__dirname, '..', 'assets', 'og');
const SITE = 'https://www.arbeidsdeskundig.com';

function kennisbankSlugs() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const start = html.indexOf('const posts = [');
    const end = html.indexOf('\n  ];', start);
    assert.ok(start !== -1 && end > start, 'posts array missing');
    const block = html.slice(start, end);
    return [...block.matchAll(/\bslug:"([^"]+)"/g)].map((m) => m[1]);
}

function decode(s) {
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function jsonLdBlocks(html) {
    const out = [];
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) out.push(JSON.parse(m[1]));
    return out;
}

function articleNode(html) {
    for (const block of jsonLdBlocks(html)) {
        if (block && block['@type'] === 'Article') return block;
    }
    return null;
}

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

describe('kennisbank featured images', () => {
    it('every kennisbank article has its own og:image and Article.image', async () => {
        const slugs = kennisbankSlugs();
        assert.ok(slugs.length >= 1, 'no kennisbank articles found');
        assert.equal(new Set(slugs).size, slugs.length, 'duplicate slugs');

        const sitemap = await (await fetch(base + '/sitemap.xml')).text();
        for (const slug of slugs) {
            assert.match(sitemap, new RegExp(`${SITE}/kennisbank/${slug}<`));
        }

        const hashes = new Map();
        const failures = [];

        async function check(slug) {
            const pageUrl = `/kennisbank/${slug}`;
            const imagePath = `/assets/og/${slug}.png`;
            const imageUrl = `${SITE}${imagePath}`;
            const file = path.join(OG_DIR, slug + '.png');
            if (!fs.existsSync(file)) {
                failures.push(slug + ': bestand assets/og/' + slug + '.png ontbreekt');
                return;
            }
            const disk = fs.readFileSync(file);
            if (disk.length >= 150 * 1024) {
                failures.push(slug + ': bestand is ' + disk.length + ' bytes');
            }
            if (disk.readUInt32BE(16) !== 1200 || disk.readUInt32BE(20) !== 630) {
                failures.push(slug + ': afmeting is niet 1200x630');
            }
            const hash = crypto.createHash('sha256').update(disk).digest('hex');
            if (hashes.has(hash)) failures.push(slug + ': zelfde afbeelding als ' + hashes.get(hash));
            else hashes.set(hash, slug);

            const res = await fetch(base + pageUrl);
            if (res.status !== 200) {
                failures.push(slug + ': HTTP ' + res.status);
                return;
            }
            const html = await res.text();
            const h1s = html.match(/<h1\b/g) || [];
            if (h1s.length !== 1) failures.push(slug + ': verwacht 1 h1, kreeg ' + h1s.length);

            const h1 = html.match(/id="artikel-titel">([^<]*)<\/h1>/);
            if (!h1) {
                failures.push(slug + ': h1 ontbreekt');
                return;
            }
            const title = decode(h1[1]);
            const expectedAlt = 'Kennisbank: ' + title;

            const og = [...html.matchAll(/<meta property="og:image" content="([^"]*)">/g)].map((m) => m[1]);
            if (og.length !== 1 || og[0] !== imageUrl) {
                failures.push(slug + ': og:image is ' + og.join(' | '));
            }
            if (!html.includes('<meta property="og:image:width" content="1200">')) {
                failures.push(slug + ': og:image:width ontbreekt');
            }
            if (!html.includes('<meta property="og:image:height" content="630">')) {
                failures.push(slug + ': og:image:height ontbreekt');
            }
            const ogAlt = html.match(/<meta property="og:image:alt" content="([^"]*)">/);
            if (!ogAlt || decode(ogAlt[1]) !== expectedAlt) {
                failures.push(slug + ': og:image:alt klopt niet');
            }
            const tw = html.match(/<meta name="twitter:image" content="([^"]*)">/);
            if (!tw || tw[1] !== imageUrl) failures.push(slug + ': twitter:image klopt niet');
            if (html.includes('og:image" content="' + SITE + '/assets/niels-foto.png"')) {
                failures.push(slug + ': og:image wijst nog naar niels-foto.png');
            }

            const article = articleNode(html);
            if (!article || !article.image || article.image['@type'] !== 'ImageObject') {
                failures.push(slug + ': Article.image is geen ImageObject');
            } else {
                if (article.image.url !== imageUrl) failures.push(slug + ': Article.image.url is ' + article.image.url);
                if (article.image.width !== 1200 || article.image.height !== 630) {
                    failures.push(slug + ': Article.image afmeting klopt niet');
                }
            }

            const img = html.match(/<img\b[^>]*id="artikel-featured"[^>]*>/);
            if (!img) {
                failures.push(slug + ': zichtbare featured image ontbreekt');
            } else {
                const tag = img[0];
                if (!tag.includes('src="' + imagePath + '"')) failures.push(slug + ': img src klopt niet');
                const alt = tag.match(/\balt="([^"]*)"/);
                if (!alt || decode(alt[1]) !== expectedAlt) failures.push(slug + ': img alt klopt niet');
                if (!tag.includes('width="1200"') || !tag.includes('height="630"')) {
                    failures.push(slug + ': img width/height ontbreekt');
                }
                if (/loading="lazy"/i.test(tag)) failures.push(slug + ': bovenste afbeelding is lazy');
                const h1At = html.indexOf('id="artikel-titel"');
                const imgAt = html.indexOf('id="artikel-featured"');
                const bodyAt = html.indexOf('id="artikel-body"');
                if (!(h1At !== -1 && imgAt > h1At && imgAt < bodyAt)) {
                    failures.push(slug + ': featured image staat niet bovenaan het artikel');
                }
                if (/<h1\b[^>]*>[^<]*<img\b[^>]*id="artikel-featured"/.test(html)) {
                    failures.push(slug + ': featured image zit in een h1');
                }
            }

            const served = await fetch(base + imagePath);
            if (served.status !== 200) {
                failures.push(slug + ': image HTTP ' + served.status);
                return;
            }
            const type = served.headers.get('content-type') || '';
            if (!/image\/png/.test(type)) failures.push(slug + ': content-type ' + type);
            const buf = Buffer.from(await served.arrayBuffer());
            if (buf.length >= 150 * 1024) failures.push(slug + ': geserveerd bestand te groot');
            if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
                failures.push(slug + ': geen png');
            }
            if (buf.readUInt32BE(16) !== 1200 || buf.readUInt32BE(20) !== 630) {
                failures.push(slug + ': geserveerde afmeting klopt niet');
            }
        }

        const queue = slugs.slice();
        async function worker() {
            while (queue.length) await check(queue.shift());
        }
        await Promise.all(Array.from({ length: 4 }, worker));

        assert.deepEqual(failures, [], failures.join('\n'));
    });
});
