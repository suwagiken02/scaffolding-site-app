import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public");
await mkdir(publicDir, { recursive: true });

// Design spec:
// - bg: #1a1a1a, rounded 90px
// - scaffold pipes: #FF6B35 (outer frame + mid beam)
// - plank: #FF8C55
// - text: "諏訪" "技建" #FF6B35, 92px, rounded gothic (fallback to installed fonts)
// - viewBox: 0 0 680 680
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="680" height="680" viewBox="0 0 680 680">
  <defs>
    <style>
      .t { font-family: "Noto Sans JP", "Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif; font-weight: 700; }
    </style>
  </defs>
  <rect x="0" y="0" width="680" height="680" rx="90" ry="90" fill="#1a1a1a"/>

  <!-- scaffold frame -->
  <rect x="120" y="120" width="440" height="440" rx="26" ry="26" fill="none" stroke="#FF6B35" stroke-width="28"/>
  <!-- mid beam -->
  <line x1="150" y1="340" x2="530" y2="340" stroke="#FF6B35" stroke-width="22" stroke-linecap="round"/>
  <!-- plank -->
  <rect x="170" y="390" width="340" height="62" rx="18" ry="18" fill="#FF8C55"/>

  <!-- text -->
  <text x="340" y="305" text-anchor="middle" class="t" font-size="92" fill="#FF6B35" letter-spacing="6">諏訪</text>
  <text x="340" y="520" text-anchor="middle" class="t" font-size="92" fill="#FF6B35" letter-spacing="6">技建</text>
</svg>`;

async function render(size) {
  const outPath = path.join(publicDir, `icon-${size}.png`);
  const png = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
  await writeFile(outPath, png);
  console.log("written", outPath);
}

await render(192);
await render(512);

