// ============================================================================
// KRUNKEDFALL — Master Triple-Gate Verification Orchestrator (verify-all.ts)
// ============================================================================
// Runs Gate A (verify:assets), Vitest suites (test), and Gate B (verify:sim)
// sequentially, printing a clear summary and exiting non-zero if any gate fails.

import { spawnSync } from 'node:child_process';

interface GateSpec {
  id: string;
  label: string;
  npmScript: string;
}

interface GateResult {
  id: string;
  label: string;
  passed: boolean;
  exitCode: number;
  durationMs: number;
}

const GATES: readonly GateSpec[] = [
  { id: 'Gate A', label: 'Asset, Brand Firewall & Oracle Parity', npmScript: 'verify:assets' },
  { id: 'Vitest', label: 'Unit & Integration Test Suites', npmScript: 'test' },
  { id: 'Gate B', label: 'Headless Campaign Soak & Determinism', npmScript: 'verify:sim' },
];

function runGate(spec: GateSpec): GateResult {
  console.log(`\n========================================================================`);
  console.log(`>>> Running ${spec.id}: ${spec.label} (npm run ${spec.npmScript})`);
  console.log(`========================================================================`);

  const start = Date.now();
  const isWin = process.platform === 'win32';
  const res = spawnSync(isWin ? 'npm.cmd' : 'npm', ['run', spec.npmScript], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: isWin,
  });
  const durationMs = Date.now() - start;
  const exitCode = res.status ?? (res.error ? 1 : 0);

  if (res.error) {
    console.error(`[${spec.id} ERROR] ${res.error.message}`);
  }

  return {
    id: spec.id,
    label: spec.label,
    passed: exitCode === 0,
    exitCode,
    durationMs,
  };
}

function main(): void {
  const totalStart = Date.now();
  const results: GateResult[] = [];

  for (const gate of GATES) {
    results.push(runGate(gate));
  }

  const totalMs = Date.now() - totalStart;
  const failed = results.filter((r) => !r.passed);

  console.log(`\n========================================================================`);
  console.log('KRUNKEDFALL — VERIFICATION GATE SUMMARY');
  console.log(`========================================================================`);
  for (const r of results) {
    const status = r.passed ? 'PASS' : `FAIL (exit ${r.exitCode})`;
    console.log(`  [${status.padEnd(14)}] ${r.id.padEnd(8)} — ${r.label} (${(r.durationMs / 1000).toFixed(2)}s)`);
  }
  console.log(`------------------------------------------------------------------------`);
  console.log(
    `  Total: ${results.length - failed.length}/${results.length} passed in ${(totalMs / 1000).toFixed(2)}s`,
  );
  console.log(`========================================================================`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
