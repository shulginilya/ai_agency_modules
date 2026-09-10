import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../src/ModuleHost';
import { ModulesProvider } from '../src/context';
import { clearModuleComponents, registerModuleComponent } from '../src/registry';
import type { ModuleManifest } from '../src/types';

const manifest: ModuleManifest = {
  id: 'demo',
  name: 'Demo',
  version: '0.1.0',
  description: '',
  capabilities: ['invoke'],
  tags: [],
  ui: { component: 'demo', default_props: { label: 'from manifest' } },
  input_schema: {},
  output_schema: {},
  config_schema: {},
};

function withManifest() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

afterEach(() => clearModuleComponents());

describe('ModuleHost', () => {
  it('renders the registered component with manifest default props', async () => {
    registerModuleComponent({
      component: 'demo',
      render: ({ props }) => <div>hello {(props as { label: string }).label}</div>,
    });

    render(
      <ModulesProvider baseUrl="/api" fetchImpl={withManifest()}>
        <ModuleHost moduleId="demo" />
      </ModulesProvider>,
    );

    await waitFor(() => expect(screen.getByText(/from manifest/)).toBeDefined());
  });

  it('explains when no component is registered for the manifest key', async () => {
    render(
      <ModulesProvider baseUrl="/api" fetchImpl={withManifest()}>
        <ModuleHost moduleId="demo" />
      </ModulesProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('demo'));
  });
});
