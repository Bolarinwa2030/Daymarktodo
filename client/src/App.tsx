import { useEffect, useState } from 'react'
import {
  Asterisk,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  Clock3,
  ListTodo,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

type Category = 'Personal' | 'Work' | 'Wellbeing' | 'Learning'
type Priority = 'low' | 'medium' | 'high'
type View = 'today' | 'upcoming' | 'all'

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

interface TaskDraft {
  title: string
  description: string
  category: Category
  priority: Priority
  dueDate: string
}

const categoryOptions: Category[] = ['Personal', 'Work', 'Wellbeing', 'Learning']
const today = new Date().toLocaleDateString('en-CA')

function dateLabel(date: string | null): string {
  if (!date) return 'No due date'
  const value = new Date(`${date}T12:00:00`)
  if (date === today) return 'Today'
  if (date === new Date(Date.now() + 86400000).toLocaleDateString('en-CA')) return 'Tomorrow'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(value)
}

function prettyDate(): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date())
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error ?? 'Something went wrong. Please try again.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function TaskEditor({
  task,
  onClose,
  onSave,
}: {
  task: Task | null
  onClose: () => void
  onSave: (draft: TaskDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: task?.category ?? 'Personal',
    priority: task?.priority ?? 'medium',
    dueDate: task?.dueDate ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not save this task.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-topline">
          <span className="dialog-kicker">{task ? 'REFINE YOUR PLAN' : 'A NEW INTENTION'}</span>
          <button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog" type="button">
            <X size={18} />
          </button>
        </div>
        <h2 id="editor-title">{task ? 'Edit task' : 'What needs doing?'}</h2>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="task-title">Task</label>
          <input
            id="task-title"
            autoFocus
            maxLength={180}
            placeholder="Give it a clear name"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            required
          />
          <label className="field-label" htmlFor="task-description">A little more detail <span>OPTIONAL</span></label>
          <textarea
            id="task-description"
            maxLength={2000}
            placeholder="Add a note, a link, or the first small step..."
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          <div className="field-grid">
            <label className="field-label" htmlFor="task-category">
              Area
              <select
                id="task-category"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value as Category })}
              >
                {categoryOptions.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="task-date">
              Due date
              <input
                id="task-date"
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
              />
            </label>
          </div>
          <fieldset className="priority-field">
            <legend className="field-label">Priority</legend>
            <div className="priority-options">
              {(['low', 'medium', 'high'] as Priority[]).map((priority) => (
                <label className={`priority-option ${priority} ${draft.priority === priority ? 'selected' : ''}`} key={priority}>
                  <input
                    type="radio"
                    name="priority"
                    value={priority}
                    checked={draft.priority === priority}
                    onChange={() => setDraft({ ...draft, priority })}
                  />
                  <span className="priority-dot" />
                  {priority}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="text-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? 'Saving...' : task ? 'Save changes' : 'Add to my day'}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [activeView, setActiveView] = useState<View>('today')
  const [query, setQuery] = useState('')
  const [editorTask, setEditorTask] = useState<Task | null | undefined>(undefined)
  const [showCompleted, setShowCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  async function loadTasks() {
    const loaded = await request<Task[]>('/api/tasks')
    setTasks(loaded)
  }

  useEffect(() => {
    loadTasks()
      .catch((issue: unknown) => setNotice(issue instanceof Error ? issue.message : 'Could not load tasks.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      const target = event.target
      const isEditingField = target instanceof HTMLElement
        && (target.isContentEditable || target.matches('input, textarea, select'))

      if (event.key === 'Escape' && editorTask !== undefined) {
        setEditorTask(undefined)
        return
      }
      if (
        event.key.toLowerCase() === 'n'
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !isEditingField
        && editorTask === undefined
      ) {
        event.preventDefault()
        setEditorTask(null)
      }
    }

    window.addEventListener('keydown', handleShortcuts)
    return () => window.removeEventListener('keydown', handleShortcuts)
  }, [editorTask])

  const matchesView = (task: Task) => {
    if (activeView === 'all') return true
    if (activeView === 'upcoming') return Boolean(task.dueDate && task.dueDate > today)
    return !task.dueDate || task.dueDate <= today
  }
  const matchesSearch = (task: Task) => {
    const haystack = `${task.title} ${task.description} ${task.category}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  }
  const visibleTasks = tasks
    .filter((task) => matchesView(task) && matchesSearch(task))
    .sort((left, right) => {
      if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed)
      if (left.dueDate !== right.dueDate) return (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999')
      const rank = { high: 0, medium: 1, low: 2 }
      return rank[left.priority] - rank[right.priority]
    })
  const openTasks = visibleTasks.filter((task) => !task.completed)
  const completedTasks = visibleTasks.filter((task) => task.completed)
  const openCount = tasks.filter((task) => !task.completed).length
  const completeCount = tasks.filter((task) => task.completed).length
  const todayCount = tasks.filter((task) => !task.completed && (!task.dueDate || task.dueDate <= today)).length
  const progress = tasks.length === 0 ? 0 : Math.round((completeCount / tasks.length) * 100)
  const nextTask = tasks
    .filter((task) => !task.completed && task.dueDate && task.dueDate >= today)
    .sort((left, right) => left.dueDate!.localeCompare(right.dueDate!))[0]

  async function saveTask(draft: TaskDraft) {
    const payload = { ...draft, title: draft.title.trim(), dueDate: draft.dueDate || null }
    if (editorTask) {
      await request<Task>(`/api/tasks/${editorTask.id}`, {
        method: 'PATCH', body: JSON.stringify(payload),
      })
    } else {
      await request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) })
    }
    setEditorTask(undefined)
    setNotice('')
    await loadTasks()
  }

  async function toggleTask(task: Task) {
    try {
      const updated = await request<Task>(`/api/tasks/${task.id}`, {
        method: 'PATCH', body: JSON.stringify({ completed: !task.completed }),
      })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (issue) {
      setNotice(issue instanceof Error ? issue.message : 'Could not update task.')
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”?`)) return
    try {
      await request<void>(`/api/tasks/${task.id}`, { method: 'DELETE' })
      setTasks((current) => current.filter((item) => item.id !== task.id))
    } catch (issue) {
      setNotice(issue instanceof Error ? issue.message : 'Could not delete task.')
    }
  }

  const viewTitle = activeView === 'today' ? 'Today' : activeView === 'upcoming' ? 'Coming up' : 'Every task'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setActiveView('today') }}>
          <span className="brand-mark"><Asterisk size={22} strokeWidth={2.8} /></span>
          <span>daymark<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-section-label">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Task views">
          <button className={`nav-item ${activeView === 'today' ? 'active' : ''}`} onClick={() => setActiveView('today')}>
            <Clock3 size={18} /><span>Today</span><span className="nav-count">{todayCount}</span>
          </button>
          <button className={`nav-item ${activeView === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveView('upcoming')}>
            <CalendarDays size={18} /><span>Upcoming</span>
          </button>
          <button className={`nav-item ${activeView === 'all' ? 'active' : ''}`} onClick={() => setActiveView('all')}>
            <ListTodo size={18} /><span>All tasks</span><span className="nav-count">{openCount}</span>
          </button>
        </nav>
        <div className="sidebar-rule" />
        <div className="sidebar-note">
          <span className="note-icon"><Sparkles size={16} /></span>
          <p>Small steps add up to a life that feels like yours.</p>
          <span className="note-signoff">A NOTE TO SELF</span>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">D</div>
          <div className="profile-copy"><strong>Your space</strong><span>Just for you</span></div>
          <span className="online-dot" aria-label="Available" />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>MY SPACE</span><span className="breadcrumb-slash">/</span><strong>{viewTitle.toUpperCase()}</strong></div>
          <label className="search-box">
            <Search size={17} />
            <input aria-label="Search tasks" placeholder="Find a task..." value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}
          </label>
        </header>

        <div className="page-wrap">
          <section className="page-intro">
            <div className="intro-copy">
              <div className="date-eyebrow"><span className="eyebrow-line" />{prettyDate()}</div>
              <h1>{activeView === 'today' ? <>Make room for<br /><em>what matters.</em></> : activeView === 'upcoming' ? <>A little look<br /><em>ahead.</em></> : <>Everything,<br /><em>in its place.</em></>}</h1>
              <p className="intro-subtitle">A clearer day starts with one small thing.</p>
            </div>
            <button className="new-task-button" onClick={() => setEditorTask(null)}>
              <Plus size={18} strokeWidth={2.5} /><span>New task</span><kbd>N</kbd>
            </button>
            <div className="sun-stamp" aria-hidden="true"><span>DM</span><i /></div>
          </section>

          {notice && <div className="notice" role="alert">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}

          <section className="overview-strip" aria-label="Task overview">
            <div className="overview-stat"><span className="stat-label">ON YOUR LIST</span><strong>{String(openCount).padStart(2, '0')}</strong><span className="stat-caption">still in motion</span></div>
            <div className="overview-stat"><span className="stat-label">DUE TODAY</span><strong>{String(todayCount).padStart(2, '0')}</strong><span className="stat-caption">at your own pace</span></div>
            <div className="overview-stat"><span className="stat-label">DONE SO FAR</span><strong>{String(completeCount).padStart(2, '0')}</strong><span className="stat-caption">and counting</span></div>
            <div className="overview-motto"><span className="motto-mark">“</span><span>Progress is a practice,<br />not a finish line.</span></div>
          </section>

          <div className="content-grid">
            <section className="task-board" aria-labelledby="task-list-title">
              <div className="board-heading">
                <div>
                  <div className="section-eyebrow">THE PLAN</div>
                  <h2 id="task-list-title">{viewTitle}<span className="heading-count">{openTasks.length}</span></h2>
                </div>
                <button className="sort-label" onClick={() => setShowCompleted((value) => !value)}>
                  {showCompleted ? 'Hide done' : 'Show done'} <ChevronDown size={15} className={showCompleted ? 'turned' : ''} />
                </button>
              </div>

              {loading ? (
                <div className="empty-state loading-state"><span className="loader-mark"><Asterisk size={25} /></span><p>Gathering your thoughts...</p></div>
              ) : openTasks.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon"><CheckCheck size={23} /></span>
                  <h3>{query ? 'Nothing found just yet.' : activeView === 'today' ? 'A little breathing room.' : 'A fresh page.'}</h3>
                  <p>{query ? 'Try another search, or clear it to see your list.' : 'Add a task when something comes to mind. You can take it one step at a time.'}</p>
                  {!query && <button className="empty-add" onClick={() => setEditorTask(null)}><Plus size={16} /> Add a task</button>}
                </div>
              ) : (
                <div className="task-list">
                  {openTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={() => setEditorTask(task)} onDelete={deleteTask} />)}
                </div>
              )}

              {showCompleted && completedTasks.length > 0 && (
                <div className="completed-section">
                  <div className="completed-heading"><span>COMPLETED</span><span>{completedTasks.length}</span></div>
                  {completedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={() => setEditorTask(task)} onDelete={deleteTask} />)}
                </div>
              )}
              {!loading && openTasks.length > 0 && (
                <button className="add-row" onClick={() => setEditorTask(null)}><span><Plus size={17} /></span> Add one more to the list</button>
              )}
            </section>

            <aside className="insight-column" aria-label="Your progress">
              <section className="progress-panel">
                <div className="panel-overline"><span>YOUR RHYTHM</span><span className="live-mark" /></div>
                <div className="progress-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}>
                  <div className="ring-center"><strong>{progress}<small>%</small></strong><span>COMPLETE</span></div>
                </div>
                <p className="progress-caption">{completeCount === 0 ? 'Your next checkmark is waiting.' : `${completeCount} ${completeCount === 1 ? 'thing' : 'things'} moved forward. Nice work.`}</p>
                <div className="progress-foot"><span>{completeCount} done</span><span>{openCount} to go</span></div>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
              </section>

              <section className="next-panel">
                <div className="panel-overline"><span>UP NEXT</span><CalendarDays size={15} /></div>
                {nextTask ? (
                  <button className="next-task" onClick={() => setEditorTask(nextTask)}>
                    <span className="next-date">{dateLabel(nextTask.dueDate)}</span>
                    <strong>{nextTask.title}</strong>
                    <span className="next-category"><span className={`category-dot ${nextTask.category.toLowerCase()}`} />{nextTask.category}<span className="next-arrow">↗</span></span>
                  </button>
                ) : (
                  <div className="next-empty"><span className="next-empty-mark"><Asterisk size={18} /></span><p>Nothing scheduled ahead.<br />Enjoy the open space.</p></div>
                )}
              </section>

              <div className="side-quote"><span>KEEP IT KIND</span><p>“You don't have to see the whole staircase. Just take the first step.”</p><i>— MARTIN LUTHER KING JR.</i></div>
            </aside>
          </div>
          <footer className="page-footer"><span>DAYMARK <span className="footer-dot">·</span> YOUR DAY, YOUR WAY</span><span>{prettyDate()}</span></footer>
        </div>
      </main>

      {editorTask !== undefined && <TaskEditor task={editorTask} onClose={() => setEditorTask(undefined)} onSave={saveTask} />}
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task
  onToggle: (task: Task) => void
  onEdit: () => void
  onDelete: (task: Task) => void
}) {
  return (
    <article className={`task-row ${task.completed ? 'is-complete' : ''}`}>
      <button className="task-check" onClick={() => onToggle(task)} aria-label={task.completed ? `Mark ${task.title} as not done` : `Complete ${task.title}`}>
        {task.completed ? <Check size={15} /> : <Circle size={20} strokeWidth={1.6} />}
      </button>
      <button className="task-body" onClick={onEdit} aria-label={`Edit ${task.title}`}>
        <span className="task-title">{task.title}</span>
        {task.description && <span className="task-description">{task.description}</span>}
        <span className="task-meta">
          <span className={`category-tag ${task.category.toLowerCase()}`}><span className="category-dot" />{task.category}</span>
          <span className={`priority-tag ${task.priority}`}><span />{task.priority}</span>
        </span>
      </button>
      <div className={`task-due ${task.dueDate && task.dueDate < today && !task.completed ? 'overdue' : ''}`}>
        {task.dueDate ? <CalendarDays size={14} /> : <span className="due-dash">—</span>}
        <span>{dateLabel(task.dueDate)}</span>
      </div>
      <button className="task-delete" onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button>
    </article>
  )
}

export default App