'use strict';

// Generates app icons from assets/icon.svg:
//   assets/icon.png  (1024×1024) — electron-builder source for Linux + auto-derives others
//   assets/icon.ico  (multi-size) — Windows NSIS installer + app
//   electron/icon.png (512×512)   — BrowserWindow runtime icon
//
// The generated assets are committed, so a normal build consumes them directly —
// you only need to re-run this when the source SVG changes.
//
// Requires two image tools that are intentionally NOT in package.json (they pull a
// heavy native binary and are unused by the app/Vercel build):
//   npm install --no-save sharp png-to-ico
// then: npm run gen:icons

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icon.svg');

async function main() {
  const svg = fs.readFileSync(SVG);

  // Master 1024×1024 PNG (Linux icon + electron-builder auto-generation source)
  const masterPng = path.join(ROOT, 'assets', 'icon.png');
  await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(masterPng);
  console.log('wrote', path.relative(ROOT, masterPng));

  // Runtime window icon (512×512)
  const winPng = path.join(ROOT, 'electron', 'icon.png');
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(winPng);
  console.log('wrote', path.relative(ROOT, winPng));

  // Windows .ico — bundle the standard set of sizes
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map(s => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
  );
  const icoBuffer = await pngToIco(pngBuffers);
  const icoPath = path.join(ROOT, 'assets', 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('wrote', path.relative(ROOT, icoPath));
}

main().catch(err => { console.error(err); process.exit(1); });
