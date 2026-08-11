import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const githubPagesBase = "/italian-elections-simulator/";
  const base =
    env.VITE_APP_BASE ?? (env.GITHUB_PAGES === "true" ? githubPagesBase : "/");

  return {
    base,
    define: {
      "import.meta.env.VITE_APP_BASE": JSON.stringify(base),
      "import.meta.env.VITE_POSTHOG_KEY": JSON.stringify(
        env.VITE_POSTHOG_KEY ?? env.posthog_key ?? ""
      )
    },
    plugins: [react()]
  };
});
