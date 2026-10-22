/**
 * Local persistence is a development convenience, never a public API mode.
 * A reverse proxy must forward its public host for this to remain effective.
 */
function hostname(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value.split(",")[0].trim()}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }
}

function isLoopback(value: string | null) {
  const host = hostname(value);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function localWorkspaceRequestAllowed(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.AFTERLIFE_LOCAL_MODE !== "1") return false;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
  if (!isLoopback(host)) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === host.split(",")[0].trim().toLowerCase();
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function assertLocalWorkspaceRequest(request: Request) {
  if (!localWorkspaceRequestAllowed(request)) {
    throw new Error("Local profile storage is available only from the loopback workspace.");
  }
}

/** Return an explicit rejection before a route performs costly or local work. */
export function localWorkspaceDenied(request: Request): Response | null {
  if (localWorkspaceRequestAllowed(request)) return null;
  return new Response(JSON.stringify({ error: "Local workspace access is required." }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
