import { isAllowedPagesHost } from "./_lib/host";

/**
 * Defense in depth for Pages immutable deployment URLs.
 *
 * Cloudflare Access remains the production identity boundary. This guard also
 * prevents a preview/immutable Pages hostname from serving the UI or API when
 * the external preview Access policy has not yet been enabled.
 */
export const onRequest: PagesFunction = async ({ request, next }) => {
  if (!isAllowedPagesHost(new URL(request.url).hostname)) {
    return new Response("not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
  return next();
};
