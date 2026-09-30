import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import { categories, getTaskStorage, priorities, type Category, type Priority, type Task, type TaskInput } from './storage.js'

const app = Fastify({ logger: true })

app.setErrorHandler((error, request, reply) => {
  request.log.error(error)
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    return reply.code(503).send({ error: 'Database not configured. Set DATABASE_URL in the Vercel project.' })
  }
  return reply.code(500).send({ error: 'Internal server error.' })
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function parseInput(body: unknown, partial: boolean): { value?: TaskInput; error?: string } {
  if (!isRecord(body)) return { error: 'Request body must be an object.' }

  const input: TaskInput = {}
  if ('title' in body) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 180) {
      return { error: 'Title must be between 1 and 180 characters.' }
    }
    input.title = body.title.trim()
  } else if (!partial) {
    return { error: 'A title is required.' }
  }

  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.length > 2000) {
      return { error: 'Description must be 2000 characters or fewer.' }
    }
    input.description = body.description.trim()
  }
  if ('category' in body) {
    if (typeof body.category !== 'string' || !categories.includes(body.category as Category)) {
      return { error: 'Choose a valid category.' }
    }
    input.category = body.category as Category
  }
  if ('priority' in body) {
    if (typeof body.priority !== 'string' || !priorities.includes(body.priority as Priority)) {
      return { error: 'Choose a valid priority.' }
    }
    input.priority = body.priority as Priority
  }
  if ('dueDate' in body) {
    if (body.dueDate !== null && !isDate(body.dueDate)) {
      return { error: 'Due date must be a valid calendar date.' }
    }
    input.dueDate = body.dueDate as string | null
  }
  if ('completed' in body) {
    if (typeof body.completed !== 'boolean') return { error: 'Completed must be true or false.' }
    input.completed = body.completed
  }

  return { value: input }
}

app.get('/api/health', async () => ({ status: 'ok' }))

app.get('/api/tasks', async () => (await getTaskStorage()).list())

app.post('/api/tasks', async (request, reply) => {
  const parsed = parseInput(request.body, false)
  if (parsed.error || !parsed.value) return reply.code(400).send({ error: parsed.error })

  const now = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    title: parsed.value.title!,
    description: parsed.value.description ?? '',
    category: parsed.value.category ?? 'Personal',
    priority: parsed.value.priority ?? 'medium',
    dueDate: parsed.value.dueDate ?? null,
    completed: false,
    createdAt: now,
    updatedAt: now,
  }

  await (await getTaskStorage()).insert(task)

  return reply.code(201).send(task)
})

app.patch<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
  const storage = await getTaskStorage()
  const current = await storage.get(request.params.id)
  if (!current) return reply.code(404).send({ error: 'Task not found.' })

  const parsed = parseInput(request.body, true)
  if (parsed.error || !parsed.value || Object.keys(parsed.value).length === 0) {
    return reply.code(400).send({ error: parsed.error ?? 'Provide at least one field to update.' })
  }

  const updated: Task = { ...current, ...parsed.value, updatedAt: new Date().toISOString() }
  await storage.update(updated)

  return updated
})

app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
  const deleted = await (await getTaskStorage()).delete(request.params.id)
  if (!deleted) return reply.code(404).send({ error: 'Task not found.' })
  return reply.code(204).send()
})

if (process.env.VERCEL) {
  const publicDirectory = path.resolve(process.cwd(), 'public')
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found.' })
    }

    const pathname = new URL(request.url, 'http://localhost').pathname
    let relativePath: string
    try {
      relativePath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
    } catch {
      return reply.code(404).send({ error: 'Not found.' })
    }

    let filePath = path.resolve(publicDirectory, relativePath)
    if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
      return reply.code(404).send({ error: 'Not found.' })
    }

    let contents: Buffer
    try {
      contents = await readFile(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (path.extname(pathname)) return reply.code(404).send({ error: 'Not found.' })

      filePath = path.join(publicDirectory, 'index.html')
      contents = await readFile(filePath)
    }

    const extension = path.extname(filePath)
    const cacheControl = extension === '.html'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable'

    return reply
      .type(contentTypes[extension] ?? 'application/octet-stream')
      .header('cache-control', cacheControl)
      .send(contents)
  })
}

export default app