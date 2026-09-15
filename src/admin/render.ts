import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ADMIN_SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src * data:; frame-src 'self'; form-action 'self'; base-uri 'none'",
};

export function renderPage(
  element: ReactElement,
  init: { status?: number } = {},
): Response {
  const html = `<!doctype html>${renderToStaticMarkup(element)}`;

  return new Response(html, {
    status: init.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...ADMIN_SECURITY_HEADERS,
    },
  });
}

export function rawHtmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...ADMIN_SECURITY_HEADERS,
    },
  });
}

export function textResponse(
  body: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...ADMIN_SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

// Assets (app.css, font files) are cacheable and aren't page markup, so they
// get their own response helper instead of the no-store security headers.
export function assetResponse(
  body: string | Uint8Array,
  contentType: string,
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
