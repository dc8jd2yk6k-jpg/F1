import type { Act } from '../engine/Engine';
import { Intro } from './Intro';
import { Outro } from './Outro';
import { P2Fight } from './P2Fight';
import { Season } from './Season';

// Acts in song order; each claims the musical sections it covers.
export const ACTS: (new () => Act)[] = [Intro, Season, P2Fight, Outro];
