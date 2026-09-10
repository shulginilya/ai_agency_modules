# Backend

FastAPI host for pluggable AI modules.

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn aim_core.app:app --reload
```

Docs at http://localhost:8000/docs.

## Layout

| Path | Purpose |
| --- | --- |
| `src/aim_core/contracts.py` | `AIModule`, `ModuleManifest`, `ModuleContext`, `StreamEvent` |
| `src/aim_core/registry.py` | discovery (package scan + entry points) and lookup |
| `src/aim_core/router.py` | the generic HTTP surface every module gets for free |
| `src/aim_core/app.py` | `create_app()` |
| `src/aim_modules/` | the modules themselves; `chat/` is the demo |

## Adding a module

```bash
pnpm new:module sentiment --title "Sentiment"
```

That writes `src/aim_modules/sentiment/` plus the matching React package. Nothing
needs registering: the package scan finds any `AIModule` subclass at boot.

A module living in its own distribution is discovered through entry points:

```toml
[project.entry-points."ai_modules"]
sentiment = "my_package.module:SentimentModule"
```
