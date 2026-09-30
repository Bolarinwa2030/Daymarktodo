# Daymark

A personal task planner with a React interface and a TypeScript Fastify API. Local development stores tasks in SQLite; Vercel deployments use Neon Postgres for durable storage.

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

## Deploy to Vercel

1. Create a Postgres project with [Neon](https://neon.tech/) and copy its connection string.
2. Import this repository into Vercel with the repository root as the project root.
3. Add `DATABASE_URL` to the Vercel project's environment variables for Production (and Preview if needed).
4. Deploy. Vercel runs `npm run build`; Fastify serves the API and the React build from `public/`.

The Vercel runtime requires `DATABASE_URL`; it will not fall back to its ephemeral filesystem. Local development continues to use SQLite unless `DATABASE_URL` is set. The app does not include user accounts, so enable Vercel Deployment Protection before using it for private tasks.