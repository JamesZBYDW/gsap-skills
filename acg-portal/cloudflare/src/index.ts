// Cloudflare Worker + Durable Object that serve the ACG portal from a
// Cloudflare Container, using the Durable Object container API
// (`this.ctx.container`). The deprecated `@cloudflare/containers` SDK is not used.
//
// Request path: visitor → Cloudflare edge (portal.acgroupinc.com, TLS) →
// this Worker → the single Durable Object named "production" → its container
// on port 3000. The container exposes no public port of its own.

import { DurableObject } from 'cloudflare:workers';
import { handleRequest, PortalLifecycle, type PortalEnv } from './portal';

export interface Env extends PortalEnv {
  PORTAL: DurableObjectNamespace<PortalContainer>;
}

export class PortalContainer extends DurableObject<Env> {
  private readonly lifecycle: PortalLifecycle;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.lifecycle = new PortalLifecycle(ctx.container, env);
  }

  override fetch(request: Request): Promise<Response> {
    return this.lifecycle.fetch(request);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env, env.PORTAL);
  },
} satisfies ExportedHandler<Env>;
