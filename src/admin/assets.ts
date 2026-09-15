import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildPaletteCss } from "basalt-ui/tokens";
import { STYLES } from "./styles";

const TOKENS_CSS = buildPaletteCss({
  defaultScheme: "light",
  mediaFallback: true,
  only: "core",
  legacyAliases: false,
});

const FONT_FACES = `
  @font-face {
    font-family: 'Nunito Sans Variable';
    font-style: normal;
    font-weight: 200 1000;
    font-display: swap;
    src: url('/admin/assets/fonts/nunito-sans.woff2') format('woff2-variations');
  }
  @font-face {
    font-family: 'Hubot Sans Variable';
    font-style: normal;
    font-weight: 200 900;
    font-display: swap;
    src: url('/admin/assets/fonts/hubot-sans.woff2') format('woff2-variations');
  }
  @font-face {
    font-family: 'JetBrains Mono Variable';
    font-style: normal;
    font-weight: 100 800;
    font-display: swap;
    src: url('/admin/assets/fonts/jetbrains-mono.woff2') format('woff2-variations');
  }
`;

export const APP_CSS = `${TOKENS_CSS}\n${FONT_FACES}\n${STYLES}`;

// Content hash for the stylesheet URL, so the 1h asset cache never serves
// stale CSS after a deploy.
export const APP_CSS_VERSION = Bun.hash(APP_CSS).toString(36);

// Resolved and read once at module load — served as static bytes below, long
// cache. Each covers Latin-1 (U+0000-00FF), enough for German admin copy.
const FONT_MODULE_PATHS: Record<string, string> = {
  "nunito-sans.woff2":
    "@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2",
  "hubot-sans.woff2":
    "@fontsource-variable/hubot-sans/files/hubot-sans-latin-wght-normal.woff2",
  "jetbrains-mono.woff2":
    "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
};

const fontAssets = new Map<string, Uint8Array>(
  Object.entries(FONT_MODULE_PATHS).map(([name, specifier]) => [
    name,
    readFileSync(fileURLToPath(import.meta.resolve(specifier))),
  ]),
);

export function getFontAsset(name: string): Uint8Array | null {
  return fontAssets.get(name) ?? null;
}
