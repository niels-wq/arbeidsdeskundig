# arbeidsdeskundig.com

## Featured image voor een kennisbankartikel

Elk kennisbankartikel heeft een eigen afbeelding van 1200 bij 630 pixels.
Het bestand staat op `assets/og/<slug>.png` en de site gebruikt het als:

- `og:image`, met `og:image:width`, `og:image:height` en `og:image:alt`
- `twitter:image`
- `image` in de Article structured data (ImageObject met url, width en height)
- zichtbare afbeelding direct onder de titel van het artikel

De homepage houdt de bestaande foto. Alleen een kennisbankartikel krijgt zijn eigen kaart.

### Nieuw artikel

1. Voeg het artikel toe in `public/index.html`, in de array `posts`. Verplicht zijn `slug`, `title` en `tag`.
2. Installeer de dependencies voor het script als dat nog niet is gebeurd: `npm install`.
3. Genereer de afbeelding:

```
npm run generate:og
```

Alleen dit ene artikel:

```
node scripts/generate-og.js <slug>
```

4. Commit `assets/og/<slug>.png` mee met het artikel.

Het script `scripts/generate-og.js` leest titel en categorie uit `posts` en tekent een merkkaart. De kleuren komen uit de CSS van de site: `--ink` `#12203A` en goud `#D8A03D`, plus `--ink2`, `--paper` en `--teal`. Het label is Kennisbank. Het icoon en het patroon verschillen per categorie (`tag`). De kaart wordt met `@resvg/resvg-js` uit SVG gerasterd. Ligt het PNG-bestand op of boven 150 KB, dan verkleint `sharp` het.

De lettertypen staan in `scripts/fonts/` (Space Grotesk, SIL Open Font License, zie `scripts/fonts/OFL.txt`).

`npm test` faalt als een kennisbankartikel geen eigen `og:image` of `Article.image` heeft, of als het bestand geen 1200x630 PNG onder 150 KB is.
