# ai_agency_modules

Pluggable AI modules: each module ships a **Python backend** implementation and a
**React frontend** component, and gets discovered, mounted and rendered without
the host app knowing anything about it in advance.

```
┌─ backend/ ──────────────────┐        ┌─ packages/ ─────────────────┐
│ aim_core   framework        │        │ @ai-modules/core            │
│  ├ contracts.py  AIModule   │◀─HTTP─▶│  client · hooks · ModuleHost│
│  ├ registry.py   discovery  │  SSE   │                             │
│  └ router.py     generic API│        │ @ai-modules/chat            │
│ aim_modules/chat  the demo  │        │  ChatPanel · useChat        │
└─────────────────────────────┘        └─────────────────────────────┘
```

The contract between the two halves is the **manifest**. A module declares its
id, capabilities, JSON schemas and which UI component renders it; the frontend
asks the backend what exists and renders `<ModuleHost moduleId="chat" />`.
Adding a module touches no shared registry file on either side.

## Quick start

Two terminals:

```bash
# 1. backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn aim_core.app:app --reload                   # http://localhost:8000/docs

# 2. frontend
pnpm install
pnpm dev                                            # http://localhost:5173
```

Or both at once:

```bash
docker compose up --build
```

The demo chat module defaults to a **mock provider**, so it runs with no API key.
For a real model set `AIM_LLM_PROVIDER=anthropic` and `AIM_ANTHROPIC_API_KEY` in
`backend/.env`, and `pip install -e "backend[anthropic]"`.

## Repo layout

| Path | What it is |
| --- | --- |
| `backend/src/aim_core/` | the module framework: contracts, registry, SSE, FastAPI app factory |
| `backend/src/aim_modules/chat/` | the demo module (schemas, providers, module) |
| `packages/core/` | `@ai-modules/core` — client, React provider, hooks, `ModuleHost` |
| `packages/module-chat/` | `@ai-modules/chat` — the chat UI, published separately |
| `playground/` | Vite app that renders whatever the backend exposes |
| `tools/scaffold/` | `pnpm new:module <name>` generator |

## The HTTP surface every module gets

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/modules` | all manifests |
| `GET` | `/api/modules/{id}` | one manifest (with generated JSON schemas) |
| `GET` | `/api/modules/{id}/health` | module-reported health |
| `POST` | `/api/modules/{id}/invoke` | `{payload, config, metadata}` → `{result}` |
| `POST` | `/api/modules/{id}/stream` | the same, as SSE (`start`/`delta`/`message`/`done`/`error`) |
| `*` | `/api/modules/{id}/x/...` | routes the module defines itself |

`payload` is the module's own domain contract (validated against `InputModel`);
`config` is per-request knobs reaching the module as `ModuleContext.config`.

## Adding a module

```bash
pnpm new:module sentiment --title "Sentiment" --description "Classify tone"
pnpm install
```

Then implement `invoke`, and import the new package once in the host app so its
component registers. Backend discovery is automatic — the package scan picks up
any `AIModule` subclass under `aim_modules`.

A module can also live in **its own repo** and be installed with pip; expose it
through the `ai_modules` entry-point group and the registry finds it:

```toml
[project.entry-points."ai_modules"]
sentiment = "my_package.module:SentimentModule"
```

## Using the packages in a host app

```tsx
import { ModulesProvider, ModuleHost } from '@ai-modules/core';
import '@ai-modules/chat';              // side-effect: registers the UI
import '@ai-modules/chat/styles.css';

export function App() {
  return (
    <ModulesProvider baseUrl="/api" headers={() => ({ Authorization: `Bearer ${token}` })}>
      <ModuleHost moduleId="chat" props={{ showUsage: true }} />
    </ModulesProvider>
  );
}
```

Or drive it yourself with the hooks: `useModules`, `useModuleManifest`,
`useModuleInvoke`, `useModuleStream` — and, for chat specifically, `useChat`.

## Tests

```bash
cd backend && pytest        # framework + module + HTTP/SSE
pnpm test                   # client, ModuleHost, ChatPanel
pnpm typecheck && pnpm build
```

CI runs all of the above on push and PR (`.github/workflows/ci.yml`).

## Conventions

- A module never imports another module. Shared behaviour goes in `aim_core`.
- The manifest is the only coupling point between backend and frontend.
- Provider SDKs sit behind an adapter (see `chat/providers.py`) so modules stay
  testable and vendor-swappable.
- Anything a module needs per request arrives via `ModuleContext`, not globals.
