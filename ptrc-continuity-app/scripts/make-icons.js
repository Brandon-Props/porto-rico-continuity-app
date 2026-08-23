const sharp = require('sharp');
const path = require('path');

const svgPath = path.join(__dirname, 'icon.svg');
const outDir = path.join(__dirname, '..', 'public', 'icons');

async function run() {
  await sharp(svgPath).resize(192, 192).png().toFile(path.join(outDir, 'icon-192.png'));
  await sharp(svgPath).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'));
  // Maskable: pad with background color so safe-zone cropping doesn't clip the mark
  await sharp(svgPath)
    .resize(400, 400)
    .extend({ top: 56, bottom: 56, left: 56, right: 56, background: '#12161c' })
    .png()
    .toFile(path.join(outDir, 'icon-512-maskable.png'));
  await sharp(svgPath).resize(32, 32).png().toFile(path.join(__dirname, '..', 'public', 'favicon.png'));
  console.log('icons generated');
}
run().catch((e) => { console.error(e); process.exit(1); });
