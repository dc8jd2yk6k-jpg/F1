import season from './season.json';

// Derived story numbers, so every caption follows the data file.

const WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN', 'TWENTY'];

export const word = (n: number) => WORDS[n] ?? String(n);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const pts = season.contenders.map((c) => c.points);
export const SPREAD = Math.max(...pts) - Math.min(...pts);
export const RACES_LEFT = season.remaining.length;
export const racesLeft = (suffix: string) => (RACES_LEFT === 1 ? `ONE RACE ${suffix}` : `${RACES_LEFT} RACES ${suffix}`);
