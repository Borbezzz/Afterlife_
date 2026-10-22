import type { ReactNode } from "react";

import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";

/** ReUI wrapper for compact pages that do not require a dedicated screen layout. */
export function PageFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="afterlife-page">
      <Frame>
        <FrameHeader>
          <FrameTitle>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </FrameTitle>
          {description ? <FrameDescription>{description}</FrameDescription> : null}
        </FrameHeader>
        {children ? <FramePanel>{children}</FramePanel> : null}
      </Frame>
    </div>
  );
}
