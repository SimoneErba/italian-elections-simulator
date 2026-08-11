import type { Chamber } from "../../domain/chamber";

export type DistrictSeatCapacity = {
  withBonus: number;
  withoutBonus: number;
};

const cameraEntries: Array<[string, number, number]> = [
  ["camera-piemonte-1-p01", 7, 8],
  ["camera-piemonte-1-p02", 5, 7],
  ["camera-piemonte-2-p01", 5, 6],
  ["camera-piemonte-2-p02", 7, 8],
  ["camera-lombardia-1-p01", 12, 14],
  ["camera-lombardia-1-p02", 10, 13],
  ["camera-lombardia-2-p01", 5, 6],
  ["camera-lombardia-2-p02", 7, 8],
  ["camera-lombardia-3-p01", 5, 7],
  ["camera-lombardia-3-p02", 7, 8],
  ["camera-lombardia-4-p01", 9, 11],
  ["camera-veneto-1-p01", 11, 13],
  ["camera-veneto-2-p01", 6, 7],
  ["camera-veneto-2-p02", 4, 6],
  ["camera-veneto-2-p03", 5, 6],
  ["camera-friuli-venezia-giulia-p01", 7, 8],
  ["camera-liguria-p01", 8, 10],
  ["camera-emilia-romagna-p01", 7, 8],
  ["camera-emilia-romagna-p02", 9, 11],
  ["camera-emilia-romagna-p03", 8, 10],
  ["camera-toscana-p01", 7, 8],
  ["camera-toscana-p02", 6, 8],
  ["camera-toscana-p03", 7, 8],
  ["camera-umbria-p01", 5, 6],
  ["camera-marche-p01", 8, 10],
  ["camera-lazio-1-p01", 6, 8],
  ["camera-lazio-1-p02", 7, 8],
  ["camera-lazio-1-p03", 7, 9],
  ["camera-lazio-2-p01", 5, 6],
  ["camera-lazio-2-p02", 6, 7],
  ["camera-abruzzo-p01", 6, 8],
  ["camera-molise-p01", 2, 2],
  ["camera-campania-1-p01", 7, 9],
  ["camera-campania-1-p02", 9, 11],
  ["camera-campania-2-p01", 6, 8],
  ["camera-campania-2-p02", 8, 9],
  ["camera-puglia-p01", 5, 6],
  ["camera-puglia-p02", 5, 6],
  ["camera-puglia-p03", 4, 6],
  ["camera-puglia-p04", 7, 8],
  ["camera-basilicata-p01", 3, 4],
  ["camera-calabria-p01", 10, 12],
  ["camera-sicilia-1-p01", 6, 8],
  ["camera-sicilia-1-p02", 6, 7],
  ["camera-sicilia-2-p01", 4, 5],
  ["camera-sicilia-2-p02", 5, 6],
  ["camera-sicilia-2-p03", 5, 6],
  ["camera-sardegna-p01", 8, 10]
];

const senateEntries: Array<[string, number, number]> = [
  ["senate-piemonte-p01", 5, 6],
  ["senate-piemonte-p02", 6, 8],
  ["senate-lombardia-p01", 8, 9],
  ["senate-lombardia-p02", 10, 13],
  ["senate-lombardia-p03", 8, 10],
  ["senate-veneto-p01", 6, 7],
  ["senate-veneto-p02", 7, 9],
  ["senate-friuli-venezia-giulia-p01", 3, 4],
  ["senate-liguria-p01", 4, 5],
  ["senate-emilia-romagna-p01", 5, 6],
  ["senate-emilia-romagna-p02", 6, 8],
  ["senate-toscana-p01", 10, 12],
  ["senate-umbria-p01", 2, 3],
  ["senate-marche-p01", 4, 5],
  ["senate-lazio-p01", 8, 9],
  ["senate-lazio-p02", 7, 9],
  ["senate-abruzzo-p01", 3, 4],
  ["senate-molise-p01", 2, 2],
  ["senate-campania-p01", 9, 10],
  ["senate-campania-p02", 6, 8],
  ["senate-puglia-p01", 11, 13],
  ["senate-basilicata-p01", 3, 3],
  ["senate-calabria-p01", 5, 6],
  ["senate-sicilia-p01", 6, 7],
  ["senate-sicilia-p02", 6, 8],
  ["senate-sardegna-p01", 4, 5]
];

export const officialDistrictSeatCapacities: Record<string, DistrictSeatCapacity> = Object.fromEntries(
  [...cameraEntries, ...senateEntries].map(([id, withBonus, withoutBonus]) => [id, { withBonus, withoutBonus }])
);

export const ordinaryDomesticSeatPools: Record<Chamber, DistrictSeatCapacity> = {
  camera: { withBonus: 314, withoutBonus: 384 },
  senate: { withBonus: 154, withoutBonus: 189 }
};

export function officialDistrictSeatCapacity(districtId: string): DistrictSeatCapacity | undefined {
  return officialDistrictSeatCapacities[districtId];
}
