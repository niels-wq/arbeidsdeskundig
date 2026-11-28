// Vergelijkingstool voor interventies bij verzuim.
// Zelfde bestand voor Node (SSR) en de browser (filters, sortering, berekening).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        root.VergelijkTool = api;
        const start = function () { api.boot(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PEILDATUM = '28-11-2026';
    const PEILDATUM_LANG = '28 november 2026';
    const EIGEN_AD = 'Vanaf €999,- excl. btw, in sommige gevallen bij een vroegtijdig onderzoek';
    const CTA_LABEL = 'Vraag een offerte op maat aan';
    const DISCLAIMER = 'Vergelijking op basis van openbare informatie van aanbieders, peildatum 28 november 2026. Prijzen zijn exclusief btw tenzij anders vermeld en kunnen afwijken; controleer actuele tarieven bij de aanbieder. Bandbreedtes zijn berekend uit openbare tarieven van derden, zonder ons eigen aanbod. Ziet u een onjuistheid? Laat het ons weten.';

    const TABS = {
        'arbeidsdeskundig-onderzoek': 'AD-onderzoek',
        'tweede-spoor': 'Tweede spoor',
        coaching: 'Coaching',
        outplacement: 'Outplacement',
        'whk-onderzoek': 'WHK-onderzoek',
        'no-cure-no-pay-bezwaar': 'No cure no pay',
        arbodienstverlening: 'Losse arbodienst',
        casemanagement: 'Casemanagement',
        verzuimsysteem: 'Verzuimsysteem',
    };

    const SKIP_PARAM = new Set([
        'bedrijfsgrootte',
        'aantal_dossiers',
        'aantal_trajecten',
        'medewerkers',
        'aantal_personen',
        'landelijk',
    ]);

    const FAQS = [
        [
            'Waar komen de prijzen in deze vergelijking vandaan?',
            'Uit openbare pagina\'s en prijslijsten van aanbieders, geraadpleegd op 28 november 2026. Bij elk bedrag staat de bron. Ontbreekt een openbare prijs, dan staat er prijs niet openbaar. Er is geen bedrag geschat.',
        ],
        [
            'Wat betekent prijs niet openbaar?',
            'De aanbieder noemt op de geraadpleegde pagina\'s geen prijs. De tool vult dat gat niet. U ziet dan precies de tekst prijs niet openbaar.',
        ],
        [
            'Telt het aanbod van Matchvermogen mee in de bandbreedte?',
            'Nee. Laag, midden en hoog zijn het minimum, de mediaan en het maximum van openbare tarieven van derden. Ons eigen aanbod telt niet mee. Bij arbeidsdeskundig onderzoek tonen we alleen de tekst van deze site. Bij de andere interventies staat geen eigen prijs, wel een knop voor een offerte.',
        ],
        [
            'Hoe vraag ik een offerte aan?',
            'Met de knop Vraag een offerte op maat aan. U komt op het aanmeldformulier. De gekozen interventie gaat mee, met bron vergelijkingstool. Reactie binnen 24 uur.',
        ],
    ];

    function plain(value) {
        return String(value == null ? '' : value).replace(/[—–]/g, ', ');
    }

    function esc(value) {
        return plain(value).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function safeUrl(url) {
        if (typeof url !== 'string') return '';
        if (!/^https:\/\//i.test(url)) return '';
        return url;
    }

    function formatEuro(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '';
        const neg = n < 0;
        const abs = Math.abs(n);
        const rounded = Math.round(abs * 100) / 100;
        const fixed = rounded.toFixed(2);
        let [whole, frac] = fixed.split('.');
        whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const wholeSource = Math.abs(abs - Math.round(abs)) < 1e-9;
        const body = wholeSource ? whole : whole + ',' + frac;
        return (neg ? '-' : '') + '€' + body;
    }

    function formatCijfer(n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '';
        return String(n).replace('.', ',');
    }

    function mul(a, b) {
        const text = String(a);
        const dec = (text.split('.')[1] || '').length;
        const scale = 10 ** dec;
        const prod = Math.round(Number(a) * scale) * b;
        return dec === 0 ? prod : prod / scale;
    }

    function parseCount(raw) {
        const text = String(raw == null ? '' : raw).trim();
        if (!/^\d+$/.test(text)) return null;
        const n = Number(text);
        return n >= 1 ? n : null;
    }

    function bucket(n) {
        if (!n) return '';
        if (n <= 5) return 'tot 5';
        if (n <= 100) return '6 tot 100';
        return 'meer dan 100';
    }

    function jaarTekst(prijs, medewerkers, dossiers) {
        const eenheid = String(prijs.eenheid || '').toLowerCase();
        const bedrag = prijs.bedrag;
        if (!Number.isFinite(bedrag)) return null;
        if (eenheid.includes('%') || /periode niet/.test(eenheid)) return null;
        if (/per medewerker per jaar|per werknemer per jaar/.test(eenheid)) {
            if (!medewerkers) return null;
            const tot = mul(bedrag, medewerkers);
            return formatEuro(bedrag) + ' per medewerker per jaar × ' + medewerkers + ' medewerkers = ' + formatEuro(tot) + ' per jaar';
        }
        if (/per medewerker per maand|per actieve medewerker per maand/.test(eenheid)) {
            if (!medewerkers) return null;
            const perJaar = mul(bedrag, 12);
            const tot = mul(perJaar, medewerkers);
            return formatEuro(bedrag) + ' per medewerker per maand × 12 × ' + medewerkers + ' medewerkers = ' + formatEuro(tot) + ' per jaar';
        }
        if (/per persoon/.test(eenheid)) {
            if (!medewerkers) return null;
            const tot = mul(bedrag, medewerkers);
            return formatEuro(bedrag) + ' per persoon × ' + medewerkers + ' medewerkers = ' + formatEuro(tot);
        }
        if (/per traject/.test(eenheid)) {
            if (!dossiers) return null;
            const tot = mul(bedrag, dossiers);
            return formatEuro(bedrag) + ' per traject × ' + dossiers + ' dossiers per jaar = ' + formatEuro(tot) + ' per jaar';
        }
        return null;
    }

    function formatBandWaarde(band, n) {
        if (typeof n !== 'number' || !Number.isFinite(n)) return '';
        if (String(band.eenheid || '').trim().startsWith('%')) return formatCijfer(n) + '%';
        return formatEuro(n);
    }

    function marksOf(certs) {
        const labels = [];
        let bow = false;
        let sbca = false;
        (certs || []).forEach((cert) => {
            const status = String(cert.status || '');
            if (!/^aangetroffen/i.test(status)) return;
            const naam = String(cert.naam || '');
            if (/blik op werk/i.test(naam)) {
                bow = true;
                labels.push('Blik op Werk keurmerk: ja');
            } else if (/sbca|certificatieschema arbodiensten/i.test(naam)) {
                sbca = true;
                labels.push('SBCA-certificaat: ja');
            }
        });
        return { labels: [...new Set(labels)], bow, sbca };
    }

    function reviewsOf(profile, bronnen) {
        const bow = profile && profile.blik_op_werk;
        if (!bow) return [];
        const bron = bronnen[bow.bron] || {};
        const url = safeUrl(bron.url);
        if (!url) return [];
        const rows = [
            ['cliënten', bow.clienten],
            ['opdrachtgevers', bow.opdrachtgevers],
        ];
        const out = [];
        rows.forEach(([groep, row]) => {
            if (!row || typeof row.cijfer !== 'number') return;
            out.push({
                groep,
                cijfer: row.cijfer,
                respondenten: typeof row.respondenten === 'number' ? row.respondenten : null,
                periode: plain(bow.periode || ''),
                bronUrl: url,
                bronTitel: plain(bron.titel || 'Bron'),
            });
        });
        return out;
    }

    function priceMode(ivId, id) {
        if (id === 'bm' || id === 'wkk') return 'block';
        if (id === 'mv') return ivId === 'arbeidsdeskundig-onderzoek' ? 'eigen-ad' : 'eigen-cta';
        return 'show';
    }

    function mapPrices(rawPrices, bronnen, leukOk) {
        const prijzen = [];
        let leukWeg = false;
        (rawPrices || []).forEach((prijs) => {
            if (typeof prijs.bedrag !== 'number') return;
            if (prijs.bron === 'leuk_2026' && !leukOk) {
                leukWeg = true;
                return;
            }
            const bron = bronnen[prijs.bron];
            const url = bron && safeUrl(bron.url);
            if (!url) return;
            prijzen.push({
                label: plain(prijs.label),
                bedrag: prijs.bedrag,
                eenheid: plain(prijs.eenheid),
                btw: plain(prijs.btw || ''),
                tariefjaar: plain(prijs.tariefjaar || ''),
                prijsbasis: plain(prijs.prijsbasis || ''),
                bronUrl: url,
                bronTitel: plain(bron.titel || 'Bron'),
            });
        });
        return { prijzen, leukWeg };
    }

    function toonNietOpenbaar(raw, mode) {
        if (mode !== 'show' && mode !== 'block') return false;
        const hadNumber = (raw.prijzen || []).some((prijs) => typeof prijs.bedrag === 'number');
        if (mode === 'block' && hadNumber) return false;
        return raw.prijs_tekst_tool === 'prijs niet openbaar' || raw.prijs_status === 'niet openbaar';
    }

    function prepareModel(data, opts) {
        const leukOk = !!(opts && opts.leukBereikbaar);
        const bronnen = data.bronnen || {};
        const catalog = data.aanbieders || {};
        const interventies = (data.interventies || []).map((iv) => {
            let leukWeggelaten = false;
            const banden = ((iv.marktbandbreedte && iv.marktbandbreedte.banden) || []).map((band) => ({
                id: band.id,
                eenheid: plain(band.eenheid),
                laag: typeof band.laag === 'number' ? band.laag : null,
                midden: typeof band.midden === 'number' ? band.midden : null,
                hoog: typeof band.hoog === 'number' ? band.hoog : null,
                n: typeof band.n === 'number' ? band.n : null,
                karakter: plain(band.karakter || ''),
            }));
            const aanbieders = (iv.aanbieders || []).map((raw) => {
                const mode = priceMode(iv.id, raw.aanbieder_id);
                const profile = catalog[raw.aanbieder_id] || {};
                const marks = marksOf(profile.certificeringen);
                let prijzen = [];
                if (mode === 'show') {
                    const mapped = mapPrices(raw.prijzen, bronnen, leukOk);
                    prijzen = mapped.prijzen;
                    if (mapped.leukWeg) leukWeggelaten = true;
                }
                const garantieBron = raw.garantie && bronnen[raw.garantie.bron];
                return {
                    id: raw.aanbieder_id,
                    naam: plain(profile.naam || raw.aanbieder_id),
                    website: safeUrl(profile.website),
                    mode,
                    prijzen,
                    nietOpenbaar: toonNietOpenbaar(raw, mode),
                    eigenAd: mode === 'eigen-ad',
                    eigenCta: mode === 'eigen-cta',
                    landelijkJa: !!(profile.landelijk && profile.landelijk.waarde === 'ja'),
                    keurmerken: marks.labels,
                    bow: marks.bow,
                    sbca: marks.sbca,
                    ncnpJa: !!(raw.no_cure_no_pay && String(raw.no_cure_no_pay.waarde || '').startsWith('ja')),
                    garantieJa: !!(raw.garantie && typeof raw.garantie === 'object'),
                    garantieUrl: garantieBron ? safeUrl(garantieBron.url) : '',
                    reviews: reviewsOf(profile, bronnen),
                };
            });
            return {
                id: iv.id,
                naam: plain(iv.naam),
                tab: TABS[iv.id] || plain(iv.naam),
                omschrijving: plain(iv.omschrijving),
                prijsbasis: plain(iv.prijsbasis_standaard),
                banden,
                leukWeggelaten,
                parameters: (iv.parameters || []).map((param) => ({
                    id: param.id,
                    type: param.type,
                    label: plain(param.label),
                    opties: (param.opties || []).map(plain),
                })),
                aanbieders,
            };
        });
        return {
            peildatum: PEILDATUM,
            leukBereikbaar: leukOk,
            interventies,
        };
    }

    function defaultState() {
        return {
            interventie: 'arbeidsdeskundig-onderzoek',
            medewerkers: '',
            dossiers: '',
            alleenOpenbaar: false,
            landelijk: false,
            keurmerken: false,
            sort: 'prijs-op',
            extra: {},
            vergelijk: [],
            melding: '',
        };
    }

    function ctaHref(state) {
        const q = new URLSearchParams();
        q.set('bron', 'vergelijkingstool');
        q.set('interventie', state.interventie || 'arbeidsdeskundig-onderzoek');
        if (parseCount(state.medewerkers)) q.set('medewerkers', String(parseCount(state.medewerkers)));
        if (parseCount(state.dossiers)) q.set('dossiers', String(parseCount(state.dossiers)));
        const groep = bucket(parseCount(state.medewerkers));
        if (groep) q.set('bedrijfsgrootte', groep);
        Object.keys(state.extra || {}).forEach((key) => {
            const value = state.extra[key];
            if (value === '' || value == null || value === false) return;
            q.set(key, value === true ? 'ja' : String(value));
        });
        return '/aanmelden?' + q.toString();
    }

    function hasOpenbarePrijs(aanbieder) {
        return aanbieder.eigenAd || aanbieder.prijzen.length > 0;
    }

    function passes(aanbieder, state) {
        if (state.alleenOpenbaar && !hasOpenbarePrijs(aanbieder)) return false;
        if (state.landelijk && !aanbieder.landelijkJa) return false;
        if (state.keurmerken && !aanbieder.keurmerken.length) return false;
        const extra = state.extra || {};
        if (extra.blik_op_werk && !aanbieder.bow) return false;
        if (extra.sbca && !aanbieder.sbca) return false;
        if ((extra.no_cure_no_pay || extra.ncnp) && !aanbieder.ncnpJa) return false;
        if (extra.garantie && !aanbieder.garantieJa) return false;
        return true;
    }

    function sortKey(aanbieder) {
        if (!aanbieder.prijzen.length) return null;
        return Math.min.apply(null, aanbieder.prijzen.map((prijs) => prijs.bedrag));
    }

    function sorted(list, sort) {
        return list.slice().sort((a, b) => {
            if (sort === 'naam') return a.naam.localeCompare(b.naam, 'nl');
            const ka = sortKey(a);
            const kb = sortKey(b);
            if (ka == null && kb == null) return a.naam.localeCompare(b.naam, 'nl');
            if (ka == null) return 1;
            if (kb == null) return -1;
            return sort === 'prijs-af' ? kb - ka : ka - kb;
        });
    }

    function focusedBandId(iv, extra) {
        const keuze = extra || {};
        if (keuze.tariefvorm === 'uurtarief') {
            const band = iv.banden.find((item) => item.id === 'per_uur' || /per uur/i.test(item.eenheid));
            return band ? band.id : null;
        }
        if (keuze.tariefvorm === 'vast tarief per onderzoek') {
            const band = iv.banden.find((item) => item.id === 'per_onderzoek');
            return band ? band.id : null;
        }
        const duur = keuze.duur || '';
        const want = duur === '6 maanden' ? '6'
            : duur === '9 maanden' ? '9'
                : (duur === '12 maanden' || duur === 'tot 12 maanden') ? '12'
                    : '';
        if (!want) return null;
        const band = iv.banden.find((item) => item.id.indexOf(want + '_') === 0 || new RegExp('(^|\\D)' + want + ' maanden').test(item.eenheid));
        return band ? band.id : null;
    }

    function dossiersLabel(iv) {
        const param = (iv.parameters || []).find((item) => item.id === 'aantal_dossiers' || item.id === 'aantal_trajecten');
        return param ? param.label : 'Aantal dossiers per jaar';
    }

    function medewerkersLabel(iv) {
        const param = (iv.parameters || []).find((item) => item.id === 'medewerkers' || item.id === 'aantal_personen' || item.id === 'bedrijfsgrootte');
        if (!param || param.id === 'bedrijfsgrootte') return 'Aantal medewerkers';
        return param.label;
    }

    function renderBron(prijs) {
        return '<a href="' + esc(prijs.bronUrl) + '" rel="noopener noreferrer">' + esc(prijs.bronTitel) + ', peildatum ' + PEILDATUM + '</a>';
    }

    function renderPrijs(prijs, medewerkers, dossiers) {
        const meta = [prijs.eenheid, prijs.btw, prijs.tariefjaar ? 'tariefjaar ' + prijs.tariefjaar : ''].filter(Boolean).join(', ');
        const berekening = jaarTekst(prijs, medewerkers, dossiers);
        return '<div class="vgl-prijs">'
            + '<p class="vgl-prijs-label">' + esc(prijs.label) + '</p>'
            + '<p class="vgl-bedrag">' + esc(formatEuro(prijs.bedrag)) + '</p>'
            + '<p class="vgl-meta">' + esc(meta) + '</p>'
            + '<p class="vgl-bron">Bron: ' + renderBron(prijs) + '</p>'
            + '<p class="vgl-jaar">Jaarkosten: ' + (berekening ? esc(berekening) + '. Indicatie op basis van openbare tarieven.' : 'niet te berekenen') + '</p>'
            + '</div>';
    }

    function renderCard(aanbieder, state, compact) {
        const medewerkers = parseCount(state.medewerkers);
        const dossiers = parseCount(state.dossiers);
        const checked = state.vergelijk.indexOf(aanbieder.id) !== -1;
        let prijzen = '';
        if (aanbieder.eigenAd) {
            prijzen = '<p class="vgl-eigen">' + esc(EIGEN_AD) + '</p>';
        } else if (aanbieder.prijzen.length) {
            prijzen = aanbieder.prijzen.map((prijs) => renderPrijs(prijs, medewerkers, dossiers)).join('');
        } else if (aanbieder.nietOpenbaar) {
            prijzen = '<p class="vgl-gesloten">prijs niet openbaar</p>';
        } else if (!aanbieder.eigenCta) {
            prijzen = '<p class="vgl-jaar">Jaarkosten: niet te berekenen</p>';
        }
        const feiten = [];
        aanbieder.keurmerken.forEach((label) => feiten.push(esc(label)));
        if (aanbieder.landelijkJa) feiten.push('Landelijk: ja');
        if (aanbieder.ncnpJa) feiten.push('No cure no pay: ja');
        if (aanbieder.garantieJa) {
            feiten.push(aanbieder.garantieUrl
                ? 'Garantie gepubliceerd: ja (<a href="' + esc(aanbieder.garantieUrl) + '" rel="noopener noreferrer">bron, peildatum ' + PEILDATUM + '</a>)'
                : 'Garantie gepubliceerd: ja');
        }
        const reviews = (aanbieder.reviews || []).map((review) => {
            const resp = review.respondenten != null ? ', ' + review.respondenten + ' respondenten' : '';
            const periode = review.periode ? ', ' + esc(review.periode) : '';
            return '<p class="vgl-review">Blik op Werk, ' + esc(review.groep) + ': ' + esc(formatCijfer(review.cijfer)) + esc(resp) + periode
                + '. Bron: <a href="' + esc(review.bronUrl) + '" rel="noopener noreferrer">' + esc(review.bronTitel) + ', peildatum ' + PEILDATUM + '</a></p>';
        }).join('');
        const naam = aanbieder.website
            ? '<a href="' + esc(aanbieder.website) + '" rel="noopener noreferrer">' + esc(aanbieder.naam) + '</a>'
            : esc(aanbieder.naam);
        const offerte = aanbieder.eigenCta
            ? '<p><a class="btn-primary vgl-cta" href="' + esc(ctaHref(state)) + '">' + esc(CTA_LABEL) + '</a></p>'
            : '';
        const compare = compact ? '' : (
            '<label class="vgl-check"><input class="vgl-cmp" type="checkbox" value="' + esc(aanbieder.id) + '"' + (checked ? ' checked' : '') + '> Vergelijk</label>'
        );
        return '<article class="vgl-card">'
            + '<h3>' + naam + '</h3>'
            + compare
            + prijzen
            + offerte
            + (feiten.length ? '<ul class="vgl-feiten">' + feiten.map((feit) => '<li>' + feit + '</li>').join('') + '</ul>' : '')
            + reviews
            + '</article>';
    }

    function renderBands(iv, state) {
        if (!iv.banden.length) {
            return '<p class="vgl-note">Voor deze interventie staat geen bandbreedte in de bron.</p>';
        }
        const focus = focusedBandId(iv, state.extra);
        const duur = (state.extra || {}).duur || '';
        const duurZonderBand = duur && !focus && /maand/.test(duur);
        const rows = iv.banden.map((band) => {
            const hoog = typeof band.hoog === 'number' && band.hoog > 0 ? band.hoog : null;
            const items = [
                ['laag', band.laag],
                ['midden', band.midden],
                ['hoog', band.hoog],
            ].filter((pair) => typeof pair[1] === 'number');
            const bars = items.map((pair) => {
                const width = hoog ? Math.max(4, Math.round((pair[1] / hoog) * 100)) : 100;
                const waarde = formatBandWaarde(band, pair[1]);
                return '<div class="vgl-bar-row"><span>' + pair[0] + '</span><span class="vgl-bar-track"><span class="vgl-bar" style="width:' + width + '%"></span></span><span>' + esc(waarde) + '</span></div>';
            }).join('');
            const aria = items.map((pair) => pair[0] + ' ' + formatBandWaarde(band, pair[1])).join(', ');
            const n = band.n != null ? 'n = ' + band.n : '';
            return '<figure class="vgl-band' + (focus === band.id ? ' is-focus' : '') + '">'
                + '<figcaption>' + esc(band.eenheid) + (n ? '. ' + n : '') + '</figcaption>'
                + '<div class="vgl-bars" role="img" aria-label="' + esc(aria) + '">' + bars + '</div>'
                + (band.karakter ? '<p class="vgl-note">' + esc(band.karakter) + '</p>' : '')
                + '</figure>';
        }).join('');
        const letop = duurZonderBand
            ? '<p class="vgl-note">Voor deze duur staat geen aparte bandbreedte in de bron.</p>'
            : '';
        const leuk = iv.leukWeggelaten
            ? '<p class="vgl-note">De prijslijst van Leuk Personeel was niet bereikbaar. Die prijzen staan niet in deze lijst. De bandbreedte blijft de gepubliceerde steekproef.</p>'
            : '';
        return '<div class="vgl-banden"><h2>Bandbreedte</h2>' + rows + letop + leuk + '</div>';
    }

    function renderParams(iv, state) {
        const extra = state.extra || {};
        const fields = (iv.parameters || []).filter((param) => !SKIP_PARAM.has(param.id)).map((param) => {
            if (param.type === 'ja/nee') {
                const on = extra[param.id] === true;
                return '<label class="vgl-check"><input class="vgl-extra-check" type="checkbox" name="' + esc(param.id) + '"' + (on ? ' checked' : '') + '> ' + esc(param.label) + '</label>';
            }
            if (param.type === 'keuze') {
                const options = ['<option value="">Geen voorkeur</option>'].concat((param.opties || []).map((optie) => {
                    const selected = extra[param.id] === optie ? ' selected' : '';
                    return '<option value="' + esc(optie) + '"' + selected + '>' + esc(optie) + '</option>';
                }));
                return '<label class="vgl-field"><span>' + esc(param.label) + '</span><select class="vgl-extra-select" name="' + esc(param.id) + '">' + options.join('') + '</select></label>';
            }
            const value = extra[param.id] ? esc(extra[param.id]) : '';
            return '<label class="vgl-field"><span>' + esc(param.label) + '</span><input class="vgl-extra-num" id="vgl-extra-' + esc(param.id) + '" name="' + esc(param.id) + '" type="number" min="1" inputmode="numeric" value="' + value + '"></label>';
        }).join('');
        const groep = bucket(parseCount(state.medewerkers));
        return '<div class="vgl-params">'
            + '<label class="vgl-field"><span>' + esc(medewerkersLabel(iv)) + '</span><input id="vgl-medewerkers" type="number" min="1" inputmode="numeric" value="' + esc(state.medewerkers) + '"></label>'
            + '<label class="vgl-field"><span>' + esc(dossiersLabel(iv)) + '</span><input id="vgl-dossiers" type="number" min="1" max="50" inputmode="numeric" value="' + esc(state.dossiers) + '"></label>'
            + (groep ? '<p class="vgl-note">Bedrijfsgrootte: ' + esc(groep) + ' medewerkers.</p>' : '')
            + fields
            + '</div>';
    }

    function renderApp(model, state) {
        const iv = (model.interventies || []).find((item) => item.id === state.interventie) || model.interventies[0];
        if (!iv) return '';
        const tabs = model.interventies.map((item) => {
            const on = item.id === iv.id ? ' is-on' : '';
            const selected = item.id === iv.id ? 'true' : 'false';
            return '<button type="button" class="vgl-tab' + on + '" data-vgl-tab="' + esc(item.id) + '" aria-selected="' + selected + '">' + esc(item.tab) + '</button>';
        }).join('');
        const lijst = sorted(iv.aanbieders.filter((item) => passes(item, state)), state.sort);
        const gekozen = state.vergelijk
            .map((id) => iv.aanbieders.find((item) => item.id === id))
            .filter(Boolean)
            .slice(0, 3);
        const href = ctaHref(state);
        const compare = gekozen.length
            ? '<section class="vgl-naast"><h2>Naast elkaar</h2><div class="vgl-compare cols-' + gekozen.length + '">'
                + gekozen.map((item) => renderCard(item, state, true)).join('')
                + '</div></section>'
            : '';
        return '<div class="vgl-tools">'
            + '<div class="vgl-tabs" role="tablist">' + tabs + '</div>'
            + '<div class="vgl-filters">'
            + '<label class="vgl-check"><input class="vgl-flag" type="checkbox" name="alleenOpenbaar"' + (state.alleenOpenbaar ? ' checked' : '') + '> Alleen openbare prijs</label>'
            + '<label class="vgl-check"><input class="vgl-flag" type="checkbox" name="landelijk"' + (state.landelijk ? ' checked' : '') + '> Landelijk</label>'
            + '<label class="vgl-check"><input class="vgl-flag" type="checkbox" name="keurmerken"' + (state.keurmerken ? ' checked' : '') + '> Keurmerken</label>'
            + '<label class="vgl-field vgl-sort-field"><span>Sorteer op prijs</span><select class="vgl-sort">'
            + '<option value="prijs-op"' + (state.sort === 'prijs-op' ? ' selected' : '') + '>Prijs oplopend</option>'
            + '<option value="prijs-af"' + (state.sort === 'prijs-af' ? ' selected' : '') + '>Prijs aflopend</option>'
            + '<option value="naam"' + (state.sort === 'naam' ? ' selected' : '') + '>Naam</option>'
            + '</select></label>'
            + '</div>'
            + renderParams(iv, state)
            + (state.melding ? '<p class="vgl-melding" role="status">' + esc(state.melding) + '</p>' : '')
            + '</div>'
            + '<section class="vgl-result">'
            + '<h2>' + esc(iv.naam) + '</h2>'
            + '<p>' + esc(iv.omschrijving) + '</p>'
            + '<p class="vgl-note">Prijsbasis: ' + esc(iv.prijsbasis) + '</p>'
            + renderBands(iv, state)
            + '<p class="vgl-cta-row"><a class="btn-primary vgl-cta" href="' + esc(href) + '">' + esc(CTA_LABEL) + '</a></p>'
            + '<p class="vgl-note">Prijs voor jouw situatie? Vraag een offerte aan bij Matchvermogen. Reactie binnen 24 uur.</p>'
            + compare
            + '<div class="vgl-list">' + (lijst.length ? lijst.map((item) => renderCard(item, state, false)).join('') : '<p>Geen aanbieders met deze filters.</p>') + '</div>'
            + '<p class="vgl-cta-row"><a class="btn-primary vgl-cta" href="' + esc(href) + '">' + esc(CTA_LABEL) + '</a></p>'
            + '</section>';
    }

    function disclaimerHtml() {
        const linked = DISCLAIMER.replace(
            'Laat het ons weten.',
            '<a href="mailto:info@arbeidsdeskundig.com?subject=Onjuistheid%20in%20de%20vergelijkingstool">Laat het ons weten</a>.'
        );
        return '<p class="vgl-disclaimer">' + linked + '</p>';
    }

    function faqHtml() {
        const items = FAQS.map((pair) => (
            '<div class="accordion-item open">'
            + '<button class="accordion-head" type="button" onclick="toggleAccordion(this)">' + esc(pair[0]) + '<span class="accordion-icon">+</span></button>'
            + '<div class="accordion-body" style="max-height:none;"><div class="accordion-body-inner">' + esc(pair[1]) + '</div></div>'
            + '</div>'
        )).join('');
        return '<h2>Veelgestelde vragen</h2><div class="vgl-faq-list">' + items + '</div>';
    }

    function datasetJsonLd(data, baseUrl) {
        const citations = Object.keys(data.bronnen || {}).map((key) => {
            const bron = data.bronnen[key];
            const url = bron && safeUrl(bron.url);
            if (!url) return null;
            return { '@type': 'CreativeWork', name: plain(bron.titel || key), url };
        }).filter(Boolean);
        return {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            name: 'Openbare tarieven van interventies bij verzuim',
            description: 'Steekproef van openbare tarieven van derden, peildatum 28 november 2026. Elk bedrag heeft een bron. Eigen aanbod telt niet mee in de bandbreedte.',
            dateModified: '2026-11-28',
            inLanguage: 'nl-NL',
            creator: { '@type': 'Organization', name: 'arbeidsdeskundig.com', url: baseUrl + '/' },
            url: baseUrl + '/vergelijken-interventies',
            citation: citations,
        };
    }

    function webAppJsonLd(baseUrl) {
        return {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Interventies bij verzuim vergelijken',
            url: baseUrl + '/vergelijken-interventies',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            inLanguage: 'nl-NL',
            isAccessibleForFree: true,
            description: 'Vergelijk openbare tarieven van interventies bij verzuim, met bron en peildatum 28 november 2026.',
            provider: { '@type': 'Organization', name: 'arbeidsdeskundig.com', url: baseUrl + '/' },
        };
    }

    function modelJson(model) {
        return JSON.stringify(model).replace(/</g, '\\u003c');
    }

    function leukUrl(data) {
        const bron = data && data.bronnen && data.bronnen.leuk_2026;
        return bron ? safeUrl(bron.url) : '';
    }

    async function bronBereikbaar(url) {
        if (!url) return false;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
            let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
            if (res.status === 405 || res.status === 501) {
                res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
            }
            return res.ok;
        } catch (err) {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    function boot() {
        const root = document.getElementById('vgl-app');
        const modelEl = document.getElementById('vgl-model');
        if (!root || !modelEl || !root.isConnected) return;
        const raw = (modelEl.textContent || '').trim();
        if (!raw || raw.indexOf('<!--') === 0) return;
        let model;
        try { model = JSON.parse(raw); } catch (err) { return; }
        const state = defaultState();
        const params = new URLSearchParams(window.location.search);
        const gekozen = params.get('interventie');
        if (gekozen && model.interventies.some((item) => item.id === gekozen)) state.interventie = gekozen;
        if (parseCount(params.get('medewerkers'))) state.medewerkers = String(parseCount(params.get('medewerkers')));
        if (parseCount(params.get('dossiers'))) state.dossiers = String(parseCount(params.get('dossiers')));

        function paint() {
            const focus = document.activeElement;
            const fid = focus && focus.id;
            const sel = focus && typeof focus.selectionStart === 'number' ? focus.selectionStart : null;
            root.innerHTML = renderApp(model, state);
            const sticky = document.getElementById('vgl-sticky-link');
            if (sticky) sticky.setAttribute('href', ctaHref(state));
            if (fid) {
                const next = document.getElementById(fid);
                if (next) {
                    next.focus();
                    if (sel != null && next.setSelectionRange) {
                        try { next.setSelectionRange(sel, sel); } catch (err) { /* number inputs */ }
                    }
                }
            }
            if (typeof updateBottomBarOffset === 'function') updateBottomBarOffset();
        }

        root.addEventListener('click', (ev) => {
            const tab = ev.target.closest('[data-vgl-tab]');
            if (!tab) return;
            state.interventie = tab.getAttribute('data-vgl-tab');
            state.vergelijk = [];
            state.extra = {};
            state.melding = '';
            paint();
        });
        root.addEventListener('change', (ev) => {
            const target = ev.target;
            if (target.classList.contains('vgl-sort')) {
                state.sort = target.value;
                paint();
                return;
            }
            if (target.classList.contains('vgl-flag')) {
                state[target.name] = target.checked;
                paint();
                return;
            }
            if (target.classList.contains('vgl-extra-check')) {
                state.extra[target.name] = target.checked;
                paint();
                return;
            }
            if (target.classList.contains('vgl-extra-select')) {
                state.extra[target.name] = target.value;
                paint();
                return;
            }
            if (target.classList.contains('vgl-cmp')) {
                const id = target.value;
                if (target.checked) {
                    if (state.vergelijk.indexOf(id) === -1) {
                        if (state.vergelijk.length >= 3) state.melding = 'Maximaal 3 aanbieders naast elkaar.';
                        else {
                            state.vergelijk.push(id);
                            state.melding = '';
                        }
                    }
                } else {
                    state.vergelijk = state.vergelijk.filter((item) => item !== id);
                    state.melding = '';
                }
                paint();
            }
        });
        let paintTimer = null;
        root.addEventListener('input', (ev) => {
            const target = ev.target;
            if (target.id === 'vgl-medewerkers') state.medewerkers = target.value;
            else if (target.id === 'vgl-dossiers') state.dossiers = target.value;
            else if (target.classList.contains('vgl-extra-num')) state.extra[target.name] = target.value;
            else return;
            clearTimeout(paintTimer);
            paintTimer = setTimeout(paint, 220);
        });
        paint();
    }

    return {
        PEILDATUM,
        EIGEN_AD,
        CTA_LABEL,
        DISCLAIMER,
        FAQS,
        prepareModel,
        defaultState,
        renderApp,
        ctaHref,
        disclaimerHtml,
        faqHtml,
        datasetJsonLd,
        webAppJsonLd,
        modelJson,
        leukUrl,
        bronBereikbaar,
        boot,
        formatEuro,
        jaarTekst,
        parseCount,
    };
});
