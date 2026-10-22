/* Rebuild the authored vector identity and its raster exports: node scripts/generate-brand.mjs */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import fontkitModule from "next/dist/compiled/@next/font/dist/fontkit/index.js";

const fontkit = fontkitModule.default;

const root = fileURLToPath(new URL("../", import.meta.url));
const brand = path.join(root, "public/brand");
// Asset colours mirror the existing neutral UI; this generator never edits UI styles.
const colors = { ink: "#0a0a0a", primary: "#171717", paper: "#ffffff", surface: "#f5f5f5", border: "#e5e5e5", muted: "#737373" };

// The rising orbit doubles as the A's crossbar; its final node carries the signal on.
function mark(ink, node) {
  return `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="34" rx="27" ry="10" transform="rotate(-24 32 34)" stroke-width="2" opacity=".32"/>
    <path d="M17 49 29.2 16.3Q32 10.1 34.8 16.3L48 49" stroke-width="5.5"/>
    <path d="M9.5 41.3c-1.4 5.5 9.5 5.5 22.5-.2 9.1-4 16.6-9.6 20-14.4" stroke-width="3.5"/>
    <circle cx="52" cy="26.7" r="4.3" fill="${node}" stroke="none"/>
  </g>`;
}

function svg(width, height, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${label ? ` role="img" aria-label="${label}"` : ""}>${body}</svg>\n`;
}

let font;
function text(value, x, y, size, fill, weight = 500, tracking = -0.025) {
  const face = font;
  const run = face.layout(value);
  const scale = size / face.unitsPerEm;
  let advance = 0;
  const paths = run.glyphs.map((glyph, i) => {
    const position = run.positions[i];
    const result = `<path d="${glyph.path.toSVG()}" transform="translate(${advance + position.xOffset} ${position.yOffset})"/>`;
    advance += position.xAdvance + tracking * face.unitsPerEm;
    return result;
  }).join("");
  return `<g fill="${fill}" stroke="${fill}" stroke-width="${Math.max(0, weight - 400) * 0.09}" stroke-linejoin="round" transform="translate(${x} ${y}) scale(${scale} ${-scale})">${paths}</g>`;
}

async function png(source, target, size) {
  let pipeline = sharp(Buffer.from(source));
  if (size) pipeline = pipeline.resize(size, size);
  await pipeline.png().withExif({ IFD0: { ImageDescription: "Afterlife original identity. Source: web/scripts/generate-brand.mjs; outlined Geist lettering." } }).toFile(target);
}

async function main() {
  await fs.mkdir(brand, { recursive: true });
  font = fontkit(await fs.readFile(path.join(root, "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf")));

  const symbol = svg(64, 64, mark(colors.primary, colors.primary), "Afterlife");
  await fs.writeFile(path.join(brand, "mark.svg"), symbol);
  const logo = svg(298, 72, `<g transform="translate(0 4)">${mark(colors.primary, colors.primary)}</g>${text("Afterlife", 78, 49, 43, colors.ink, 650, -0.04)}`, "Afterlife");
  await fs.writeFile(path.join(brand, "logo.svg"), logo);
  await png(logo, path.join(brand, "logo.png"));
  await fs.writeFile(path.join(brand, "logo-light.svg"), svg(298, 72, `<g transform="translate(0 4)">${mark(colors.paper, colors.paper)}</g>${text("Afterlife", 78, 49, 43, colors.paper, 650, -0.04)}`, "Afterlife"));

  const icon = svg(64, 64, `<rect x=".5" y=".5" width="63" height="63" rx="14.5" fill="${colors.paper}" stroke="${colors.border}"/><g transform="translate(4 4) scale(.875)">${mark(colors.primary, colors.primary)}</g>`);
  await fs.writeFile(path.join(root, "app/icon.svg"), icon);
  await png(icon, path.join(brand, "icon-192.png"), 192);
  await png(icon, path.join(brand, "icon-512.png"), 512);
  const maskable = svg(64, 64, `<rect width="64" height="64" fill="${colors.paper}"/><g transform="translate(10 10) scale(.6875)">${mark(colors.primary, colors.primary)}</g>`);
  await png(maskable, path.join(brand, "icon-maskable-512.png"), 512);
  await png(maskable, path.join(root, "app/apple-icon.png"), 180);

  // A PNG-backed, multi-resolution ICO without an extra build dependency.
  const frames = await Promise.all([16, 32, 48].map(size => sharp(Buffer.from(icon)).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, i) => {
    const at = 6 + i * 16;
    header[at] = header[at + 1] = [16, 32, 48][i];
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(frame.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += frame.length;
  });
  await fs.writeFile(path.join(root, "app/favicon.ico"), Buffer.concat([header, ...frames]));

  // The constellation is an authored brand motif, not a representation of archive data.
  const stars = [[814,147,3],[1032,112,4],[1118,231,3],[931,265,5],[760,314,3],[1084,379,4],[911,457,3],[1141,510,3],[778,519,2.5]];
  const lines = [[0,1],[0,3],[1,2],[2,3],[2,5],[3,4],[3,5],[3,6],[4,6],[5,7],[6,7],[6,8]].map(([a,b]) => `<path d="M${stars[a][0]} ${stars[a][1]} ${stars[b][0]} ${stars[b][1]}"/>`).join("");
  const card = svg(1200, 630,
    `<rect width="1200" height="630" fill="${colors.paper}"/>
    <g stroke="${colors.primary}" stroke-width="1" opacity=".13">${lines}</g>
    <g fill="${colors.muted}">${stars.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>
    <circle cx="932" cy="316" r="145" fill="${colors.surface}"/>
    <g transform="translate(803 187) scale(4)">${mark(colors.primary, colors.primary)}</g>
    <g transform="translate(56 46) scale(.86)">${mark(colors.primary, colors.primary)}</g>
    ${text("Afterlife", 124, 87, 38, colors.ink, 650, -0.04)}
    ${text("Good ideas deserve", 64, 248, 59, colors.ink, 600, -0.04)}
    ${text("an afterlife.", 64, 322, 76, colors.ink, 600, -0.04)}
    ${text("Explore London hackathon projects", 66, 399, 25, colors.muted, 400, -0.015)}
    ${text("and the people behind them.", 66, 435, 25, colors.muted, 400, -0.015)}
    <path d="M64 515H1136" stroke="${colors.border}"/>
    ${text("The event ends. The connections continue.", 66, 563, 21, colors.ink, 500, -0.015)}`,
    "Afterlife — Good ideas deserve an afterlife.");
  await fs.writeFile(path.join(brand, "social-card.svg"), card);
  await png(card, path.join(brand, "social-card.png"));
  console.log("Generated Afterlife logo, favicon, app icons, and 1200 × 630 social card.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
