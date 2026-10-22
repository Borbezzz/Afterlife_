"use client";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import type { ReactNode } from "react";

/** Product agent transport for the custom BeautifulUI chat. */
export function AfterlifeCopilotProvider({ children }: { children: ReactNode }) {
  return <CopilotKitProvider runtimeUrl="/api/copilotkit" agentId="default" enableInspector={false} showIntelligenceIndicator={false}>{children}</CopilotKitProvider>;
}

export default AfterlifeCopilotProvider;
