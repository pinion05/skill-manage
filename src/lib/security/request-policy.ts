export interface LocalRequestMetadata {
  method: string;
  host?: string | null;
  origin?: string | null;
  protocol?: string;
  fetchSite?: string | null;
}

export type LocalRequestDecision =
  | { allowed: true }
  | { allowed: false; reason: "invalid-host" | "missing-origin" | "cross-origin" };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizedHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, "");
}

function parseHost(host: string): URL | undefined {
  try {
    return new URL(`http://${host}`);
  } catch {
    return undefined;
  }
}

export function evaluateLocalRequest(metadata: LocalRequestMetadata): LocalRequestDecision {
  const host = metadata.host?.trim();
  if (!host) return { allowed: false, reason: "invalid-host" };

  const hostUrl = parseHost(host);
  if (!hostUrl || !LOOPBACK_HOSTS.has(normalizedHostname(hostUrl.hostname))) {
    return { allowed: false, reason: "invalid-host" };
  }

  if (SAFE_METHODS.has(metadata.method.toUpperCase())) return { allowed: true };

  const origin = metadata.origin?.trim();
  if (!origin) return { allowed: false, reason: "missing-origin" };

  try {
    const originUrl = new URL(origin);
    const protocol = metadata.protocol ?? "http:";
    const expectedPort = hostUrl.port;
    if (
      originUrl.protocol !== protocol ||
      normalizedHostname(originUrl.hostname) !== normalizedHostname(hostUrl.hostname) ||
      originUrl.port !== expectedPort
    ) {
      return { allowed: false, reason: "cross-origin" };
    }
  } catch {
    return { allowed: false, reason: "cross-origin" };
  }

  const fetchSite = metadata.fetchSite?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { allowed: false, reason: "cross-origin" };
  }

  return { allowed: true };
}
