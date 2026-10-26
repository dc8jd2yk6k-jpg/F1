import results from '../data/results.json';
import season from '../data/season.json';

// Typed access to the season data. Every number on screen comes from
// src/data/results.json (per-event classifications) and season.json (roster,
// calendar, official standings used for verification).

export type EventType = 'race' | 'sprint';

export interface Driver {
  code: string;
  first: string;
  last: string;
  number: number;
  team: string;
  standIn?: boolean;
  note?: string;
}

export interface Entry {
  driver: string;
  pos: number;
  pts: number;
  /** Team for this event when it differs from the driver's regular seat. */
  team?: string;
}

export interface SeasonEvent {
  round: number;
  code: string;
  name: string;
  venue: string;
  date: string;
  type: EventType;
  classification: Entry[];
  sources: string[];
}

export const SEASON = season;
export const DRIVERS = season.drivers as Driver[];
export const EVENTS = results.events as SeasonEvent[];
export const TEAMS = season.teams as Record<string, { name: string; color: string }>;
export const RACE_POINTS = season.racePoints;
export const SPRINT_POINTS = season.sprintPoints;
export const OFFICIAL = season.officialStandings as Record<string, number>;
/** The official table's order: it encodes countback beyond the points places. */
export const OFFICIAL_ORDER = Object.keys(OFFICIAL);

const BY_CODE = new Map(DRIVERS.map((d) => [d.code, d]));

export function driver(code: string): Driver {
  const d = BY_CODE.get(code);
  if (!d) throw new Error(`unknown driver ${code}`);
  return d;
}

export const teamColor = (team: string) => TEAMS[team]?.color ?? '#888888';
export const driverColor = (code: string) => teamColor(driver(code).team);

/** Team a driver drove for at a given event (stand-in stints included). */
export function teamAt(code: string, ev: SeasonEvent): string {
  return ev.classification.find((e) => e.driver === code)?.team ?? driver(code).team;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function shortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export const LAST_EVENT = EVENTS[EVENTS.length - 1];
export const RACES_LEFT = season.remaining.length;
export const POINTS_LEFT = RACES_LEFT * RACE_POINTS[0] + season.sprintsRemaining * SPRINT_POINTS[0];
