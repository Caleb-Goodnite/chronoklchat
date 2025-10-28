## Chronokl Chat

SvelteKit app for chat, web search, and image uploads.

### Prerequisites
- Bun (`bun --version`)

### Install
```sh
bun install
```

### Environment
Create a `.env` file (see `.env.example`) with:
```sh
# OpenRouter (chat)
OPENROUTER_API_KEY="sk_or_..."
APP_REFERER="http://localhost:5173" # optional

# Search
SUPERMEMORY_API_KEY="..."
BRAVE_API_KEY="..."

# Uploadthing
UPLOADTHING_APP_ID="..."
UPLOADTHING_SECRET="..."
```

### Build
```sh
bun run build
```

Optional preview (serves the built app):
```sh
bun run preview
```

### API
- POST `/api/chat`
  - Body: `{ messages: Array<{ role: 'user'|'ai'|'system', content: string | Array<{type:'text'|'image_url', text?: string, image_url?:{url:string}}> }>, model?: string }`
  - Uses OpenRouter. Default model: `x-ai/grok-4-fast`.

- POST `/api/search`
  - Body: `{ query: string }`
  - Looks up Supermemory first, falls back to Brave (site:grokipedia.com) and stores top result.

- GET/POST `/api/uploadthing`
  - Route `chatImage` allows up to 4 images, 8MB each.

### Scripts
- `bun run build` — production build (Vite)
- `bun run preview` — serve build
- `bun run lint` — lint

### Notes
- Do not commit real API keys. Use `.env`.
