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

/** The colonists waiting in the city, and the homes they already have there. */
export const CITY_SETTLERS = 12;
export const CITY_HOUSING = 16;
/** The city's own miners, who take the governor's orders as soon as the tunnel is through. */
export const CITY_MINERS = 10;
/** What the city's air plant adds, enough to keep that many more people breathing. */
export const CITY_OXYGEN = 0.2;
/** How close to the middle of the city a click reaches the council's seat. */
export const COUNCIL_SEAT_RADIUS = 2;
/** The city's own grid reaches this far from its middle: a building or road at its edge is on it. */
export const CITY_GRID_RADIUS = 7;

/** How many tiles of road a source carries current over: what it produces pushes it further. */
const GRID_BASE_REACH = 8;
const GRID_REACH_PER_POWER = 2;
export const gridReach = (output: number): number =>
  Math.round(GRID_BASE_REACH + output * GRID_REACH_PER_POWER);
/** From the edge of the city's own grid. */
export const CITY_GRID_REACH = 16;
