"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import { NAV_ROUTES } from "@/lib/routes";

/** Top-level route links. Client-side only for the active state. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="afterlife-nav">
      {NAV_ROUTES.map((route) => {
        const active =
          pathname === route.href ||
          (route.href === "/explore" && pathname.startsWith("/p/"));
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
              "afterlife-nav-link",
            )}
          >
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}
