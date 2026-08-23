/**
 * National-list snapshot used by the percentage-only entry point.
 *
 * This is deliberately local data: opening the simulator must never depend on
 * a changing political directory. Entries can be supplemented in the UI.
 */
export type SimplifiedCatalogList = {
  id: string;
  name: string;
};

export const simplifiedListCatalog: SimplifiedCatalogList[] = [
  { id: "fratelli-ditalia", name: "Fratelli d'Italia" },
  { id: "partito-democratico", name: "Partito Democratico" },
  { id: "movimento-5-stelle", name: "Movimento 5 Stelle" },
  { id: "lega", name: "Lega" },
  { id: "forza-italia", name: "Forza Italia" },
  { id: "alleanza-verdi-sinistra", name: "Alleanza Verdi e Sinistra" },
  { id: "azione", name: "Azione" },
  { id: "italia-viva", name: "Italia Viva" },
  { id: "piu-europa", name: "+Europa" },
  { id: "noi-moderati", name: "Noi Moderati" },
  { id: "ora", name: "Ora!" }
];

/** A balanced, editable starting point expressed in hundredths of a percent. */
export const defaultSimplifiedPercentages: Record<string, number> = {
  "fratelli-ditalia": 2900,
  "partito-democratico": 2400,
  "movimento-5-stelle": 1300,
  lega: 900,
  "forza-italia": 900,
  "alleanza-verdi-sinistra": 700,
  azione: 300,
  "italia-viva": 200,
  "piu-europa": 200,
  "noi-moderati": 200,
  ora: 0
};

export const defaultSimplifiedCoalitions = [
  { id: "coalition-centrodestra", name: "Centrodestra", listIds: ["forza-italia", "fratelli-ditalia", "lega"] },
  { id: "coalition-centrosinistra", name: "Centrosinistra", listIds: ["partito-democratico", "alleanza-verdi-sinistra"] },
  { id: "coalition-centro", name: "Centro", listIds: ["azione", "italia-viva"] }
];
