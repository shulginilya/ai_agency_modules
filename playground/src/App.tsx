import { useState } from 'react';
import { ModuleHost, ModulesProvider, useModules } from '@ai-modules/core';

// Importing a module package registers its UI with the client registry.
// This is the only line that changes when you add a module to the host app.
import '@ai-modules/chat';

function ModulePicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, loading, error } = useModules();

  if (loading) return <p className="pg-muted">Loading modules...</p>;
  if (error) {
    return (
      <p className="pg-error" role="alert">
        {error.message} - is the backend running on :8000?
      </p>
    );
  }
  if (!data?.length) return <p className="pg-muted">No modules discovered.</p>;

  return (
    <nav className="pg-nav">
      {data.map((manifest) => (
        <button
          key={manifest.id}
          type="button"
          className={`pg-tab${manifest.id === selected ? ' pg-tab--active' : ''}`}
          onClick={() => onSelect(manifest.id)}
        >
          <strong>{manifest.name}</strong>
          <span>{manifest.description}</span>
          <code>{manifest.capabilities.join(' · ')}</code>
        </button>
      ))}
    </nav>
  );
}

export function App() {
  const [selected, setSelected] = useState<string | null>('chat');

  return (
    <ModulesProvider baseUrl="/api">
      <div className="pg">
        <header className="pg-header">
          <h1>AI Modules Playground</h1>
          <p className="pg-muted">
            Everything below is discovered from the backend manifest - nothing is hard-coded.
          </p>
        </header>
        <div className="pg-body">
          <aside>
            <ModulePicker selected={selected} onSelect={setSelected} />
          </aside>
          <main className="pg-stage">
            {selected ? (
              <ModuleHost moduleId={selected} fallback={<p className="pg-muted">Loading...</p>} />
            ) : (
              <p className="pg-muted">Pick a module.</p>
            )}
          </main>
        </div>
      </div>
    </ModulesProvider>
  );
}
