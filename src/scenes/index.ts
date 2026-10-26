import type { Act } from '../engine/Engine';
import { Charge } from './Charge';
import { Exposure } from './Exposure';
import { Finale } from './Finale';
import { Grid } from './Grid';
import { HookOne } from './HookOne';
import { HookTwo } from './HookTwo';
import { Lights } from './Lights';
import { Threads } from './Threads';

// One act per musical section, in song order (see src/data/audio.json).
export const ACTS: (new () => Act)[] = [Lights, Threads, Grid, HookOne, Charge, HookTwo, Exposure, Finale];
