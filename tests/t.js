// A deliberately tiny test harness: the same spec files run in the browser
// (tests/index.html) and in Node (tests/run-node.mjs), no dependencies.

const registry = [];

export function test(name, fn) {
  registry.push({ name, fn });
}

const fmt = (v) => (typeof v === 'number' ? +v.toFixed(4) : JSON.stringify(v));

export const assert = {
  ok(value, msg = 'expected a truthy value') {
    if (!value) throw new Error(msg);
  },
  equal(actual, expected, msg) {
    if (actual !== expected) throw new Error(`${msg ? msg + ': ' : ''}expected ${fmt(expected)}, got ${fmt(actual)}`);
  },
  near(actual, expected, eps, msg) {
    if (!(Math.abs(actual - expected) <= eps)) throw new Error(`${msg ? msg + ': ' : ''}expected ${fmt(expected)} ± ${eps}, got ${fmt(actual)}`);
  },
  above(actual, bound, msg) {
    if (!(actual > bound)) throw new Error(`${msg ? msg + ': ' : ''}expected > ${fmt(bound)}, got ${fmt(actual)}`);
  },
  below(actual, bound, msg) {
    if (!(actual < bound)) throw new Error(`${msg ? msg + ': ' : ''}expected < ${fmt(bound)}, got ${fmt(actual)}`);
  },
  includes(list, item, msg) {
    if (!list.includes(item)) throw new Error(`${msg ? msg + ': ' : ''}expected ${fmt(list)} to include ${fmt(item)}`);
  },
};

export async function run(report) {
  let passed = 0;
  let failed = 0;
  for (const t of registry) {
    try {
      await t.fn();
      passed++;
      report({ name: t.name, ok: true });
    } catch (error) {
      failed++;
      report({ name: t.name, ok: false, error });
    }
  }
  return { passed, failed };
}
