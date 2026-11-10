import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs script without type declarations
import { parseJsonc, prebuiltConfig } from '../scripts/deploy-prebuilt.mjs';

const config = parseJsonc(readFileSync(join(__dirname, '..', 'wrangler.jsonc'), 'utf8'));

describe('wrangler.jsonc', () => {
  it('serves only the custom domain, one instance, no public preview URLs', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    expect(config.routes).toEqual([{ pattern: 'portal.acgroupinc.com', custom_domain: true }]);
    expect(config.vars.APP_HOSTNAME).toBe('portal.acgroupinc.com');
    expect(config.containers).toHaveLength(1);
    expect(config.containers[0].max_instances).toBe(1);
    expect(config.containers[0].class_name).toBe('PortalContainer');
    expect(config.durable_objects.bindings).toEqual([{ name: 'PORTAL', class_name: 'PortalContainer' }]);
  });

  it('uses the legacy migrations form and not `exports` (never both)', () => {
    expect(config.migrations).toEqual([{ tag: 'v1', new_sqlite_classes: ['PortalContainer'] }]);
    expect(config.exports).toBeUndefined();
  });

  it('holds no secrets', () => {
    const text = JSON.stringify(config);
    for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'DOCUMENT_URL_SECRET', 'postgresql://']) {
      expect(text).not.toContain(key);
    }
  });
});

describe('prebuiltConfig', () => {
  const ref = 'registry.cloudflare.com/0123abcd/acg-portal:abc123';

  it('swaps only the image for a registry reference', () => {
    const out = prebuiltConfig(config, ref);
    expect(out.containers[0].image).toBe(ref);
    expect(out.containers[0].image_build_context).toBeUndefined();
    expect({ ...out, containers: undefined, $schema: undefined }).toEqual({ ...config, containers: undefined, $schema: undefined });
    expect(config.containers[0].image).toBe('../Dockerfile'); // input untouched
  });

  it.each(['acg-portal:latest', 'docker.io/library/node:22', 'registry.cloudflare.com/acct/acg-portal', 'registry.cloudflare.com/acct/acg portal:1'])(
    'rejects anything but a tagged/digested Cloudflare registry image: %s',
    (bad) => {
      expect(() => prebuiltConfig(config, bad)).toThrow();
    },
  );
});
