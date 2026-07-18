import { defineMiddleware } from "astro:middleware";
import { evaluateLocalRequest } from "./lib/security/request-policy";

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  const decision = evaluateLocalRequest({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    protocol: url.protocol,
    fetchSite: request.headers.get("sec-fetch-site"),
  });

  if (!decision.allowed) {
    return new Response("Local same-origin access only", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return next();
});
