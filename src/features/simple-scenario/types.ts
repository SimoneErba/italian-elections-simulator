export type SimplifiedList = {
  id: string;
  name: string;
  percentage: number;
};

export type SimplifiedCoalition = {
  id: string;
  name: string;
  alias?: string;
  listIds: string[];
};

export type SimplifiedScenarioRequest = {
  lists: SimplifiedList[];
  coalitions: SimplifiedCoalition[];
};
