#!/usr/bin/env node
/**
 * Scaffold a new pluggable module on both sides.
 *
 *   pnpm new:module sentiment --title "Sentiment" --description "Classify tone"
 *
 * Generates:
 *   backend/src/aim_modules/<snake>/{__init__,schemas,module}.py
 *   backend/tests/test_<snake>_module.py
 *   packages/module-<kebab>/{package.json,vite.config.ts,tsconfig.json,src/*}
 *
 * Nothing needs registering afterwards: the backend discovers the module by
 * package scan, and the frontend registers its component on import.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const [name, ...rest] = argv;
  if (!name || name.startsWith('-')) {
    console.error(
      'Usage: pnpm new:module <name> [--title "Title"] [--description "..."] [--no-stream]',
    );
    process.exit(1);
  }
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key.startsWith('no-')) flags[key.slice(3)] = false;
    else flags[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : true;
  }
  return { name, flags };
}

const kebab = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const snake = (s) => kebab(s).replace(/-/g, '_');
const pascal = (s) =>
  kebab(s)
    .split('-')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function write(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) {
    console.warn(`  skip   ${path.replace(ROOT + '/', '')} (exists)`);
    return;
  }
  await writeFile(path, contents, 'utf8');
  console.log(`  create ${path.replace(ROOT + '/', '')}`);
}

const { name, flags } = parseArgs(process.argv.slice(2));
const id = kebab(name);
const py = snake(name);
const Cls = pascal(name);
const hook = `use${Cls}`;
const title = typeof flags.title === 'string' ? flags.title : Cls;
const description = typeof flags.description === 'string' ? flags.description : `${title} module.`;
const streaming = flags.stream !== false;
const capabilities = streaming ? '["invoke", "stream"]' : '["invoke"]';

// ---------------------------------------------------------------- backend ---
const pySchemas = `"""Input/output contract for the ${id} module."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ${Cls}Input(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=32_000)


class ${Cls}Output(BaseModel):
    model_config = ConfigDict(extra="forbid")

    result: str
`;

const pyModule = `"""${description}"""

from __future__ import annotations

${streaming ? 'from collections.abc import AsyncIterator\n\n' : ''}from aim_core.contracts import AIModule, ModuleContext, ModuleManifest${streaming ? ', StreamEvent' : ''}, UISpec

from .schemas import ${Cls}Input, ${Cls}Output


class ${Cls}Module(AIModule[${Cls}Input, ${Cls}Output]):
    manifest = ModuleManifest(
        id="${id}",
        name="${title}",
        version="0.1.0",
        description="${description}",
        capabilities=${capabilities},
        ui=UISpec(component="${id}", package="@ai-modules/${id}"),
    )
    InputModel = ${Cls}Input
    OutputModel = ${Cls}Output

    async def invoke(self, payload: ${Cls}Input, ctx: ModuleContext) -> ${Cls}Output:
        # TODO: real implementation
        return ${Cls}Output(result=payload.text.upper())
${
  streaming
    ? `
    async def stream(
        self, payload: ${Cls}Input, ctx: ModuleContext
    ) -> AsyncIterator[StreamEvent]:
        result = await self.invoke(payload, ctx)
        for chunk in result.result.split():
            yield StreamEvent.delta(chunk + " ")
        yield StreamEvent(type="message", data=result.model_dump())
        yield StreamEvent.done()
`
    : ''
}`;

const pyInit = `"""${title} module package."""

from .module import ${Cls}Module
from .schemas import ${Cls}Input, ${Cls}Output

__all__ = ["${Cls}Input", "${Cls}Module", "${Cls}Output"]
`;

const pyTest = `from __future__ import annotations

from aim_core import ModuleContext, ModuleRegistry
from aim_modules.${py} import ${Cls}Input, ${Cls}Module


async def test_invoke():
    result = await ${Cls}Module().invoke(
        ${Cls}Input(text="hello"), ModuleContext(module_id="${id}")
    )
    assert result.result == "HELLO"


def test_module_is_discovered():
    assert "${id}" in ModuleRegistry().discover(packages=["aim_modules"]).ids()
`;

// --------------------------------------------------------------- frontend ---
const tsTypes = `export interface ${Cls}Payload {
  text: string;
}

export interface ${Cls}Result {
  result: string;
}

export interface ${Cls}PanelOptions {
  placeholder?: string;
}
`;

const tsPanel = `import { useState } from 'react';
import { useModuleInvoke, type ModuleComponentProps } from '@ai-modules/core';
import type { ${Cls}PanelOptions, ${Cls}Payload, ${Cls}Result } from './types';

export type ${Cls}PanelProps = ModuleComponentProps<${Cls}PanelOptions>;

export function ${Cls}Panel({ manifest, config, props, className }: ${Cls}PanelProps) {
  const { placeholder = 'Enter text...' } = props ?? {};
  const [text, setText] = useState('');
  const { data, loading, error, invoke } = useModuleInvoke<${Cls}Result, ${Cls}Payload>(
    manifest?.id ?? '${id}',
  );

  return (
    <section className={className}>
      <h2>{manifest?.name ?? '${title}'}</h2>
      <textarea
        aria-label="Input"
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="button" disabled={loading || !text.trim()} onClick={() => void invoke({ payload: { text }, config })}>
        {loading ? 'Working...' : 'Run'}
      </button>
      {error ? <p role="alert">{error.message}</p> : null}
      {data ? <pre>{data.result}</pre> : null}
    </section>
  );
}
`;

const tsIndex = `import { registerModuleComponent } from '@ai-modules/core';
import { ${Cls}Panel } from './${Cls}Panel';

registerModuleComponent({
  component: '${id}',
  displayName: '${title}',
  render: ${Cls}Panel,
});

export { ${Cls}Panel, type ${Cls}PanelProps } from './${Cls}Panel';
export type { ${Cls}Payload, ${Cls}PanelOptions, ${Cls}Result } from './types';
`;

const pkgJson =
  JSON.stringify(
    {
      name: `@ai-modules/${id}`,
      version: '0.1.0',
      description,
      type: 'module',
      sideEffects: ['./dist/index.js', './dist/index.cjs', '*.css'],
      main: './dist/index.cjs',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.cjs' },
      },
      files: ['dist'],
      scripts: {
        build: 'vite build',
        dev: 'vite build --watch',
        typecheck: 'tsc --noEmit',
        test: 'vitest run --passWithNoTests',
      },
      peerDependencies: { '@ai-modules/core': '^0.1.0', react: '>=18', 'react-dom': '>=18' },
      devDependencies: {
        '@ai-modules/core': 'workspace:*',
        '@types/node': '^22.10.2',
        '@types/react': '^18.3.12',
        '@types/react-dom': '^18.3.1',
        '@vitejs/plugin-react': '^4.3.4',
        jsdom: '^25.0.1',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        typescript: '^5.7.2',
        vite: '^6.0.3',
        'vite-plugin-dts': '^4.3.0',
        vitest: '^3.0.5',
      },
      publishConfig: { access: 'public' },
    },
    null,
    2,
  ) + '\n';

const viteConfig = `import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AiModules${Cls}',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@ai-modules/core'],
    },
    sourcemap: true,
  },
  test: { environment: 'jsdom', globals: true },
});
`;

const tsconfig = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals"],
    "paths": { "@ai-modules/core": ["../core/src"] }
  },
  "include": ["src", "tests", "vite.config.ts"]
}
`;

const backendDir = join(ROOT, 'backend/src/aim_modules', py);
const frontendDir = join(ROOT, 'packages', `module-${id}`);

console.log(`\nScaffolding module "${id}" (${hook} hook, class ${Cls}Module)\n`);
await write(join(backendDir, '__init__.py'), pyInit);
await write(join(backendDir, 'schemas.py'), pySchemas);
await write(join(backendDir, 'module.py'), pyModule);
await write(join(ROOT, 'backend/tests', `test_${py}_module.py`), pyTest);
await write(join(frontendDir, 'package.json'), pkgJson);
await write(join(frontendDir, 'vite.config.ts'), viteConfig);
await write(join(frontendDir, 'tsconfig.json'), tsconfig);
await write(join(frontendDir, 'src/types.ts'), tsTypes);
await write(join(frontendDir, `src/${Cls}Panel.tsx`), tsPanel);
await write(join(frontendDir, 'src/index.ts'), tsIndex);

console.log(`
Next:
  1. pnpm install                       # link the new workspace package
  2. add "@ai-modules/${id}" to playground/package.json and import it in App.tsx
  3. implement ${Cls}Module.invoke in backend/src/aim_modules/${py}/module.py
  4. pnpm test && cd backend && pytest
`);
