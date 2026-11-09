import { generateMineBoard } from '../lib/guess-36-mines-rules';
let seed = 36;
const randomInt = (max: number) => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
const runs = 100_000;
console.log('Deterministic simulation: 100,000 runs per strategy/speed; red loses all; deadline secures last green level.');
console.log('| Collect at green | Seconds between reveals | Gaming minutes / 1,000 runs | Bronze passes / 1,000 runs | Rewarded runs |');
console.log('|---|---|---|---|---|');
for (const seconds of [1, 3, 6]) for (let target = 1; target <= 5; target++) {
 let minutes = 0, passes = 0, rewarded = 0;
 for (let sample = 0; sample < runs; sample++) {
  const board = generateMineBoard(randomInt); let greens = 0;
  for (let i = 0; i < board.length; i++) {
   if (i * seconds >= 90) break;
   if (board[i] === 'RED') { greens = 0; break; }
   if (board[i] === 'GREEN') greens++;
   if (greens === target) break;
  }
  if (greens) rewarded++;
  if (greens === 5) passes++;
  else if (greens) minutes += [0, 15, 30, 60, 120][greens];
 }
 console.log(`| ${target} | ${seconds} | ${(minutes / runs * 1000).toFixed(1)} | ${(passes / runs * 1000).toFixed(2)} | ${(rewarded / runs * 100).toFixed(2)}% |`);
}
