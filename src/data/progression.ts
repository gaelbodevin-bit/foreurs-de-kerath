/** What the colony is called as it grows. Each rank opens more of the build menu. */
export const CITY_LEVELS: readonly { name: string; population: number }[] = [
  { name: 'Campement', population: 0 },
  { name: 'Bourg', population: 14 },
  { name: 'Ville', population: 30 },
  { name: 'Cité', population: 55 },
  { name: 'Capitale', population: 90 },
];

export const FIRST_CONTRACT_AT = 75;
/** Seconds between two new requests, at random within this range. */
export const CONTRACT_INTERVAL: readonly [number, number] = [35, 75];
export const MAX_CONTRACTS = 4;
