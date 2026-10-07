import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('public/tenants/pecas/products');
const files = await readdir(root);
for (const file of files) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const input = path.join(root, file);
  const info = await stat(input);
  if (info.size < 80 * 1024) continue;
  const output = path.join(root, file.replace(/(?:\.png)?\.(png|jpe?g)$/i, '.webp'));
  await sharp(input).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(output);
  const optimized = await stat(output);
  console.log(`${file}: ${Math.round(info.size / 1024)} KB -> ${Math.round(optimized.size / 1024)} KB`);
}
