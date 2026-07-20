const express = require('express');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

const PORT = 3000;
const db = new Database('tasks.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

const countRow = db.prepare('SELECT COUNT(*) as count FROM tasks').get();

if (countRow.count === 0) {
  const insert = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');

  insert.run('Buy milk', 0);
  insert.run('Walk dog', 1);
  insert.run('Write code', 0);
}

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/tasks', (req, res) => {
  const tasks = db.prepare('SELECT id, title, done FROM tasks').all()
    .map(task => ({
      ...task,
      done: Boolean(task.done)
    }));

  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({
    ...task,
    done: Boolean(task.done)
  });
});

app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }

  const result = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)').run(title.trim(), 0);

  const newTask = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({
    ...newTask,
    done: Boolean(newTask.done)
  });
});

app.put('/tasks/:id', (req, res) => {
  const existingTask = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(req.params.id);

  if (!existingTask) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { title, done } = req.body;

  if (title !== undefined && title.trim() === '') {
    return res.status(400).json({ error: 'Title cannot be empty' });
  }

  if (title === undefined && done === undefined) {
    return res.status(400).json({ error: 'At least one field is required' });
  }

  const updatedTitle = title !== undefined ? title.trim() : existingTask.title;
  const updatedDone = done !== undefined ? (done ? 1 : 0) : existingTask.done;

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?')
    .run(updatedTitle, updatedDone, req.params.id);

  const updatedTask = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(req.params.id);

  res.json({
    ...updatedTask,
    done: Boolean(updatedTask.done)
  });
});

app.delete('/tasks/:id', (req, res) => {
  const existingTask = db.prepare('SELECT id, title, done FROM tasks WHERE id = ?').get(req.params.id);

  if (!existingTask) {
    return res.status(404).json({ error: 'Task not found' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});