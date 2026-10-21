#!/usr/bin/env node
'use strict';

// Featured images voor kennisbankartikelen.
// Leest slug, titel en categorie uit public/index.html en schrijft
// assets/og/<slug>.png (1200x630). Zelfde bron als de serverroutes.
//
//   node scripts/generate-og.js
//   node scripts/generate-og.js <slug> [<slug>...]
//
// Kleuren komen uit public/index.html (:root):
// --ink #12203A, --ink2 #1B2C4C, --paper #EDEFEA, --amber #D8A03D, --teal #1F6F5C.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public', 'index.html');
const OUT_DIR = path.join(ROOT, 'assets', 'og');
const FONT_MEDIUM = path.join(__dirname, 'fonts', 'SpaceGrotesk-Medium.ttf');
const FONT_BOLD = path.join(__dirname, 'fonts', 'SpaceGrotesk-Bold.ttf');

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 150 * 1024;

const INK = '#12203A';
const INK2 = '#1B2C4C';
const PAPER = '#EDEFEA';
const GOLD = '#D8A03D';
const TEAL = '#1F6F5C';

const CATEGORY_STYLE = {
    'WIA': { icon: 'form', pattern: 'dots' },
    'Tarief': { icon: 'bars', pattern: 'diag' },
    'Poortwachter': { icon: 'timeline', pattern: 'rules' },
    'Ziektewet': { icon: 'shield', pattern: 'rings' },
    'WGA': { icon: 'arc', pattern: 'dots' },
    'Uitzend & payroll': { icon: 'link', pattern: 'plus' },
    'Eigenrisicodragers': { icon: 'columns', pattern: 'diag' },
    'Vervroegde inzet': { icon: 'clock', pattern: 'rings' },
    'Loondoorbetaling': { icon: 'calendar', pattern: 'rules' },
    'Investering': { icon: 'coinbars', pattern: 'plus' },
    'Spoor 2': { icon: 'path', pattern: 'diag' },
    'Online vs fysiek': { icon: 'screen', pattern: 'dots' },
    'WHK': { icon: 'trend', pattern: 'rules' },
    'Casussen': { icon: 'cards', pattern: 'plus' },
    'Basiskennis': { icon: 'book', pattern: 'dots' },
    'Loonwaarde': { icon: 'bars', pattern: 'rings' },
    'Deskundigenoordeel': { icon: 'stamp', pattern: 'rings' },
    'Bezwaar': { icon: 'return', pattern: 'diag' },
    'Psychisch verzuim': { icon: 'pulse', pattern: 'rules' },
    'Actualiteit': { icon: 'today', pattern: 'plus' },
    'Gids': { icon: 'nodes', pattern: 'rings' },
    'ZZP & DGA': { icon: 'case', pattern: 'diag' },
    'Letselschade': { icon: 'scale', pattern: 'rules' },
    'Chronische aandoeningen': { icon: 'pulseflat', pattern: 'dots' },
};

function extractPosts(html) {
    const start = html.indexOf('const posts = [');
    if (start === -1) throw new Error('Geen `const posts = [` in public/index.html');
    const end = html.indexOf('\n  ];', start);
    const block = end === -1 ? html.slice(start) : html.slice(start, end);
    const lines = block.match(/\{ tag:.*? \},?/gs) || [];
    const field = (name, line) => {
        const m = line.match(new RegExp(name + ':"((?:[^"\\\\]|\\\\.)*)"'));
        return m ? m[1].replace(/\\"/g, '"') : null;
    };
    return lines
        .map((line) => ({
            slug: field('slug', line),
            title: field('title', line),
            tag: field('tag', line),
        }))
        .filter((p) => p.slug && p.title);
}

function xmlEscape(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[c]));
}

// Ruwe breedtes voor Space Grotesk Bold, als fractie van de fontgrootte.
// Ruim genoeg zodat een titel niet in het rechterpaneel loopt.
function charEm(ch) {
    const known = {
        ' ': 0.28, 'i': 0.30, 'l': 0.30, 'j': 0.32, 'I': 0.34, 'f': 0.36, 't': 0.40, 'r': 0.42,
        '.': 0.30, ',': 0.30, ':': 0.32, ';': 0.32, "'": 0.24, '\u2019': 0.24,
        '-': 0.42, '\u2013': 0.62, '\u2014': 0.90,
        '(': 0.40, ')': 0.40, '/': 0.42, '?': 0.56, '!': 0.38, '&': 0.70,
        'm': 0.88, 'w': 0.82, 'M': 0.90, 'W': 0.98,
    };
    if (known[ch] != null) return known[ch];
    if (ch >= 'a' && ch <= 'z') return 0.58;
    if (ch >= 'A' && ch <= 'Z') return 0.72;
    if (ch >= '0' && ch <= '9') return 0.62;
    return 0.60;
}

function textWidth(text, fontSize) {
    let w = 0;
    for (const ch of text) w += charEm(ch) * fontSize;
    return w;
}

function wrapTitle(title, maxWidth, fontSize) {
    const words = String(title).split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
        const next = current ? current + ' ' + word : word;
        if (current && textWidth(next, fontSize) > maxWidth) {
            lines.push(current);
            current = word;
        } else {
            current = next;
        }
    }
    if (current) lines.push(current);
    return lines;
}

function layoutTitle(title) {
    const maxWidth = 720;
    const sizes = [52, 48, 44, 40, 36, 32, 28];
    for (const size of sizes) {
        const lines = wrapTitle(title, maxWidth, size);
        const lineHeight = Math.round(size * 1.18);
        if (lines.length <= 5 && lines.length * lineHeight <= 300) {
            return { size, lines, lineHeight };
        }
    }
    const size = 28;
    const lineHeight = Math.round(size * 1.18);
    return { size, lines: wrapTitle(title, maxWidth, size).slice(0, 6), lineHeight };
}

function styleFor(tag) {
    if (CATEGORY_STYLE[tag]) return CATEGORY_STYLE[tag];
    const keys = Object.keys(CATEGORY_STYLE);
    let n = 0;
    for (const ch of String(tag)) n = (n + ch.charCodeAt(0)) % keys.length;
    return CATEGORY_STYLE[keys[n]];
}

function patternSvg(name) {
    if (name === 'dots') {
        let s = '';
        for (let y = 36; y < 610; y += 32) {
            for (let x = 888; x < 1188; x += 32) {
                s += `<circle cx="${x}" cy="${y}" r="2.4" fill="${GOLD}" opacity="0.45"/>`;
            }
        }
        return s;
    }
    if (name === 'diag') {
        let s = '';
        for (let i = -200; i < 900; i += 28) {
            s += `<line x1="${860 + i}" y1="0" x2="${860 + i - 220}" y2="630" stroke="${PAPER}" stroke-width="1.5" opacity="0.16"/>`;
        }
        return s;
    }
    if (name === 'rules') {
        let s = '';
        for (let y = 28; y < 620; y += 26) {
            s += `<line x1="876" y1="${y}" x2="1176" y2="${y}" stroke="${GOLD}" stroke-width="1.5" opacity="0.28"/>`;
        }
        return s;
    }
    if (name === 'rings') {
        let s = '';
        for (let r = 40; r <= 280; r += 36) {
            s += `<circle cx="1030" cy="318" r="${r}" fill="none" stroke="${TEAL}" stroke-width="1.5" opacity="0.55"/>`;
        }
        return s;
    }
    let s = '';
    for (let y = 48; y < 600; y += 48) {
        for (let x = 900; x < 1180; x += 48) {
            s += `<line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" stroke="${GOLD}" stroke-width="1.6" opacity="0.4"/>`;
            s += `<line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 7}" stroke="${GOLD}" stroke-width="1.6" opacity="0.4"/>`;
        }
    }
    return s;
}

function iconSvg(name) {
    const common = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
    const gold = `stroke="${GOLD}" stroke-width="7" ${common}`;
    const teal = `stroke="${TEAL}" stroke-width="7" ${common}`;
    const icons = {
        form: `<rect x="48" y="28" width="104" height="144" rx="10" ${gold}/><line x1="72" y1="68" x2="128" y2="68" ${gold}/><line x1="72" y1="98" x2="128" y2="98" ${gold}/><line x1="72" y1="128" x2="112" y2="128" ${gold}/>`,
        bars: `<line x1="36" y1="164" x2="168" y2="164" ${gold}/><rect x="48" y="108" width="28" height="56" ${gold}/><rect x="88" y="76" width="28" height="88" ${teal}/><rect x="128" y="44" width="28" height="120" ${gold}/>`,
        coinbars: `<line x1="28" y1="164" x2="128" y2="164" ${gold}/><rect x="36" y="112" width="22" height="52" ${gold}/><rect x="68" y="84" width="22" height="80" ${teal}/><rect x="100" y="56" width="22" height="108" ${gold}/><circle cx="158" cy="78" r="26" ${gold}/><line x1="158" y1="64" x2="158" y2="92" ${gold}/>`,
        timeline: `<line x1="28" y1="100" x2="172" y2="100" ${gold}/><circle cx="48" cy="100" r="12" fill="${TEAL}" stroke="${TEAL}" stroke-width="7"/><circle cx="100" cy="100" r="12" fill="${GOLD}" stroke="${GOLD}" stroke-width="7"/><circle cx="152" cy="100" r="12" ${gold}/>`,
        shield: `<path d="M100 28 L158 54 V104 C158 142 100 172 100 172 C100 172 42 142 42 104 V54 Z" ${gold}/>`,
        arc: `<circle cx="100" cy="100" r="64" ${teal}/><path d="M100 36 A64 64 0 0 1 156 132" ${gold}/>`,
        link: `<rect x="22" y="66" width="58" height="58" rx="10" ${gold}/><rect x="120" y="66" width="58" height="58" rx="10" ${teal}/><line x1="80" y1="95" x2="120" y2="95" ${gold}/>`,
        columns: `<rect x="36" y="36" width="52" height="128" rx="8" ${gold}/><rect x="112" y="36" width="52" height="128" rx="8" ${teal}/>`,
        clock: `<circle cx="100" cy="100" r="64" ${gold}/><line x1="100" y1="100" x2="100" y2="56" ${gold}/><line x1="100" y1="100" x2="136" y2="116" ${teal}/>`,
        calendar: `<rect x="40" y="48" width="120" height="112" rx="10" ${gold}/><line x1="40" y1="84" x2="160" y2="84" ${gold}/><line x1="76" y1="32" x2="76" y2="60" ${gold}/><line x1="124" y1="32" x2="124" y2="60" ${gold}/>`,
        today: `<rect x="40" y="48" width="120" height="112" rx="10" ${gold}/><line x1="40" y1="84" x2="160" y2="84" ${gold}/><line x1="76" y1="32" x2="76" y2="60" ${gold}/><line x1="124" y1="32" x2="124" y2="60" ${gold}/><circle cx="100" cy="122" r="10" fill="${TEAL}" stroke="${TEAL}" stroke-width="7"/>`,
        path: `<circle cx="46" cy="132" r="18" ${gold}/><circle cx="154" cy="58" r="18" ${teal}/><path d="M64 124 C 104 120, 108 74, 136 66" ${gold}/>`,
        screen: `<rect x="32" y="44" width="136" height="92" rx="10" ${gold}/><line x1="100" y1="136" x2="100" y2="156" ${gold}/><line x1="72" y1="156" x2="128" y2="156" ${teal}/>`,
        trend: `<polyline points="32,146 74,102 108,122 168,48" ${gold}/><circle cx="168" cy="48" r="9" fill="${TEAL}" stroke="${TEAL}" stroke-width="7"/>`,
        cards: `<rect x="58" y="36" width="104" height="128" rx="10" ${teal}/><rect x="34" y="56" width="104" height="128" rx="10" ${gold}/>`,
        book: `<path d="M100 36 C 72 48, 44 44, 36 68 V164 C 52 146, 78 150, 100 162" ${gold}/><path d="M100 36 C 128 48, 156 44, 164 68 V164 C 148 146, 122 150, 100 162" ${teal}/><line x1="100" y1="36" x2="100" y2="162" ${gold}/>`,
        stamp: `<circle cx="100" cy="96" r="52" ${gold}/><circle cx="100" cy="96" r="28" ${teal}/>`,
        return: `<path d="M78 48 H150 V152 H78" ${gold}/><path d="M86 100 H36" ${teal}/><path d="M58 78 L32 100 L58 122" ${teal}/>`,
        pulse: `<polyline points="20,108 58,108 78,64 104,146 126,88 146,108 180,108" ${gold}/>`,
        pulseflat: `<polyline points="20,120 48,120 70,72 96,148 118,120 180,120" ${gold}/><line x1="118" y1="120" x2="180" y2="120" ${teal}/>`,
        nodes: `<circle cx="100" cy="100" r="22" ${gold}/><circle cx="38" cy="46" r="12" ${teal}/><circle cx="164" cy="50" r="12" ${gold}/><circle cx="42" cy="158" r="12" ${gold}/><circle cx="160" cy="154" r="12" ${teal}/><line x1="82" y1="86" x2="48" y2="54" ${gold}/><line x1="118" y1="86" x2="154" y2="58" ${gold}/><line x1="84" y1="116" x2="52" y2="148" ${gold}/><line x1="118" y1="116" x2="150" y2="146" ${gold}/>`,
        case: `<rect x="32" y="72" width="136" height="88" rx="10" ${gold}/><path d="M72 72 V56 H128 V72" ${teal}/><line x1="32" y1="112" x2="168" y2="112" ${gold}/>`,
        scale: `<line x1="100" y1="32" x2="100" y2="156" ${gold}/><line x1="36" y1="64" x2="164" y2="64" ${gold}/><path d="M36 64 L16 112 Q36 130 56 112 Z" ${gold}/><path d="M164 64 L144 112 Q164 130 184 112 Z" ${teal}/><line x1="72" y1="168" x2="128" y2="168" ${gold}/>`,
    };
    return icons[name] || icons.form;
}

function cardSvg(post) {
    const style = styleFor(post.tag);
    const { size, lines, lineHeight } = layoutTitle(post.title);
    const areaTop = 230;
    const areaBottom = 530;
    const block = lines.length * lineHeight;
    const firstBaseline = areaTop + Math.max(0, (areaBottom - areaTop - block) / 2) + Math.round(size * 0.82);
    const tspans = lines.map((line, i) => {
        const y = firstBaseline + i * lineHeight;
        return `<tspan x="64" y="${y}">${xmlEscape(line)}</tspan>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/>
  <rect x="860" width="340" height="${HEIGHT}" fill="${INK2}"/>
  <clipPath id="panel"><rect x="860" y="0" width="340" height="${HEIGHT}"/></clipPath>
  <g clip-path="url(#panel)">${patternSvg(style.pattern)}</g>
  <line x1="860" y1="0" x2="860" y2="${HEIGHT}" stroke="${GOLD}" stroke-width="2" opacity="0.55"/>
  <g transform="translate(930,200)">${iconSvg(style.icon)}</g>
  <rect width="12" height="${HEIGHT}" fill="${GOLD}"/>
  <rect x="64" y="52" width="56" height="56" rx="6" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <text x="92" y="91" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="32" fill="${GOLD}">A</text>
  <text x="140" y="78" font-family="Space Grotesk" font-weight="500" font-size="18" fill="${GOLD}" letter-spacing="3.2">KENNISBANK</text>
  <text x="140" y="104" font-family="Space Grotesk" font-weight="500" font-size="20" fill="${PAPER}">${xmlEscape(post.tag || 'Kennisbank')}</text>
  <text font-family="Space Grotesk" font-weight="700" font-size="${size}" fill="${PAPER}">${tspans}</text>
  <rect x="64" y="556" width="28" height="28" rx="4" fill="${GOLD}"/>
  <text x="78" y="576" text-anchor="middle" font-family="Space Grotesk" font-weight="700" font-size="18" fill="${INK}">A</text>
  <text x="104" y="577" font-family="Space Grotesk" font-weight="500" font-size="20" fill="${PAPER}">arbeidsdeskundig.com</text>
</svg>`;
}

function renderSvg(svg) {
    const resvg = new Resvg(svg, {
        font: {
            fontFiles: [FONT_MEDIUM, FONT_BOLD],
            loadSystemFonts: false,
            defaultFontFamily: 'Space Grotesk',
        },
    });
    const png = resvg.render();
    if (png.width !== WIDTH || png.height !== HEIGHT) {
        throw new Error(`Onverwachte afmeting ${png.width}x${png.height}`);
    }
    return png.asPng();
}

async function fitSize(png) {
    if (png.length < MAX_BYTES) return png;
    const packed = await sharp(png)
        .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
        .toBuffer();
    return packed.length < png.length ? packed : png;
}

async function main() {
    for (const file of [FONT_MEDIUM, FONT_BOLD, INDEX_HTML]) {
        if (!fs.existsSync(file)) throw new Error('Ontbreekt: ' + file);
    }
    const wanted = process.argv.slice(2);
    const posts = extractPosts(fs.readFileSync(INDEX_HTML, 'utf8'));
    const selected = wanted.length
        ? wanted.map((slug) => {
            const post = posts.find((p) => p.slug === slug);
            if (!post) throw new Error('Onbekende slug: ' + slug);
            return post;
        })
        : posts;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    if (!wanted.length) {
        const keep = new Set(posts.map((p) => p.slug + '.png'));
        for (const name of fs.readdirSync(OUT_DIR)) {
            if (name.endsWith('.png') && !keep.has(name)) {
                fs.unlinkSync(path.join(OUT_DIR, name));
                console.log('verwijderd ' + name);
            }
        }
    }

    let failed = 0;
    for (const post of selected) {
        const png = await fitSize(renderSvg(cardSvg(post)));
        const out = path.join(OUT_DIR, post.slug + '.png');
        fs.writeFileSync(out, png);
        const kb = (png.length / 1024).toFixed(1);
        const flag = png.length >= MAX_BYTES ? ' TE GROOT' : '';
        if (png.length >= MAX_BYTES) failed += 1;
        console.log(`${post.slug}.png  ${kb} KB  ${post.tag}${flag}`);
    }
    console.log(`${selected.length} afbeelding(en) in assets/og/`);
    if (failed) {
        console.error(`${failed} bestand(en) zijn ${MAX_BYTES} bytes of groter`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
