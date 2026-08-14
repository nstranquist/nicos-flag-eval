const CANONICAL_HOST = "localhost";

/**
 * Pages deployment URLs are immutable and public unless the project Access
 * preview policy is enabled. Keep API and static requests on the canonical
 * host until that external policy is configured.
 */
export function isAllowedPagesHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/u, "");
  return host === CANONICAL_HOST || host === "localhost" || host === "127.0.0.1" || host === "::1";
}
