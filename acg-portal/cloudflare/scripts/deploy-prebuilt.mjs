// Deploy the Worker using an image that is already in Cloudflare's registry,
// so the deploying machine does not need Docker.
//
//   node scripts/deploy-prebuilt.mjs registry.cloudflare.com/<account-id>/acg-portal:<tag> [--dry-run]
//
// The image is built and pushed on a machine with Docker with:
//   npx wrangler containers build .. -t acg-portal:<tag> --push
//
// This writes wrangler.prebuilt.json (gitignored) — wrangler.jsonc with the
// container `image` replaced by that reference — and runs `wrangler deploy`
// with it. Everything else (routes, vars, bindings, migrations) is unchanged.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const IMAGE_REF = /^registry\.cloudflare\.com\/[a-z0-9]+\/[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9._-]+|@sha256:[a-f0-9]{64})$/;

/** wrangler.jsonc keeps comments on their own lines, so dropping those is enough. */
export function parseJsonc(text) {
  return JSON.parse(
    text
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n'),
  );
}

export function prebuiltConfig(config, imageRef) {
  if (!IMAGE_REF.test(imageRef)) {
    throw new Error('Image must be registry.cloudflare.com/<account-id>/<name>:<tag> (or @sha256:<digest>).');
  }
  if (!Array.isArray(config.containers) || config.containers.length !== 1) {
    throw new Error('Expected exactly one container in wrangler.jsonc.');
  }
  const out = structuredClone(config);
  out.containers[0].image = imageRef;
  delete out.containers[0].image_build_context;
  out.$schema = 'node_modules/wrangler/config-schema.json';
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [imageRef, ...rest] = process.argv.slice(2);
  if (!imageRef) {
    console.error('usage: node scripts/deploy-prebuilt.mjs <registry.cloudflare.com/...:tag> [--dry-run]');
    process.exit(2);
  }
  const config = prebuiltConfig(parseJsonc(readFileSync(join(root, 'wrangler.jsonc'), 'utf8')), imageRef);
  const outFile = join(root, 'wrangler.prebuilt.json');
  writeFileSync(outFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${outFile} with image ${imageRef}`);

  const dry = rest.includes('--dry-run');
  const args = ['wrangler', 'deploy', '-c', outFile, ...(dry ? ['--dry-run', '--outdir', 'dist'] : [])];
  const result = spawnSync('npx', args, { cwd: root, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
