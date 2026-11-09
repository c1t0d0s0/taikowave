/**
 * アイコンを作る: public/favicon.svg を元に、public/favicon.ico（16・32・48px）と
 * public/apple-touch-icon.png（180px、角丸なしの背景つき）を書き出す。
 * 使い方: npm run icons
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const pub = path.join(root, "public");
const svg = fs.readFileSync(path.join(pub, "favicon.svg"));

// iOS のホーム画面用: 透明な部分が黒くならないよう、お祭りの山吹色の背景に太鼓を載せる
const touchSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
	<defs>
		<radialGradient id="bg" cx="50%" cy="35%" r="75%">
			<stop offset="0" stop-color="#fff1c2"/>
			<stop offset="1" stop-color="#ffc531"/>
		</radialGradient>
	</defs>
	<rect width="180" height="180" fill="url(#bg)"/>
	<g fill="none" stroke="#e8380d" stroke-opacity="0.18" stroke-width="5">
		<circle cx="0" cy="180" r="44"/><circle cx="0" cy="180" r="64"/>
		<circle cx="180" cy="180" r="44"/><circle cx="180" cy="180" r="64"/>
		<circle cx="90" cy="200" r="44"/><circle cx="90" cy="200" r="64"/>
	</g>
	<image href="data:image/svg+xml;base64,${svg.toString("base64")}" x="18" y="16" width="144" height="144"/>
</svg>`);

await sharp(touchSvg).png().toFile(path.join(pub, "apple-touch-icon.png"));

// ICO（PNG を埋め込む形式。Windows Vista 以降・主要ブラウザが対応）
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const dir = Buffer.alloc(16 * sizes.length);
let offset = 6 + dir.length;
sizes.forEach((s, i) => {
	const o = i * 16;
	dir.writeUInt8(s, o);
	dir.writeUInt8(s, o + 1);
	dir.writeUInt8(0, o + 2);
	dir.writeUInt8(0, o + 3);
	dir.writeUInt16LE(1, o + 4);
	dir.writeUInt16LE(32, o + 6);
	dir.writeUInt32LE(pngs[i].length, o + 8);
	dir.writeUInt32LE(offset, o + 12);
	offset += pngs[i].length;
});
fs.writeFileSync(path.join(pub, "favicon.ico"), Buffer.concat([header, dir, ...pngs]));
console.log("public/favicon.ico, public/apple-touch-icon.png を書き出しました");
