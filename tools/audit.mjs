#!/usr/bin/env node
// Production dependency audit with an explicit, expiring allow-list.
// Fails on any high/critical advisory in production dependencies unless it is listed below with a
// reason and a review date. Run from the repository root:  node tools/audit.mjs
import { execFileSync } from 'node:child_process';

const ALLOWED = [
  {
    packages: ['prisma', '@prisma/config', 'deepmerge-ts'],
    reason:
      'Stack exhaustion in deepmerge-ts, reachable only through the Prisma CLI loading our own prisma ' +
      'config at build/migrate time (trusted input). The runtime image does not contain the CLI. ' +
      'The fix requires Prisma 7 (driver adapters), a planned migration.',
    reviewBy: '2027-02-28',
  },
];

const today = new Date().toISOString().slice(0, 10);
let raw;
try {
  raw =
    process.platform === 'win32'
      ? execFileSync('cmd.exe', ['/d', '/c', 'npm audit --omit=dev --json'], { encoding: 'utf8' })
      : execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything
}
const { vulnerabilities = {} } = JSON.parse(raw);

const problems = [];
for (const [name, v] of Object.entries(vulnerabilities)) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue;
  const rule = ALLOWED.find((r) => r.packages.includes(name));
  if (!rule) problems.push(`${v.severity.toUpperCase()} ${name}: not allowed`);
  else if (rule.reviewBy < today) problems.push(`${v.severity.toUpperCase()} ${name}: allow-list entry expired on ${rule.reviewBy}`);
  else console.log(`allowed  ${v.severity} ${name} (review by ${rule.reviewBy})`);
}
const moderate = Object.values(vulnerabilities).filter((v) => v.severity === 'moderate' || v.severity === 'low').length;
if (moderate) console.log(`note: ${moderate} low/moderate advisories (not blocking)`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('audit ok');
