import type { ReactNode } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;

if (posthogKey) {
  posthog.init(posthogKey, {
    capture_pageview: "history_change",
    loaded: (client) => {
      client.register({ project: "elections" });
    }
  });
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!posthogKey) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
