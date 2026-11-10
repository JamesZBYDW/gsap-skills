// Runtime-agnostic core of the Worker in front of the portal container.
//
// Everything with a decision in it lives here, behind small structural
// interfaces, so it can be unit-tested in Node without workerd. `index.ts`
// wires these to the real Durable Object + `ctx.container` API.

/** The one Durable Object (and so the one container) that serves the portal. */
export const INSTANCE_NAME = 'production';

/** Port the Next.js standalone server listens on inside the container. */
export const APP_PORT = 3000;

/** How long to wait for a cold container to start answering HTTP. */
export const READY_TIMEOUT_MS = 90_000;
export const READY_POLL_MS = 250;

export interface PortalEnv {
  /** Public hostname, e.g. portal.acgroupinc.com (a `vars` entry). */
  APP_HOSTNAME: string;
  /** Minutes without traffic before the container is stopped (a `vars` entry). */
  IDLE_TIMEOUT_MINUTES?: string;
  // Worker secrets — set with `wrangler secret put`, never in config or source.
  DATABASE_URL?: string;
  SESSION_SECRET?: string;
  DOCUMENT_URL_SECRET?: string;
}

// ─── Configuration checks ─────────────────────────────────────────────────

const LOCAL_DB_HOSTS = new Set(['localhost', 'db', 'postgres', '0.0.0.0', '::1', '[::1]']);

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return LOCAL_DB_HOSTS.has(h) || h.startsWith('127.') || h.endsWith('.local') || h.endsWith('.internal');
}

/**
 * Returns the names of misconfigured settings — never their values, so the
 * result is safe to log. Empty means the container may be started.
 */
export function configProblems(env: PortalEnv): string[] {
  const problems: string[] = [];

  if (!env.APP_HOSTNAME || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(env.APP_HOSTNAME)) {
    problems.push('APP_HOSTNAME (must be the public hostname)');
  }

  for (const key of ['SESSION_SECRET', 'DOCUMENT_URL_SECRET'] as const) {
    if (!env[key] || env[key]!.length < 32) problems.push(`${key} (secret missing or shorter than 32 chars)`);
  }
  if (env.SESSION_SECRET && env.SESSION_SECRET === env.DOCUMENT_URL_SECRET) {
    problems.push('DOCUMENT_URL_SECRET (must differ from SESSION_SECRET)');
  }

  if (!env.DATABASE_URL) {
    problems.push('DATABASE_URL (secret missing)');
  } else {
    let url: URL | null = null;
    try {
      url = new URL(env.DATABASE_URL);
    } catch {
      problems.push('DATABASE_URL (not a valid URL)');
    }
    if (url) {
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        problems.push('DATABASE_URL (must be a postgresql:// URL)');
      }
      // The container's disk is ephemeral: the database must be an external,
      // managed Postgres — never one inside or beside the container.
      if (!url.hostname || isLocalHost(url.hostname)) {
        problems.push('DATABASE_URL (host must be an external managed Postgres)');
      }
      // Prisma's `sslmode=require` alone encrypts but does NOT verify the
      // server certificate; `sslaccept=strict` makes it verify against the
      // system CA store (or `sslcert`).
      if (url.searchParams.get('sslmode') !== 'require') {
        problems.push('DATABASE_URL (needs sslmode=require)');
      }
      if (url.searchParams.get('sslaccept') !== 'strict') {
        problems.push('DATABASE_URL (needs sslaccept=strict)');
      }
    }
  }

  return problems;
}

export function idleTimeoutMs(env: PortalEnv): number {
  const minutes = Number(env.IDLE_TIMEOUT_MINUTES ?? '30');
  const clamped = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 1), 360) : 30;
  return Math.round(clamped * 60_000);
}

/** The complete, explicit environment handed to the container process. */
export function containerEnv(env: PortalEnv): Record<string, string> {
  return {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(APP_PORT),
    HOSTNAME: '0.0.0.0',
    APP_URL: `https://${env.APP_HOSTNAME}`,
    DATABASE_URL: env.DATABASE_URL!,
    SESSION_SECRET: env.SESSION_SECRET!,
    DOCUMENT_URL_SECRET: env.DOCUMENT_URL_SECRET!,
    // Migrations are applied from an operator's machine before a release,
    // not on every cold start (see CLOUDFLARE_CONTAINERS_DEPLOY.md).
    MIGRATE_ON_START: '0',
    // The start script refuses to boot against a local/unverified database.
    REQUIRE_EXTERNAL_DATABASE: '1',
  };
}

// ─── Edge request handling ────────────────────────────────────────────────

/**
 * Headers a visitor could send to impersonate a proxy. They are removed and
 * the trusted values re-derived. `x-middleware-subrequest` is Next.js-internal
 * and must never arrive from outside.
 */
const UNTRUSTED_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'true-client-ip',
  'forwarded',
  'x-middleware-subrequest',
];

export interface StubLike {
  fetch(request: Request): Promise<Response>;
}
export interface NamespaceLike {
  getByName(name: string): StubLike;
}

/**
 * Same method, headers and (streamed) body at a new URL, never following
 * redirects. Built from the Request itself so the body is not buffered.
 */
export function retarget(request: Request, url: string, headers?: Headers): Request {
  const moved = new Request(url, request);
  return new Request(moved, headers ? { redirect: 'manual', headers } : { redirect: 'manual' });
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

/**
 * Worker entry logic: accept only the configured hostname, force HTTPS,
 * normalise forwarding headers, and send everything to the single instance.
 */
export async function handleRequest(request: Request, env: PortalEnv, ns: NamespaceLike): Promise<Response> {
  const url = new URL(request.url);

  // Only the configured hostname is served (workers.dev, preview URLs and any
  // other route get a 404 even if they are ever enabled by mistake).
  if (!env.APP_HOSTNAME || url.hostname.toLowerCase() !== env.APP_HOSTNAME.toLowerCase()) {
    return notFound();
  }

  if (url.protocol !== 'https:') {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 308);
  }

  const headers = new Headers(request.headers);
  for (const h of UNTRUSTED_HEADERS) headers.delete(h);

  // On Cloudflare, CF-Connecting-IP is set by the edge and cannot be supplied
  // by the visitor; it is the only client-IP source passed on.
  const visitorIp = request.headers.get('cf-connecting-ip');
  if (visitorIp) {
    headers.set('x-forwarded-for', visitorIp);
  } else {
    headers.delete('cf-connecting-ip');
  }
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-forwarded-host', env.APP_HOSTNAME);

  return ns.getByName(INSTANCE_NAME).fetch(retarget(request, url.toString(), headers));
}

// ─── Container lifecycle (inside the Durable Object) ──────────────────────

/** The subset of `ctx.container` this module uses. */
export interface ContainerLike {
  readonly running: boolean;
  start(options: { enableInternet: boolean; env: Record<string, string> }): void;
  monitor(): Promise<void>;
  setInactivityTimeout(durationMs: number): Promise<void>;
  getTcpPort(port: number): { fetch(request: Request): Promise<Response> };
}

export interface LifecycleDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

const plain = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store', ...extra } });

/**
 * Starts the container on demand (once, however many requests arrive
 * together), waits until the app answers on APP_PORT, and forwards requests
 * with the public hostname as the Host so the app's same-origin check holds.
 */
export class PortalLifecycle {
  private startup: Promise<void> | null = null;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  constructor(
    private readonly container: ContainerLike | undefined,
    private readonly env: PortalEnv,
    deps: LifecycleDeps = {},
  ) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.log ?? ((m) => console.log(m));

    // After a Durable Object restart the container may still be running:
    // re-attach the exit watcher and the idle timer, which do not survive.
    if (container?.running) {
      this.watchExit();
      container.setInactivityTimeout(idleTimeoutMs(env)).catch(() => {});
    }
  }

  async fetch(request: Request): Promise<Response> {
    const container = this.container;
    if (!container) {
      this.log('portal: no container is bound to this Durable Object');
      return plain(500, 'Portal is misconfigured.');
    }

    const problems = configProblems(this.env);
    if (problems.length) {
      this.log(`portal: refusing to start, invalid settings: ${problems.join('; ')}`);
      return plain(503, 'Portal is not configured.', { 'retry-after': '60' });
    }

    try {
      await this.ensureReady(container);
    } catch (err) {
      this.log(`portal: container did not become ready: ${errorName(err)}`);
      return plain(503, 'Portal is starting. Please retry shortly.', { 'retry-after': '5' });
    }

    try {
      return await container.getTcpPort(APP_PORT).fetch(this.toContainerRequest(request));
    } catch (err) {
      if (!container.running) this.startup = null;
      this.log(`portal: request to container failed: ${errorName(err)}`);
      return plain(502, 'Portal is temporarily unavailable. Please retry.', { 'retry-after': '5' });
    }
  }

  /** Rebuilds the request with the public host; headers/body/method preserved. */
  toContainerRequest(request: Request): Request {
    const incoming = new URL(request.url);
    const target = `http://${this.env.APP_HOSTNAME}${incoming.pathname}${incoming.search}`;
    return retarget(request, target);
  }

  private ensureReady(container: ContainerLike): Promise<void> {
    if (!container.running) this.startup = null;
    if (!this.startup) {
      this.startup = this.boot(container).catch((err) => {
        this.startup = null;
        throw err;
      });
    }
    return this.startup;
  }

  private async boot(container: ContainerLike): Promise<void> {
    if (!container.running) {
      this.log('portal: starting container');
      container.start({ enableInternet: true, env: containerEnv(this.env) });
      this.watchExit();
    }
    await container.setInactivityTimeout(idleTimeoutMs(this.env));
    await this.waitUntilServing(container);
  }

  private watchExit(): void {
    this.container!.monitor().then(
      () => {
        this.startup = null;
        this.log('portal: container stopped');
      },
      (err: unknown) => {
        this.startup = null;
        const code = (err as { exitCode?: number })?.exitCode;
        this.log(`portal: container exited${code === undefined ? '' : ` with code ${code}`}`);
      },
    );
  }

  private async waitUntilServing(container: ContainerLike): Promise<void> {
    const deadline = this.now() + READY_TIMEOUT_MS;
    for (;;) {
      try {
        const res = await container
          .getTcpPort(APP_PORT)
          .fetch(new Request(`http://${this.env.APP_HOSTNAME}/login`, { method: 'GET', redirect: 'manual' }));
        if (res.status < 500) return;
      } catch {
        // Not listening yet.
      }
      if (!container.running) throw new Error('ContainerExited');
      if (this.now() >= deadline) throw new Error('ReadyTimeout');
      await this.sleep(READY_POLL_MS);
    }
  }
}

function errorName(err: unknown): string {
  // Error names/messages from the runtime, never request or config contents.
  if (err instanceof Error) return err.message.slice(0, 200) || err.name;
  return 'unknown error';
}
