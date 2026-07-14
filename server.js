require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

let users = [];
let nextUserId = 1;

app.get('/', (req, res) => {
  res.json({
    name: 'Task API with Auth',
    version: '1.0',
    endpoints: ['/register', '/login', '/profile']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/register', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || email.trim() === '') {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!password || password.trim() === '') {
    return res.status(400).json({ error: 'Password is required' });
  }

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = {
    id: nextUserId++,
    email,
    password: hashedPassword,
    role: role || 'user'
  };

  users.push(newUser);

  res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    role: newUser.role
  });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || email.trim() === '') {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!password || password.trim() === '') {
    return res.status(400).json({ error: 'Password is required' });
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({ token });
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid Authorization format' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

app.get('/profile', requireAuth, (req, res) => {
  res.json({
    message: 'You are logged in',
    user: req.user
  });
});

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.json({
    message: 'Welcome, admin'
  });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});