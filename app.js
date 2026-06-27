// app.js
// Simple CodeCraftHub: REST API for managing courses using a JSON file (no DB)

const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// -------------------- Configuration --------------------
const app = express();
const PORT = 5000;

// Data file path (in the same directory as this file)
const DATA_FILE = path.resolve(__dirname, 'courses.json');
const ALLOWED_STATUSES = ['Not Started', 'In Progress', 'Completed'];

// -------------------- Helpers --------------------

// Ensure the data file exists. If not, create it with an empty array [].
async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

// Read all courses from the JSON file
async function readAll() {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, 'utf8');
  // If file is empty or invalid, return an empty array
  if (!content) return [];
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

// Write the full list of courses back to the JSON file
async function writeAll(items) {
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

// Basic date format validation: YYYY-MM-DD
function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

// Validate allowed status values
function isValidStatus(s) {
  return ALLOWED_STATUSES.includes(s);
}

// -------------------- Middleware --------------------
app.use(express.json()); // Parse JSON request bodies

// -------------------- Routes (CRUD) --------------------

/*
  POST /api/courses
  Add a new course
  Required fields: name, description, target_date, status
  - id is auto-generated (starting from 1)
  - created_at is auto-generated (ISO timestamp)
*/
app.post('/api/courses', async (req, res) => {
  try {
    const { name, description, target_date, status } = req.body;

    // Validate required fields
    if (!name || !description || !target_date || !status) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, target_date, status',
      });
    }

    // Validate target_date format
    if (!isValidDate(target_date)) {
      return res.status(400).json({
        error: 'target_date must be in YYYY-MM-DD format',
      });
    }

    // Validate status value
    if (!isValidStatus(status)) {
      return res.status(400).json({
        error: 'status must be one of Not Started, In Progress, Completed',
      });
    }

    // Read existing courses to compute next ID
    const courses = await readAll();
    const maxId = courses.reduce((m, c) => Math.max(m, c.id || 0), 0);
    const newCourse = {
      id: maxId + 1, // Auto-incremented ID starting from 1
      name,
      description,
      target_date,
      status,
      created_at: new Date().toISOString(), // Timestamp
    };

    // Persist
    courses.push(newCourse);
    await writeAll(courses);

    // Response
    res.status(201).json(newCourse);
  } catch (err) {
    console.error('POST /api/courses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/*
  GET /api/courses
  - If query parameter id is provided: return a specific course
  - Otherwise: return all courses
  Example: GET /api/courses or GET /api/courses?id=2
*/
app.get('/api/courses', async (req, res) => {
  try {
    const { id } = req.query;
    const courses = await readAll();

    if (id !== undefined) {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      const course = courses.find((c) => c.id === numericId);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      return res.json(course);
    }

    // Return all courses
    res.json(courses);
  } catch (err) {
    console.error('GET /api/courses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/*
  PUT /api/courses
  Update a course (full update)
  Required fields in body: id, name, description, target_date, status
*/
app.put('/api/courses', async (req, res) => {
  try {
    const { id, name, description, target_date, status } = req.body;

    // Validate required fields
    if (
      id === undefined ||
      !name ||
      !description ||
      !target_date ||
      !status
    ) {
      return res.status(400).json({
        error: 'Missing required fields: id, name, description, target_date, status',
      });
    }

    // Validate id
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    // Validate target_date format
    if (!isValidDate(target_date)) {
      return res.status(400).json({ error: 'target_date must be in YYYY-MM-DD format' });
    }

    // Validate status value
    if (!isValidStatus(status)) {
      return res
        .status(400)
        .json({ error: 'status must be one of Not Started, In Progress, Completed' });
    }

    // Read and update
    const courses = await readAll();
    const idx = courses.findIndex((c) => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Course not found' });

    // Preserve original created_at
    const created_at = courses[idx].created_at;
    courses[idx] = { id, name, description, target_date, status, created_at };

    await writeAll(courses);

    res.json(courses[idx]);
  } catch (err) {
    console.error('PUT /api/courses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/*
  DELETE /api/courses
  Delete a course
  Required field in body: id
*/
app.delete('/api/courses', async (req, res) => {
  try {
    const { id } = req.body;

    if (id === undefined) {
      return res.status(400).json({ error: 'Missing required field: id' });
    }
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const courses = await readAll();
    const idx = courses.findIndex((c) => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Course not found' });

    courses.splice(idx, 1);
    await writeAll(courses);

    // 204 No Content on successful deletion
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /api/courses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -------------------- Start server --------------------
// Ensure data file exists, then start listening on the configured port
ensureDataFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CodeCraftHub API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize data file', err);
    process.exit(1);
  });