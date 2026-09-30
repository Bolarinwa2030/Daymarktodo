import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Fastify from 'fastify'
import Database from 'better-sqlite3'

const categories = ['Personal', 'Work', 'Wellbeing', 'Learning'] as const
const priorities = ['low', 'medium', 'high'] as const

type Category = (typeof categories)[number]
type Priority = (typeof priorities)[number]

interface Task {
  id: string
  title: string
  description: string
  category: Category
  priority: Priority
  dueDate: string | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

interface TaskRow extends Omit<Task, 'completed'> {
  completed: number
}

interface TaskInput {
  title?: string
  description?: string
  category?: Category
  priority?: Priority
  dueDate?: string | null
  completed?: boolean
}

const dataDirectory = path.resolve(process.cwd(), 'data')
mkdirSync(dataDirectory, { recursive: true })
const database = new Database(path.join(dataDirectory, 'daymark.sqlite'))
database.pragma('journal_mode = WAL')
database.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

const app = Fastify({ logger: true })

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    dueDate: row.dueDate,
    completed: Boolean(row.completed),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function findTask(id: string): Task | undefined {
  const row = database.prepare(`
    SELECT id, title, description, category, priority,
      due_date AS dueDate, completed,
      created_at AS createdAt, updated_at AS updatedAt
    FROM tasks WHERE id = ?
  `).get(id) as TaskRow | undefined

  return row ? fromRow(row) : undefined
}

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

app.get('/api/tasks', async () => {
  const rows = database.prepare(`
    SELECT id, title, description, category, priority,
      due_date AS dueDate, completed,
      created_at AS createdAt, updated_at AS updatedAt
    FROM tasks
    ORDER BY completed ASC, created_at DESC
  `).all() as TaskRow[]

  return rows.map(fromRow)
})

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

  database.prepare(`
    INSERT INTO tasks (id, title, description, category, priority, due_date, completed, created_at, updated_at)
    VALUES (@id, @title, @description, @category, @priority, @dueDate, @completed, @createdAt, @updatedAt)
  `).run({ ...task, completed: 0 })

  return reply.code(201).send(task)
})

app.patch<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
  const current = findTask(request.params.id)
  if (!current) return reply.code(404).send({ error: 'Task not found.' })

  const parsed = parseInput(request.body, true)
  if (parsed.error || !parsed.value || Object.keys(parsed.value).length === 0) {
    return reply.code(400).send({ error: parsed.error ?? 'Provide at least one field to update.' })
  }

  const updated: Task = { ...current, ...parsed.value, updatedAt: new Date().toISOString() }
  database.prepare(`
    UPDATE tasks SET title = @title, description = @description,
      category = @category, priority = @priority, due_date = @dueDate,
      completed = @completed, updated_at = @updatedAt
    WHERE id = @id
  `).run({ ...updated, completed: updated.completed ? 1 : 0 })

  return updated
})

app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
  const result = database.prepare('DELETE FROM tasks WHERE id = ?').run(request.params.id)
  if (result.changes === 0) return reply.code(404).send({ error: 'Task not found.' })
  return reply.code(204).send()
})

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })