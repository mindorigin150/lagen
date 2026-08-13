# ragen-ai.github.io

Main GitHub Pages site for `https://ragen-ai.github.io/`.

## Local Development

```bash
npm install
npm run dev
```

## V2 Subsite

`/v2/` is served from static files under `public/v2/`.

To refresh the v2 subsite from `../RV-Filter-Website`:

```bash
cd ../RV-Filter-Website
SITE_URL="https://ragen-ai.github.io" SITE_BASE="/v2/" npm run build

cd ../ragen-ai.github.io
mkdir -p public/v2
cp -R ../RV-Filter-Website/dist/. public/v2/
```

After syncing, rebuild the main site:

```bash
npm run build
```

## Homepage Entry

The main homepage includes a top hero news banner:

- `News: We released RAGEN-2`

That banner links to `/v2/`.

## LAGEN Research Page

The latency-aware agents project page is implemented at `src/pages/lagen/index.astro`.
With the repository's default `SITE_BASE=/lagen/`, preview it at `/lagen/lagen/`.
Its paper, figures, and replay media live under `public/lagen/`.
