/**
 * Proves every level is solvable, and reports its true difficulty.
 *
 * Runs in a real browser because the level modules build Three.js geometry and
 * draw canvas textures. No rendering happens -- only the navigation graph and
 * the mechanism state machines are exercised.
 *
 *   npx --yes http-server -p 8099 -s .     # in one terminal
 *   node tests/audit-levels.mjs            # in another
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8099';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));

await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'domcontentloaded' });

const report = await page.evaluate(async (origin) => {
  const { LEVELS } = await import(`${origin}/src/world/Levels.js`);
  const { buildLevel } = await import(`${origin}/src/world/LevelBuilder.js`);
  const { auditLevel } = await import(`${origin}/src/nav/Solver.js`);
  return LEVELS.map((definition) => {
    try {
      return auditLevel(buildLevel(definition));
    } catch (error) {
      return { id: definition.id, name: definition.name, error: error.message };
    }
  });
}, ORIGIN);

let failures = 0;
console.log('level              par  declared  nodes  mechs  status');
console.log('-----------------------------------------------------------------');
for (const row of report) {
  if (row.error) {
    failures++;
    console.log(`${row.id.padEnd(6)} ${row.name.padEnd(18)} BUILD FAILED: ${row.error}`);
    continue;
  }
  const problems = [];
  if (!row.solvable) problems.push('UNSOLVABLE');
  if (row.alreadyOpen) problems.push('ALREADY-OPEN');
  if (row.orphans.length) problems.push(`ORPHANS:${row.orphans.join(',')}`);
  if (row.solvable && row.par !== row.declaredPar) problems.push(`PAR-MISMATCH(actual ${row.par})`);
  if (problems.length) failures++;
  console.log(
    `${row.id.padEnd(5)} ${row.name.padEnd(18)} ${String(row.par).padStart(3)}  ${String(row.declaredPar).padStart(8)}  ` +
    `${String(row.nodes).padStart(5)}  ${String(row.mechanisms).padStart(5)}  ${problems.length ? problems.join(' ') : 'ok'}`
  );
  if (row.solvable && problems.length === 0) console.log(`        solution: ${row.sequence.map((s) => `${s.id}->${s.to}@${s.at}`).join('  ')}`);
}

// Difficulty must actually increase, or the whole point of ten levels is lost.
const pars = report.filter((r) => r.solvable).map((r) => r.par);
const monotonic = pars.every((p, i) => i === 0 || p >= pars[i - 1]);
console.log('-----------------------------------------------------------------');
console.log('par curve:', pars.join(' -> '), monotonic ? '(non-decreasing ok)' : '(NOT MONOTONIC)');
if (!monotonic) failures++;
console.log(failures ? `\n${failures} PROBLEM(S)` : '\nAll levels solvable and correctly rated.');

await browser.close();
process.exit(failures ? 1 : 0);
