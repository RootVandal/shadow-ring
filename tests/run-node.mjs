// node tests/run-node.mjs — runs the same specs as tests/index.html.
import { run } from './t.js';
import './motion.spec.js';
import './game.spec.js';
import './net.spec.js';
import './quality.spec.js';

const { passed, failed } = await run(({ name, ok, error }) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : `\n        ${error.message}`}`);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
