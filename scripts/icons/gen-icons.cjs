// gen-icons.cjs - single source of truth for CardinalMap icons.
//
// Reads the canonical design from public/icons/apple-touch-icon.png (the
// iOS home-screen look: cardinal red gradient + white "N") and rasterizes
// the same design at every other size the app needs:
//   - favicon-32.png   (32x32,  browser tab / bookmark)
//   - icon-192.png     (192x192, Android Chrome manifest)
//   - icon-512.png     (512x512, Android Chrome splash)
//
// Also rewrites icon.svg so the vector source of truth matches the PNGs.
//
// Idempotent: run any number of times, same outputs. Pure Node + pngjs,
// no native deps. Located in scripts/icons/ so the icon tooling is
// isolated from the runtime app.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const ICONS_DIR = path.join(APP_ROOT, 'public', 'icons');
const SOURCE_PNG = path.join(ICONS_DIR, 'apple-touch-icon.png');
const OUT_SIZES = [
  { name: 'favicon-32.png',       size: 32  },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png',         size: 192 },
  { name: 'icon-512.png',         size: 512 },
];

// Bilinear interpolation. srcW/srcH is the source resolution; out is a
// zero-filled PNG of size outSize x outSize. Returns out after writing
// each destination pixel by sampling the four nearest source pixels
// weighted by area.
function resize(src, outSize) {
  const out = new PNG({ width: outSize, height: outSize });
  const sx = src.width  / outSize;
  const sy = src.height / outSize;
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      // Center-of-pixel sample box in source coordinates.
      const fx = (x + 0.5) * sx - 0.5;
      const fy = (y + 0.5) * sy - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const y0 = Math.max(0, Math.floor(fy));
      const x1 = Math.min(src.width  - 1, x0 + 1);
      const y1 = Math.min(src.height - 1, y0 + 1);
      const dx = fx - x0;
      const dy = fy - y0;
      // Four corners, weighted by opposite-area.
      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx       * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx       * dy;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [px, py, w] of [[x0, y0, w00], [x1, y0, w10], [x0, y1, w01], [x1, y1, w11]]) {
        const i = (py * src.width + px) << 2;
        r += src.data[i]     * w;
        g += src.data[i + 1] * w;
        b += src.data[i + 2] * w;
        a += src.data[i + 3] * w;
      }
      const o = (y * outSize + x) << 2;
      out.data[o]     = Math.round(r);
      out.data[o + 1] = Math.round(g);
      out.data[o + 2] = Math.round(b);
      out.data[o + 3] = Math.round(a);
    }
  }
  return out;
}

function loadSource() {
  if (!fs.existsSync(SOURCE_PNG)) {
    throw new Error(`source PNG not found: ${SOURCE_PNG}\n` +
      `expected public/icons/apple-touch-icon.png to exist as the design source.`);
  }
  return PNG.sync.read(fs.readFileSync(SOURCE_PNG));
}

// Vector source of truth - same design as the apple-touch-icon.png:
// cardinal red gradient + faint compass crosshatch + bold white "N".
// Matched to the PNG so browsers that prefer SVG (e.g. modern Firefox
// tab icon) and those that want a raster (Safari pinned tab, manifest
// fallback) see identical artwork.
function writeSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c8102e"/>
      <stop offset="1" stop-color="#8c0a1e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <g stroke="rgba(255,255,255,0.25)" stroke-width="3" fill="none">
    <line x1="256" y1="92" x2="256" y2="420"/>
    <line x1="92" y1="256" x2="420" y2="256"/>
  </g>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central"
        font-family="Arial Black, Arial, sans-serif" font-weight="900"
        font-size="340" fill="#ffffff">N</text>
</svg>
`;
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.svg'), svg);
}

function main() {
  const src = loadSource();
  console.log(`source ${path.basename(SOURCE_PNG)}: ${src.width}x${src.height}`);
  for (const { name, size } of OUT_SIZES) {
    const out = (size === src.width && size === src.height)
      ? PNG.sync.read(fs.readFileSync(SOURCE_PNG))
      : resize(src, size);
    fs.writeFileSync(path.join(ICONS_DIR, name), PNG.sync.write(out));
    console.log(`wrote ${name} (${size}x${size})`);
  }
  writeSvg();
  console.log('wrote icon.svg');
}

if (require.main === module) main();
module.exports = { resize, loadSource };
