/** App routes. Safe to import from client and server components. */

export const NAV_ROUTES = [
  { href: "/explore", label: "Explore" },
  { href: "/before-you-build", label: "Before you build" },
  { href: "/speakers", label: "Speakers" },
  { href: "/intros", label: "Intros" },
  { href: "/log", label: "Log" },
  { href: "/claim", label: "Claim" },
] as const;

/**
 * Project detail lives at /p/<slug> (e.g. /p/wonkers-are-use). The page also
 * accepts the full project id ("devpost:<slug>", URL-encoded).
 */
export function projectHref(project: { slug: string }): string {
  return `/p/${encodeURIComponent(project.slug)}`;
}
