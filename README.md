# Daymark

A personal task planner with a React interface and a TypeScript Fastify API. Tasks are stored locally in SQLite.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed by the client (normally `http://localhost:5173`). The API runs on `http://localhost:3001` and the Vite development server proxies `/api` requests to it. The SQLite database is created at `server/data/daymark.sqlite`.

## Production build

```sh
npm run build
npm start
```

The API exposes `GET /api/health`, `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`, and `DELETE /api/tasks/:id`.