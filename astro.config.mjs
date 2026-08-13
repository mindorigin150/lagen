// @ts-check
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? "https://mindorigin150.github.io";
const base = process.env.SITE_BASE ?? "/lagen/";

// https://astro.build/config
export default defineConfig({
    site,
    base,
});
