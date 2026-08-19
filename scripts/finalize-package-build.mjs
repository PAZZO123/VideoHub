/**
 * Stamps module-type markers into the dual build output.
 *
 * The packages emit CommonJS (for NestJS, which runs on CJS) and ESM (for Vite,
 * whose bundler cannot statically analyse tsc's `__exportStar` interop). Node
 * decides how to read a `.js` file from the nearest package.json `type`, so each
 * output directory gets its own.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageDir = resolve(process.argv[2] ?? process.cwd());

writeFileSync(join(packageDir, 'dist/cjs/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
writeFileSync(join(packageDir, 'dist/esm/package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');

console.log(`finalized dual build for ${packageDir}`);
