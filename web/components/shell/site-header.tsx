import Image from "next/image";
import Link from "next/link";

import { SiteNav } from "@/components/shell/site-nav";

/** App shell header: wordmark and routes through the public project archive. */
export function SiteHeader() {
  return (
    <header className="afterlife-header">
      <div className="afterlife-header-inner">
        <Link href="/explore" className="afterlife-wordmark">
          <Image
            src="/brand/logo.svg"
            alt="Afterlife"
            width={298}
            height={72}
            loading="eager"
            className="inline-block h-7 w-24 object-cover object-left align-middle"
          />
          <span>London builder archive</span>
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
