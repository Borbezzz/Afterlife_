import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { pageMetadata, siteName, siteUrl } from "@/lib/metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const defaultMetadata = pageMetadata({
    title: siteName,
    description: "A searchable 3D memory of London hackathon projects: what was built, by whom, how far it got, and who to message.",
    pathname: "/explore",
});

export const metadata: Metadata = {
  ...defaultMetadata,
  alternates: undefined,
  openGraph: { ...defaultMetadata.openGraph, url: undefined },
  metadataBase: siteUrl,
  title: { default: siteName, template: "%s · Afterlife" },
  applicationName: siteName,
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:text-foreground">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
