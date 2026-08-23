import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../app/store";
import { ResultsPage } from "../features/results/ResultsPage";

describe("simulation setup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    useAppStore.setState({ scenario: undefined, results: undefined });
  });

  it("defaults to the 2026 law, simple editing and the 2022 starting data", () => {
    render(<ResultsPage />);

    expect(screen.getByRole("radio", { name: "Proposta 2026" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Semplice" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Elezioni 2022" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partiti" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Simula" })).toBeVisible();
  });

  it("switches to advanced editing for custom files and restores simple mode", () => {
    render(<ResultsPage />);

    fireEvent.click(screen.getByRole("radio", { name: "Avanzata" }));
    fireEvent.click(screen.getByRole("radio", { name: "Personalizza i dati" }));
    expect(screen.getByRole("radio", { name: "Avanzata" })).toBeChecked();
    expect(screen.getByText("Carica i file e simula")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: "Semplice" }));
    expect(screen.queryByRole("radio", { name: "Elezioni 2022" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partiti" })).toBeVisible();
  });
});
