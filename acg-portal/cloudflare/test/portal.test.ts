import { describe, it, expect, vi } from 'vitest';
import {
  APP_PORT,
  INSTANCE_NAME,
  PortalLifecycle,
  configProblems,
  containerEnv,
  handleRequest,
  idleTimeoutMs,
  safeExitCode,
  type ContainerLike,
  type NamespaceLike,
  type PortalEnv,
} from '../src/portal';

const HOST = 'portal.acgroupinc.com';

const goodEnv = (over: Partial<PortalEnv> = {}): PortalEnv => ({
  APP_HOSTNAME: HOST,
  IDLE_TIMEOUT_MINUTES: '30',
  DATABASE_URL: 'postgresql://app:pw@db.example-provider.com:5432/acg_portal?sslmode=require&sslaccept=strict',
  SESSION_SECRET: 's'.repeat(64),
  DOCUMENT_URL_SECRET: 'd'.repeat(64),
  ...over,
});

/** Records which instance names were asked for and the requests they got. */
function fakeNamespace() {
  const names: string[] = [];
  const requests: Request[] = [];
  const ns: NamespaceLike = {
    getByName(name) {
      names.push(name);
      return {
        async fetch(req) {
          requests.push(req);
          return new Response('from-do', { status: 200 });
        },
      };
    },
  };
  return { ns, names, requests };
}

// ─── Worker entry: hostname, HTTPS, headers, single instance ──────────────

describe('handleRequest', () => {
  it('routes every accepted request to the one named instance', async () => {
    const { ns, names } = fakeNamespace();
    for (const path of ['/login', '/portal/overview', '/api/auth/login', '/_next/static/x.js']) {
      const res = await handleRequest(new Request(`https://${HOST}${path}`), goodEnv(), ns);
      expect(res.status).toBe(200);
    }
    expect(names).toEqual([INSTANCE_NAME, INSTANCE_NAME, INSTANCE_NAME, INSTANCE_NAME]);
    expect(INSTANCE_NAME).toBe('production');
  });

  it.each([
    'https://acg-portal.someone.workers.dev/login',
    'https://evil.example.com/login',
    'https://portal.acgroupinc.com.evil.example/login',
    'https://acgroupinc.com/login',
  ])('rejects other hostnames without touching the container: %s', async (url) => {
    const { ns, names } = fakeNamespace();
    const res = await handleRequest(new Request(url), goodEnv(), ns);
    expect(res.status).toBe(404);
    expect(names).toEqual([]);
  });

  it('redirects plain HTTP to HTTPS on the same path', async () => {
    const { ns, names } = fakeNamespace();
    const res = await handleRequest(new Request(`http://${HOST}/portal/overview?x=1`), goodEnv(), ns);
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`https://${HOST}/portal/overview?x=1`);
    expect(names).toEqual([]);
  });

  it('drops spoofable forwarding headers and forwards only the edge-set visitor IP', async () => {
    const { ns, requests } = fakeNamespace();
    await handleRequest(
      new Request(`https://${HOST}/api/auth/login`, {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '10.0.0.1',
          'x-real-ip': '10.0.0.2',
          'true-client-ip': '10.0.0.3',
          forwarded: 'for=10.0.0.4',
          'x-forwarded-host': 'evil.example.com',
          'x-forwarded-proto': 'http',
          'x-middleware-subrequest': 'middleware',
          origin: `https://${HOST}`,
          cookie: 'acg_session=abc',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: 'a@b.co', password: 'x' }),
      }),
      goodEnv(),
      ns,
    );
    const fwd = requests[0]!;
    expect(fwd.headers.get('cf-connecting-ip')).toBe('203.0.113.7');
    expect(fwd.headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(fwd.headers.get('x-real-ip')).toBeNull();
    expect(fwd.headers.get('true-client-ip')).toBeNull();
    expect(fwd.headers.get('forwarded')).toBeNull();
    expect(fwd.headers.get('x-middleware-subrequest')).toBeNull();
    expect(fwd.headers.get('x-forwarded-host')).toBe(HOST);
    expect(fwd.headers.get('x-forwarded-proto')).toBe('https');
    // What the app's CSRF check and session need is untouched.
    expect(fwd.headers.get('origin')).toBe(`https://${HOST}`);
    expect(fwd.headers.get('cookie')).toBe('acg_session=abc');
    expect(fwd.method).toBe('POST');
    expect(await fwd.json()).toEqual({ email: 'a@b.co', password: 'x' });
  });

  it('forwards no client IP at all when the edge did not set one', async () => {
    const { ns, requests } = fakeNamespace();
    await handleRequest(new Request(`https://${HOST}/login`, { headers: { 'x-forwarded-for': '10.9.9.9' } }), goodEnv(), ns);
    expect(requests[0]!.headers.get('x-forwarded-for')).toBeNull();
    expect(requests[0]!.headers.get('cf-connecting-ip')).toBeNull();
  });
});

// ─── Configuration checks ─────────────────────────────────────────────────

describe('configProblems', () => {
  it('accepts an external Postgres with verified TLS and real secrets', () => {
    expect(configProblems(goodEnv())).toEqual([]);
  });

  it.each([
    ['localhost', 'postgresql://u:p@localhost:5432/x?sslmode=require&sslaccept=strict'],
    ['loopback', 'postgresql://u:p@127.0.0.1:5432/x?sslmode=require&sslaccept=strict'],
    ['compose service', 'postgresql://u:p@db:5432/x?sslmode=require&sslaccept=strict'],
  ])('rejects a database on/next to the container (%s)', (_, url) => {
    expect(configProblems(goodEnv({ DATABASE_URL: url })).join()).toMatch(/external managed Postgres/);
  });

  it('requires TLS that verifies the server certificate', () => {
    const noTls = configProblems(goodEnv({ DATABASE_URL: 'postgresql://u:p@db.example.com/x' })).join();
    expect(noTls).toMatch(/sslmode=require/);
    expect(noTls).toMatch(/sslaccept=strict/);
    // sslmode=require alone encrypts but accepts any certificate in Prisma.
    const unverified = configProblems(goodEnv({ DATABASE_URL: 'postgresql://u:p@db.example.com/x?sslmode=require' }));
    expect(unverified).toEqual(['DATABASE_URL (needs sslaccept=strict)']);
  });

  it('rejects missing, short or reused secrets', () => {
    expect(configProblems(goodEnv({ SESSION_SECRET: undefined })).join()).toMatch(/SESSION_SECRET/);
    expect(configProblems(goodEnv({ DOCUMENT_URL_SECRET: 'short' })).join()).toMatch(/DOCUMENT_URL_SECRET/);
    const same = 'x'.repeat(64);
    expect(configProblems(goodEnv({ SESSION_SECRET: same, DOCUMENT_URL_SECRET: same })).join()).toMatch(/must differ/);
  });

  it('never includes secret values in its output', () => {
    const env = goodEnv({ DATABASE_URL: 'postgresql://user:TOPSECRETPW@localhost/x', SESSION_SECRET: 'tiny-secret-value' });
    const text = configProblems(env).join(' ');
    expect(text).not.toContain('TOPSECRETPW');
    expect(text).not.toContain('tiny-secret-value');
  });
});

describe('containerEnv / idleTimeoutMs', () => {
  it('passes exactly the app settings, with migrations off and the external-DB guard on', () => {
    const env = containerEnv(goodEnv());
    expect(Object.keys(env).sort()).toEqual(
      [
        'APP_URL',
        'DATABASE_URL',
        'DOCUMENT_URL_SECRET',
        'HOSTNAME',
        'MIGRATE_ON_START',
        'NEXT_TELEMETRY_DISABLED',
        'NODE_ENV',
        'PORT',
        'REQUIRE_EXTERNAL_DATABASE',
        'SESSION_SECRET',
      ].sort(),
    );
    expect(env.APP_URL).toBe(`https://${HOST}`);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(String(APP_PORT));
    expect(env.MIGRATE_ON_START).toBe('0');
    expect(env.REQUIRE_EXTERNAL_DATABASE).toBe('1');
  });

  it('clamps the idle timeout to the platform range', () => {
    expect(idleTimeoutMs(goodEnv({ IDLE_TIMEOUT_MINUTES: '30' }))).toBe(30 * 60_000);
    expect(idleTimeoutMs(goodEnv({ IDLE_TIMEOUT_MINUTES: '0' }))).toBe(60_000);
    expect(idleTimeoutMs(goodEnv({ IDLE_TIMEOUT_MINUTES: '100000' }))).toBe(360 * 60_000);
    expect(idleTimeoutMs(goodEnv({ IDLE_TIMEOUT_MINUTES: 'abc' }))).toBe(30 * 60_000);
  });
});

// ─── Durable Object container lifecycle ───────────────────────────────────

/**
 * A fake `ctx.container`: the app starts answering after `bootPolls` readiness
 * probes; `exit()` simulates the process stopping.
 */
function fakeContainer(opts: { bootPolls?: number; failStart?: boolean } = {}) {
  let running = false;
  let pollsLeft = opts.bootPolls ?? 2;
  let resolveExit: (() => void) | null = null;
  const starts: Array<{ enableInternet: boolean; env: Record<string, string> }> = [];
  const appRequests: Request[] = [];
  const timeouts: number[] = [];

  const container: ContainerLike = {
    get running() {
      return running;
    },
    start(o) {
      if (running) throw new Error('already running');
      starts.push(o);
      running = !opts.failStart;
      pollsLeft = opts.bootPolls ?? 2;
    },
    monitor() {
      return new Promise<void>((resolve) => {
        resolveExit = () => {
          running = false;
          resolve();
        };
      });
    },
    async setInactivityTimeout(ms) {
      timeouts.push(ms);
    },
    getTcpPort(port) {
      expect(port).toBe(APP_PORT);
      return {
        async fetch(req: Request) {
          if (!running) throw new Error('connection refused');
          const isProbe = new URL(req.url).pathname === '/login' && !req.headers.get('x-test');
          if (isProbe && pollsLeft > 0) {
            pollsLeft--;
            throw new Error('connection refused');
          }
          if (!isProbe) appRequests.push(req);
          return new Response('app', { status: 200 });
        },
      };
    },
  };
  return { container, starts, appRequests, timeouts, exit: () => resolveExit?.() };
}

const noSleep = { sleep: async () => {}, log: () => {} };

const appRequest = (path = '/portal/overview', init: RequestInit = {}) =>
  new Request(`https://${HOST}${path}`, { ...init, headers: { 'x-test': '1', ...(init.headers ?? {}) } });

describe('PortalLifecycle', () => {
  it('starts the container once for concurrent requests, with internet and the app env', async () => {
    const fc = fakeContainer({ bootPolls: 3 });
    const lc = new PortalLifecycle(fc.container, goodEnv(), noSleep);
    const responses = await Promise.all([lc.fetch(appRequest()), lc.fetch(appRequest()), lc.fetch(appRequest())]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(fc.starts).toHaveLength(1);
    expect(fc.starts[0]!.enableInternet).toBe(true);
    expect(fc.starts[0]!.env).toEqual(containerEnv(goodEnv()));
    expect(fc.timeouts).toEqual([30 * 60_000]);
    expect(fc.appRequests).toHaveLength(3);
  });

  it('forwards with the public hostname as Host, keeping method, path, headers and body', async () => {
    const fc = fakeContainer();
    const lc = new PortalLifecycle(fc.container, goodEnv(), noSleep);
    await lc.fetch(
      appRequest('/api/team/accounts?x=1', {
        method: 'POST',
        headers: { origin: `https://${HOST}`, 'cf-connecting-ip': '203.0.113.7', 'content-type': 'application/json' },
        body: '{"a":1}',
      }),
    );
    const req = fc.appRequests[0]!;
    const url = new URL(req.url);
    expect(url.host).toBe(HOST); // becomes the Host header the app compares Origin against
    expect(url.pathname + url.search).toBe('/api/team/accounts?x=1');
    expect(req.method).toBe('POST');
    expect(req.headers.get('origin')).toBe(`https://${HOST}`);
    expect(req.headers.get('cf-connecting-ip')).toBe('203.0.113.7');
    expect(await req.text()).toBe('{"a":1}');
    expect(req.redirect).toBe('manual');
  });

  it('restarts the container on the next request after it stops', async () => {
    const fc = fakeContainer();
    const lc = new PortalLifecycle(fc.container, goodEnv(), noSleep);
    await lc.fetch(appRequest());
    fc.exit();
    await new Promise((r) => setTimeout(r, 0));
    const res = await lc.fetch(appRequest());
    expect(res.status).toBe(200);
    expect(fc.starts).toHaveLength(2);
  });

  it('returns 503 and retries startup on the next request if the app never becomes ready', async () => {
    const fc = fakeContainer({ bootPolls: Number.POSITIVE_INFINITY });
    let t = 0;
    const lc = new PortalLifecycle(fc.container, goodEnv(), {
      log: () => {},
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    const res = await lc.fetch(appRequest());
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(fc.appRequests).toHaveLength(0);
  });

  it('does not start the container when settings are invalid, and logs names only', async () => {
    const fc = fakeContainer();
    const logs: string[] = [];
    const lc = new PortalLifecycle(
      fc.container,
      goodEnv({ DATABASE_URL: 'postgresql://u:SECRETPW@localhost/x' }),
      { ...noSleep, log: (m) => logs.push(m) },
    );
    const res = await lc.fetch(appRequest());
    expect(res.status).toBe(503);
    expect(fc.starts).toHaveLength(0);
    expect(logs.join('\n')).toMatch(/DATABASE_URL/);
    expect(logs.join('\n')).not.toContain('SECRETPW');
  });

  it('re-attaches the idle timer to a container that survived a Durable Object restart', async () => {
    const fc = fakeContainer();
    fc.container.start({ enableInternet: true, env: {} });
    const spy = vi.spyOn(fc.container, 'setInactivityTimeout');
    const lc = new PortalLifecycle(fc.container, goodEnv(), noSleep);
    expect(spy).toHaveBeenCalledWith(30 * 60_000);
    await lc.fetch(appRequest());
    expect(fc.starts).toHaveLength(1); // no second start
  });

  it('answers 500 when no container is bound', async () => {
    const lc = new PortalLifecycle(undefined, goodEnv(), noSleep);
    expect((await lc.fetch(appRequest())).status).toBe(500);
  });
});

// ─── Review regressions: bounded readiness, no retries, safe logging ──────

const SENTINEL = 'SENTINEL-postgresql://u:pw-0xDEADBEEF@db.example.com';

/** A container whose readiness and app responses are supplied per test. */
function scriptedContainer(opts: {
  probe: (req: Request) => Promise<Response>;
  app?: (req: Request) => Promise<Response>;
  start?: () => void;
  monitor?: () => Promise<void>;
}) {
  let running = false;
  const probes: Request[] = [];
  const appCalls: Request[] = [];
  const container: ContainerLike = {
    get running() {
      return running;
    },
    start() {
      opts.start?.();
      running = true;
    },
    monitor: opts.monitor ?? (() => new Promise<void>(() => {})),
    async setInactivityTimeout() {},
    getTcpPort() {
      return {
        fetch(req: Request) {
          if (!req.headers.get('x-test')) {
            probes.push(req);
            return opts.probe(req);
          }
          appCalls.push(req);
          return opts.app ? opts.app(req) : Promise.resolve(new Response('app'));
        },
      };
    },
  };
  return { container, probes, appCalls };
}

describe('PortalLifecycle — bounded readiness', () => {
  it('does not wait for response-body cancellation to settle before serving', async () => {
    let cancelled = false;
    const sc = scriptedContainer({
      probe: async () => new Response(new ReadableStream({
        cancel() {
          cancelled = true;
          return new Promise<void>(() => {});
        },
      })),
    });
    const lc = new PortalLifecycle(sc.container, goodEnv(), { log: () => {} });
    expect((await lc.fetch(appRequest())).status).toBe(200);
    expect(cancelled).toBe(true);
    expect(sc.appCalls).toHaveLength(1);
  }, 1_000);

  it('gives up on a probe that accepts the connection but never answers, aborting it', async () => {
    const sc = scriptedContainer({ probe: () => new Promise<Response>(() => {}) }); // never settles
    const logs: string[] = [];
    let t = 0;
    const lc = new PortalLifecycle(sc.container, goodEnv(), {
      log: (m) => logs.push(m),
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      readyTimeoutMs: 1_000,
      probeTimeoutMs: 10,
    });
    const started = Date.now();
    const res = await lc.fetch(appRequest());
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(sc.probes.length).toBeGreaterThan(0);
    expect(sc.probes.every((p) => p.signal.aborted)).toBe(true);
    expect(sc.appCalls).toHaveLength(0);
    expect(logs).toContain('portal: container did not become ready (ready-timeout)');
  });

  it('caps each probe by the time left before the overall deadline', async () => {
    const sc = scriptedContainer({ probe: () => new Promise<Response>(() => {}) });
    let t = 0;
    const lc = new PortalLifecycle(sc.container, goodEnv(), {
      log: () => {},
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      readyTimeoutMs: 260, // one 250 ms poll interval leaves 10 ms for the second probe
      probeTimeoutMs: 60_000, // would hang the test if not capped
    });
    const started = Date.now();
    expect((await lc.fetch(appRequest())).status).toBe(503);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('releases readiness response bodies, including ones that arrive after the timeout', async () => {
    const cancelled: string[] = [];
    const body = (label: string) =>
      new ReadableStream({
        cancel() {
          cancelled.push(label);
        },
      });
    let n = 0;
    let releaseLate!: (r: Response) => void;
    const sc = scriptedContainer({
      probe: () => {
        n++;
        if (n === 1) return new Promise<Response>((r) => (releaseLate = r)); // times out, answers later
        if (n === 2) return Promise.resolve(new Response(body('error'), { status: 502 }));
        return Promise.resolve(new Response(body('ready'), { status: 200 }));
      },
    });
    const lc = new PortalLifecycle(sc.container, goodEnv(), { log: () => {}, sleep: async () => {}, probeTimeoutMs: 10 });
    expect((await lc.fetch(appRequest())).status).toBe(200);
    releaseLate(new Response(body('late'), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(cancelled.sort()).toEqual(['error', 'late', 'ready']);
  });

  it('forwards an application POST once and never retries it', async () => {
    const sc = scriptedContainer({
      probe: () => Promise.resolve(new Response(null, { status: 200 })),
      app: () => Promise.reject(new Error('connection reset')),
    });
    const lc = new PortalLifecycle(sc.container, goodEnv(), { log: () => {}, sleep: async () => {} });
    const res = await lc.fetch(appRequest('/api/team/accounts', { method: 'POST', body: '{"a":1}' }));
    expect(res.status).toBe(502);
    expect(sc.appCalls).toHaveLength(1);
  });
});

describe('PortalLifecycle — logs carry categories, never runtime error text', () => {
  const capture = () => {
    const logs: string[] = [];
    return { logs, deps: { log: (m: string) => logs.push(m), sleep: async () => {}, probeTimeoutMs: 10 } };
  };

  it('a start() error containing a secret is logged as "start-failed" only', async () => {
    const { logs, deps } = capture();
    const sc = scriptedContainer({
      probe: () => Promise.resolve(new Response(null)),
      start: () => {
        throw new Error(`could not start: ${SENTINEL}`);
      },
    });
    const res = await new PortalLifecycle(sc.container, goodEnv(), deps).fetch(appRequest());
    expect(res.status).toBe(503);
    expect(logs).toContain('portal: container did not become ready (start-failed)');
    expect(logs.join('\n')).not.toContain('SENTINEL');
    expect(await res.text()).not.toContain('SENTINEL');
  });

  it('an upstream failure containing a secret is logged without its message', async () => {
    const { logs, deps } = capture();
    const sc = scriptedContainer({
      probe: () => Promise.resolve(new Response(null)),
      app: () => Promise.reject(new Error(SENTINEL)),
    });
    const res = await new PortalLifecycle(sc.container, goodEnv(), deps).fetch(appRequest());
    expect(res.status).toBe(502);
    expect(logs).toContain('portal: request to container failed');
    expect(logs.join('\n')).not.toContain('SENTINEL');
  });

  it('a container exit logs only a valid numeric exit code', async () => {
    for (const [err, expected] of [
      [Object.assign(new Error(SENTINEL), { exitCode: 137 }), 'portal: container exited with code 137'],
      [Object.assign(new Error(SENTINEL), { exitCode: `1 ${SENTINEL}` }), 'portal: container exited'],
      [Object.assign(new Error(SENTINEL), { exitCode: 99999 }), 'portal: container exited'],
    ] as const) {
      const { logs, deps } = capture();
      const sc = scriptedContainer({ probe: () => Promise.resolve(new Response(null)), monitor: () => Promise.reject(err) });
      await new PortalLifecycle(sc.container, goodEnv(), deps).fetch(appRequest());
      await new Promise((r) => setTimeout(r, 0));
      expect(logs).toContain(expected);
      expect(logs.join('\n')).not.toContain('SENTINEL');
    }
  });

  it('safeExitCode accepts only integers 0–255', () => {
    expect(safeExitCode({ exitCode: 0 })).toBe(0);
    expect(safeExitCode({ exitCode: 255 })).toBe(255);
    expect(safeExitCode({ exitCode: -1 })).toBeUndefined();
    expect(safeExitCode({ exitCode: 1.5 })).toBeUndefined();
    expect(safeExitCode({ exitCode: '1' })).toBeUndefined();
    expect(safeExitCode(null)).toBeUndefined();
  });
});
