// Build src/client.tsx (JSX source) into lib/client.js in the exact format the
// web plugin registry expects: a single `window.__ModuleLoader__.load({id,
// factory})` call. The banner opens the load call and defines the module
// scope; the source's `module.exports = ...` lands there; the footer returns
// it and closes the call.
//
// Externals (react, react/jsx-runtime, dsh-client-ui-primitives) are NOT
// bundled: the loader's factory `require` provides them at runtime, exactly
// like the shipped client plugins.
import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [join(here, 'src', 'client.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  external: [
    'react',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  outfile: join(here, 'lib', 'client.js'),
  banner: {
    js: `window.__ModuleLoader__.load({id:"dsh-indexbookmark",factory:(require)=>{const module={exports:{}};const exports=module.exports;Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});`,
  },
  footer: {
    js: `return module.exports;}});`,
  },
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[dsh-index] watching src/client.tsx …');
} else {
  await build(options);
}
