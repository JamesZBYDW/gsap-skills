/**
 * Redirect plain-HTTP requests for the canonical host to HTTPS (308, same
 * path and query). Returns null for anything else, which is passed through.
 */
export function canonicalHttpsRedirect(request: Request, appUrl: string | undefined): Response | null {
  if (!appUrl) return null;
  let canonical: URL;
  try {
    canonical = new URL(appUrl);
  } catch {
    return null;
  }
  const url = new URL(request.url);
  if (canonical.protocol === 'https:' && url.protocol === 'http:' && url.hostname === canonical.hostname) {
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 308);
  }
  return null;
}
