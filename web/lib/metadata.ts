import type { Metadata } from "next";

export const siteName = "Afterlife";
export const socialImage = {
  url: "/brand/social-card.png",
  width: 1200,
  height: 630,
  alt: "Afterlife — Good ideas deserve an afterlife. Explore London hackathon projects and the people behind them.",
};

function urlFromEnvironment() {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "http://localhost:3000";
  const value = candidate.startsWith("http") ? candidate : `https://${candidate}`;

  try {
    return new URL(value);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const siteUrl = urlFromEnvironment();

export function pageMetadata({
  title,
  description,
  pathname,
  noIndex = false,
}: {
  title: string;
  description: string;
  pathname: string;
  noIndex?: boolean;
}): Metadata {
  const fullTitle = title === siteName ? title : `${title} · ${siteName}`;

  return {
    title,
    description,
    alternates: { canonical: pathname },
    openGraph: {
      title: fullTitle,
      description,
      url: pathname,
      siteName,
      locale: "en_GB",
      type: "website",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [socialImage],
    },
    robots: noIndex ? { index: false, follow: false } : undefined,
  };
}
