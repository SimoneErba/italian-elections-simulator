import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AnalyticsProvider } from "./app/posthog";
import { router } from "./app/router";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AnalyticsProvider>
      <RouterProvider router={router} />
    </AnalyticsProvider>
  </React.StrictMode>
);
