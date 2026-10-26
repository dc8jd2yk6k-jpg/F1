import { barTime } from '../engine/Timeline';
import { type CarCode, slotOf } from '../world/RaceSim';
import type { World } from '../world/World';

// The starting grid, shared by the intro (Lights) and the Grid act: cars
// parked in staggered slots behind the gantry.

export const gridS = (w: World) => w.track.length - 18;

/** Choreography time at which grid order and noise are sampled (static). */
export const GRID_TC = barTime(2);

export function parkOnGrid(w: World) {
  const s0 = gridS(w);
  w.pace = () => s0;
  w.laneBias = (code: CarCode) => (Math.round(slotOf(code, GRID_TC)) % 2 === 0 ? 2.6 : -2.6);
}
