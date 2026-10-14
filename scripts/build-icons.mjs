// Orbit icon pipeline: ONE vector source (knotSvg) -> every PNG size.
// Usage: node scripts/build-icons.mjs [a|b|c] [--variants]
// Change the look by editing VARIANTS / the geometry constants below, then re-run.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const VER = 'v8';
const CREAM = '#F5EADA';

// Knot geometry: two perpendicular ellipses woven over/under (4 crossings), same form as the old mark.
const A = 152, B = 76, W = 54, D = 97; // semi-axes, stroke, crossing distance from centre

const VARIANTS = {
  // a: four rings in four theme colours on a raised cream tile
  a: { tile: ['#FFFFFF', '#FFF7EA', '#F6E2C8'], lobes: ['#FF5A3C', '#7C4DFF', '#FFB400', '#00B37E'], shadow: '#B2492F', glyph: '#7C4DFF', edge: '#EAD3B5' },
  // b: one ribbon, sunset-to-rainbow gradient, on a deep ink tile
  b: { tile: ['#3A2573', '#2A1A55', '#1B1035'], ribbon: ['#FF4F8B', '#FF5A3C', '#FFB400', '#00D08E', '#4C8BFF', '#8F63FF'], shadow: '#0E0620', glyph: '#FFB400' },
  // c: colourful knot on a coral -> violet tile
  // dark: variant a on a near-black neutral tile, rings lifted one step for contrast
  dark: { tile: ['#17151C', '#100E14', '#08070B'], lobes: ['#FF6A4D', '#9F82FF', '#FFC62E', '#22D49B'], shadow: '#000000', glyph: '#FFF7EA', edge: '#3A3840', rim: 0.28, gloss: 0.05 },
  c: { tile: ['#FF7A59', '#FF5A3C', '#7C4DFF'], lobes: ['#FFF7EA', '#FFD84A', '#52E8B4', '#FFA7D1'], shadow: '#5B2BC0', glyph: '#FFF7EA' },
};

function knotSvg(v, { size = 512, mode = 'any', scale = 1, glyph = null } = {}) {
  const c = VARIANTS[v];
  const half = (end) => end === 0
    ? `M256 ${256 - B}A${A} ${B} 0 0 1 256 ${256 + B}`
    : `M256 ${256 + B}A${A} ${B} 0 0 1 256 ${256 - B}`;
  // ellipse rotated +45deg: ends = [BR(+a), TL(-a)]; rotated -45deg: [TR(+a), BL(-a)]
  const ell = (rot, fills) => `<g transform="rotate(${rot} 256 256)">
      <ellipse cx="256" cy="256" rx="${A}" ry="${B}" fill="none" stroke="${c.shadow}" stroke-opacity=".3" stroke-width="${W + 8}"/>
      ${[0, 1].map((e) => `<path d="${half(e)}" fill="none" stroke="${fills[e]}" stroke-width="${W}"/>`).join('')}
      <ellipse cx="256" cy="${256 - 8}" rx="${A}" ry="${B}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="${W * 0.2}"/>
    </g>`;
  const L = c.lobes;
  const fill1 = L ? [`url(#l2)`, `url(#l0)`] : ['url(#rib)', 'url(#rib)']; // BR, TL
  const fill2 = L ? [`url(#l1)`, `url(#l3)`] : ['url(#rib)', 'url(#rib)']; // TR, BL
  const knot = `
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <g filter="url(#drop)">${ell(45, fill1)}</g>
      <g filter="url(#drop)">${ell(-45, fill2)}</g>
      <g clip-path="url(#over)" filter="url(#drop)">${ell(45, fill1)}</g>
    </g>`;
  const glyphSvg = glyph === 'plus'
    ? `<path d="M256 150V362M150 256H362" stroke="${c.glyph}" stroke-width="44" stroke-linecap="round"/>`
    : glyph === 'cal'
    ? `<g fill="none" stroke="${c.glyph}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"><rect x="132" y="156" width="248" height="226" rx="52"/><path d="M132 226H380M196 126V176M316 126V176M200 302l42 42 76-84"/></g>`
    : null;
  const full = mode === 'maskable';
  const tile = full
    ? `<rect width="512" height="512" fill="url(#tile)"/>`
    : `<rect x="28" y="22" width="456" height="456" rx="118" fill="${c.shadow}" opacity=".0"/>
       <rect x="24" y="24" width="464" height="464" rx="120" fill="url(#tile)" filter="url(#lift)"/>
       <rect x="27" y="27" width="458" height="458" rx="117" fill="none" stroke="url(#rim)" stroke-width="6"/>
       ${c.edge ? `<rect x="24.5" y="24.5" width="463" height="463" rx="119.5" fill="none" stroke="${c.edge}" stroke-width="2"/>` : ''}`;
  const gloss = full ? '' : `<ellipse cx="190" cy="78" rx="160" ry="46" fill="#fff" opacity="${c.gloss ?? 0.16}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.tile[0]}"/><stop offset=".5" stop-color="${c.tile[1]}"/><stop offset="1" stop-color="${c.tile[2]}"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${c.rim ?? 0.6}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    ${c.ribbon ? `<linearGradient id="rib" gradientUnits="userSpaceOnUse" x1="100" y1="400" x2="412" y2="112">${c.ribbon.map((col, i) => `<stop offset="${i / (c.ribbon.length - 1)}" stop-color="${col}"/>`).join('')}</linearGradient>` : ''}
    ${(c.lobes ?? []).map((col, i) => `<linearGradient id="l${i}" gradientUnits="userSpaceOnUse" x1="${i % 2 ? 420 : 90}" y1="${i < 2 ? 90 : 420}" x2="${i % 2 ? 300 : 210}" y2="${i < 2 ? 210 : 300}"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity=".82"/></linearGradient>`).join('')}
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="${c.shadow}" flood-opacity=".38"/></filter>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="${c.shadow}" flood-opacity=".5"/></filter>
    <clipPath id="over"><circle cx="${256 + D}" cy="256" r="52"/><circle cx="${256 - D}" cy="256" r="52"/></clipPath>
  </defs>
  ${tile}${gloss}
  ${glyphSvg ?? knot}
</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 96 }).resize(size, size).png().toBuffer();

async function writeAll(v) {
  const w = async (name, svg, size) => writeFileSync(join(PUB, name), await png(svg, size));
  const any = knotSvg(v, { size: 1024 });
  await w(`orbit-icon-${VER}-master.png`, any, 1254);
  await w(`orbit-icon-${VER}-512.png`, any, 512);
  await w(`orbit-icon-${VER}-192.png`, any, 192);
  await w(`orbit-apple-touch-${VER}.png`, knotSvg(v, { mode: 'maskable', size: 1024 }), 180);
  await w(`orbit-favicon-${VER}.png`, knotSvg(v, { size: 256 }), 64);
  await w(`orbit-mark-${VER}-96.png`, any, 96);
  const mask = knotSvg(v, { mode: 'maskable', size: 1024, scale: 0.9 });
  await w('icon-maskable-512.png', mask, 512);
  await w('icon-maskable-192.png', mask, 192);
  await w('icon-512.png', any, 512);
  await w('icon-192.png', any, 192);
  await w('apple-touch-icon.png', knotSvg(v, { mode: 'maskable', size: 1024 }), 180);
  await w('favicon.png', knotSvg(v, { size: 256 }), 64);
  await w('shortcuts/new-task-96.png', knotSvg(v, { size: 384, glyph: 'plus' }), 96);
  await w('shortcuts/program-96.png', knotSvg(v, { size: 384, glyph: 'cal' }), 96);
  const c = VARIANTS[v];
  for (const [pw, ph] of [[1170, 2532], [1290, 2796]]) {
    const s = Math.round(315 * pw / 1170);
    const ic = await png(any, s);
    await sharp({ create: { width: pw, height: ph, channels: 3, background: CREAM } })
      .composite([{ input: ic, left: Math.round((pw - s) / 2), top: Math.round(ph / 2 - s / 2) }])
      .png().toFile(join(PUB, `splash/apple-splash-${pw}x${ph}.png`));
  }
  writeFileSync(join(PUB, 'favicon.svg'), knotSvg(v, { size: 512 }));
}

async function writeDark() {
  const v = 'dark';
  const w = async (name, svg, size) => writeFileSync(join(PUB, name), await png(svg, size));
  const any = knotSvg(v, { size: 1024 });
  const full = knotSvg(v, { mode: 'maskable', size: 1024 });
  await w(`orbit-icon-dark-${VER}-512.png`, any, 512);
  await w(`orbit-icon-dark-${VER}-192.png`, any, 192);
  await w(`orbit-favicon-dark-${VER}.png`, knotSvg(v, { size: 256 }), 64);
  await w(`orbit-apple-touch-dark-${VER}.png`, full, 180);
  await w(`orbit-mark-dark-${VER}-96.png`, any, 96);
  const mask = knotSvg(v, { mode: 'maskable', size: 1024, scale: 0.9 });
  await w(`icon-maskable-dark-${VER}-512.png`, mask, 512);
  await w(`icon-maskable-dark-${VER}-192.png`, mask, 192);
  for (const [pw, ph] of [[1170, 2532], [1290, 2796]]) {
    const s = Math.round(315 * pw / 1170);
    await sharp({ create: { width: pw, height: ph, channels: 3, background: '#0B0A0F' } })
      .composite([{ input: await png(any, s), left: Math.round((pw - s) / 2), top: Math.round(ph / 2 - s / 2) }])
      .png().toFile(join(PUB, `splash/apple-splash-dark-${pw}x${ph}.png`));
  }
}

async function variantSheets() {
  const out = join(ROOT, '.ekip/ekran/ikon');
  mkdirSync(out, { recursive: true });
  for (const v of Object.keys(VARIANTS)) {
    const big = await png(knotSvg(v, { size: 1024 }), 400);
    const mid = await png(knotSvg(v, { size: 512 }), 96);
    const small = await png(knotSvg(v, { size: 256 }), 48);
    await sharp({ create: { width: 640, height: 440, channels: 3, background: CREAM } })
      .composite([{ input: big, left: 20, top: 20 }, { input: mid, left: 460, top: 40 }, { input: small, left: 484, top: 170 }])
      .png().toFile(join(out, `varyant-${v}.png`));
  }
}

const args = process.argv.slice(2);
const v = args.find((a) => VARIANTS[a]) ?? 'a';
if (args.includes('--variants')) await variantSheets();
else if (v === 'dark') await writeDark();
else await writeAll(v);
