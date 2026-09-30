import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'
import Database from 'better-sqlite3'

export const categories = ['Personal', 'Work', 'Wellbeing', 'Learning'] as const
export const priorities = ['low', 'medium', 'high'] as const

export type Category = (typeof categories)[number]
export type Priority = (typeof priorities)[number]

export interface Task {
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

export interface TaskInput {
  title?: string
  description?: string
  category?: Category
  priority?: Priority
  dueDate?: string | null
  completed?: boolean
}

interface TaskRow extends Omit<Task, 'completed'> {
  completed: boolean | number
}

interface TaskStorage {
  list(): Promise<Task[]>
  get(id: string): Promise<Task | undefined>
  insert(task: Task): Promise<void>
  update(task: Task): Promise<void>
  delete(id: string): Promise<boolean>
}

function fromRow(row: TaskRow): Task {
  return { ...row, completed: Boolean(row.completed) }
}

const selectTasks = `
  SELECT id, title, description, category, priority,
    due_date AS dueDate, completed,
    created_at AS createdAt, updated_at AS updatedAt
  FROM tasks
`

class SqliteTaskStorage implements TaskStorage {
  private readonly database: Database.Database

  constructor() {
    const dataDirectory = path.resolve(process.cwd(), 'data')
    mkdirSync(dataDirectory, { recursive: true })
    this.database = new Database(path.join(dataDirectory, 'daymark.sqlite'))
    this.database.pragma('journal_mode = WAL')
    this.database.exec(`
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
  }

  async list(): Promise<Task[]> {
    const rows = this.database.prepare(`${selectTasks} ORDER BY completed ASC, created_at DESC`).all() as TaskRow[]
    return rows.map(fromRow)
  }

  async get(id: string): Promise<Task | undefined> {
    const row = this.database.prepare(`${selectTasks} WHERE id = ?`).get(id) as TaskRow | undefined
    return row ? fromRow(row) : undefined
  }

  async insert(task: Task): Promise<void> {
    this.database.prepare(`
      INSERT INTO tasks (id, title, description, category, priority, due_date, completed, created_at, updated_at)
      VALUES (@id, @title, @description, @category, @priority, @dueDate, @completed, @createdAt, @updatedAt)
    `).run({ ...task, completed: task.completed ? 1 : 0 })
  }

  async update(task: Task): Promise<void> {
    this.database.prepare(`
      UPDATE tasks SET title = @title, description = @description,
        category = @category, priority = @priority, due_date = @dueDate,
        completed = @completed, updated_at = @updatedAt
      WHERE id = @id
    `).run({ ...task, completed: task.completed ? 1 : 0 })
  }

  async delete(id: string): Promise<boolean> {
    return this.database.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0
  }
}

class NeonTaskStorage implements TaskStorage {
  private readonly sql: ReturnType<typeof neon>
  private schemaReady?: Promise<void>

  constructor(connectionString: string) {
    this.sql = neon(connectionString)
  }

  private async ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.sql`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL,
          priority TEXT NOT NULL,
          due_date TEXT,
          completed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `.then(() => undefined).catch((error: unknown) => {
        this.schemaReady = undefined
        throw error
      })
    }
    await this.schemaReady
  }

  async list(): Promise<Task[]> {
    await this.ensureSchema()
    const rows = await this.sql`${this.sql.unsafe(selectTasks)} ORDER BY completed ASC, created_at DESC`
    return (rows as TaskRow[]).map(fromRow)
  }

  async get(id: string): Promise<Task | undefined> {
    await this.ensureSchema()
    const rows = await this.sql`SELECT id, title, description, category, priority, due_date AS "dueDate", completed, created_at AS "createdAt", updated_at AS "updatedAt" FROM tasks WHERE id = ${id}` as TaskRow[]
    return rows[0] ? fromRow(rows[0]) : undefined
  }

  async insert(task: Task): Promise<void> {
    await this.ensureSchema()
    await this.sql`
      INSERT INTO tasks (id, title, description, category, priority, due_date, completed, created_at, updated_at)
      VALUES (${task.id}, ${task.title}, ${task.description}, ${task.category}, ${task.priority}, ${task.dueDate}, ${task.completed}, ${task.createdAt}, ${task.updatedAt})
    `
  }

  async update(task: Task): Promise<void> {
    await this.ensureSchema()
    await this.sql`
      UPDATE tasks SET title = ${task.title}, description = ${task.description},
        category = ${task.category}, priority = ${task.priority}, due_date = ${task.dueDate},
        completed = ${task.completed}, updated_at = ${task.updatedAt}
      WHERE id = ${task.id}
    `
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureSchema()
    const rows = await this.sql`DELETE FROM tasks WHERE id = ${id} RETURNING id` as { id: string }[]
    return rows.length > 0
  }
}

let storage: TaskStorage | undefined

export async function getTaskStorage(): Promise<TaskStorage> {
  if (storage) return storage

  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl) {
    storage = new NeonTaskStorage(databaseUrl)
    return storage
  }
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL must be set to a Neon Postgres connection string on Vercel.')
  }

  storage = new SqliteTaskStorage()
  return storage
}