import { createBrowserRouter } from "react-router-dom";
import { ResultsPage } from "../features/results/ResultsPage";

const basename =
  import.meta.env.BASE_URL === "/"
    ? "/"
    : import.meta.env.BASE_URL.replace(/\/$/, "");

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <ResultsPage />
    }
  ],
  { basename }
);
