/**
 * Plays every level to completion, in the real game, through the real systems.
 *
 * The "player" is the solver: at each step it asks for the shortest remaining
 * solution from wherever the traveller is standing, then does the first thing
 * that solution asks for. That exercises navigation, gating, mechanism state
 * machines, the rider rule and the completion sequence together -- and if a
 * level is unsolvable from some state the game can actually reach, this hangs
 * on it rather than passing quietly.
 */
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8099';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.mouse.click(196, 400);          // lift the title veil; also unlocks audio
await page.waitForTimeout(1200);

const playLevel = (index) => page.evaluate(async (i) => {
  const { solveLevel } = await import('/src/nav/Solver.js');
  const g = window.game;
  g.loadLevel(i);
  await new Promise((r) => setTimeout(r, 200));

  const settle = async (test, limit = 90000) => {
    const t0 = performance.now();
    while (test() && performance.now() - t0 < limit) await new Promise((r) => setTimeout(r, 40));
    return !test();
  };
  const walkTo = async (id) => {
    if (!g.navigation.goTo(id)) return g.navigation.currentNode.id === id;
    return settle(() => g.navigation.isWalking);
  };

  const portal = [...g.level.nav.nodes.values()].find((n) => n.tag === 'portal');
  const activations = [];

  for (let step = 0; step < 40; step++) {
    const here = g.navigation.currentNode.id;
    const plan = solveLevel(g.level, { fromNodeId: here });
    if (!plan.solvable) return { index: i, id: g.level.id, error: `no solution from ${here}` };

    if (plan.sequence.length === 0) {
      if (!(await walkTo(portal.id))) return { index: i, id: g.level.id, error: 'could not walk to portal' };
      break;
    }

    const step = plan.sequence[0];
    const mechId = step.id;
    const mech = g.level.mechanismsById.get(mechId);
    // Stand where the solution says. Some solutions require being carried by
    // the very mechanism being activated, so this is not optional.
    if (g.navigation.currentNode.id !== step.at) {
      if (!(await walkTo(step.at))) return { index: i, id: g.level.id, error: `could not reach ${step.at}` };
    }
    if (!mech.activate()) return { index: i, id: g.level.id, error: `could not activate ${mechId}` };
    activations.push(mechId);
    await settle(() => mech.isMoving);
  }

  const finished = await settle(
    () => document.getElementById('complete').classList.contains('hidden'), 120000);

  return {
    index: i,
    id: g.level.id,
    name: g.level.name,
    par: g.level.definition.par,
    used: activations.length,
    activations,
    finished,
    unlocked: g.progress.highestUnlocked,
    atPortal: g.navigation.currentNode.id === portal.id,
  };
}, index);

let failures = 0;
console.log('level                 par  used  finished  unlocked  status');
console.log('---------------------------------------------------------------------');
for (let i = 0; i < 10; i++) {
  const r = await playLevel(i);
  if (r.error) {
    failures++;
    console.log(`${String(i + 1).padStart(2)}  ${(r.id ?? '?').padEnd(18)} ERROR: ${r.error}`);
    continue;
  }
  const problems = [];
  if (!r.atPortal) problems.push('NOT-AT-PORTAL');
  if (!r.finished) problems.push('NO-COMPLETE-PANEL');
  if (r.used !== r.par) problems.push(`USED-${r.used}-EXPECTED-${r.par}`);
  if (r.unlocked < Math.min(i + 1, 9)) problems.push(`UNLOCK-${r.unlocked}`);
  if (problems.length) failures++;
  console.log(
    `${String(i + 1).padStart(2)}  ${r.name.padEnd(18)} ${String(r.par).padStart(3)}  ${String(r.used).padStart(4)}  ` +
    `${String(r.finished).padStart(8)}  ${String(r.unlocked).padStart(8)}  ${problems.length ? problems.join(' ') : 'ok'}`
  );
}

console.log('---------------------------------------------------------------------');
if (errors.length) { console.log('console errors:', JSON.stringify(errors.slice(0, 8), null, 2)); failures++; }
console.log(failures ? `\n${failures} PROBLEM(S)` : '\nAll ten levels completed end to end.');
await browser.close();
process.exit(failures ? 1 : 0);
