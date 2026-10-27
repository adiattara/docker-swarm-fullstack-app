const express = require('express');
const fs = require('node:fs');
const app = express();
const cors = require('cors');

// Configuration comes from the environment only: no hardcoded defaults, so a
// container with an incomplete configuration fails at boot instead of
// silently falling back to localhost and a shared password.
function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    console.error(`${name} is not set; refusing to start with an incomplete configuration.`);
    process.exit(1);
  }

  return value;
}

const port = requireEnv('PORT');

const corsOptions = {
  origin: true,
  optionsSuccessStatus: 200,
};

app.options('*', cors()) // include before other routes
app.use(cors(corsOptions));
app.use(express.json());

const { Pool } = require('pg');

const poolConfig = {
  user: requireEnv('PGUSER'),
  host: requireEnv('PGHOST'),
  database: requireEnv('PGDATABASE'),
  port: parseInt(requireEnv('PGPORT'), 10),
};

// The database password only ever comes from a Docker secret: Docker mounts
// it as a read-only file and points PGPASSWORD_FILE at it. No env fallback,
// no hardcoded default, so a missing secret fails at startup instead of
// silently connecting with a password nobody controls.
//
// trim() strips the trailing newline left by some editors.
const password = fs.readFileSync(requireEnv('PGPASSWORD_FILE'), 'utf8').trim();

const pool = new Pool({ ...poolConfig, password });

pool.query('SELECT 1').then(
  () => console.log('Connected to PostgreSQL'),
  (err) => console.error('Error connecting to PostgreSQL:', err)
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/items', (req, res) => {
  pool.query('SELECT * FROM items', (err, result) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.json(result.rows);
    }
  });
});

app.post('/api/items', (req, res) => {
  const { description } = req.body;

  pool.query(
    'INSERT INTO items (description) VALUES ($1) RETURNING *',
    [description],
    (err, result) => {
      if (err) {
        console.error('Error executing query:', err);
        res.status(500).json({ error: 'Internal Server Error' });
      } else {
        res.json(result.rows[0]);
      }
    }
  );
});

app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const { description } = req.body;

  pool.query(
    'UPDATE items SET description = $1 WHERE id = $2 RETURNING *',
    [description, id],
    (err, result) => {
      if (err) {
        console.error('Error executing query:', err);
        res.status(500).json({ error: 'Internal Server Error' });
      } else if (result.rows.length === 0) {
        res.status(404).json({ error: 'Item not found' });
      } else {
        res.json(result.rows[0]);
      }
    }
  );
});

app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;

  pool.query(
    'DELETE FROM items WHERE id = $1 RETURNING *',
    [id],
    (err, result) => {
      if (err) {
        console.error('Error executing query:', err);
        res.status(500).json({ error: 'Internal Server Error' });
      } else if (result.rows.length === 0) {
        res.status(404).json({ error: 'Item not found' });
      } else {
        res.json(result.rows[0]);
      }
    }
  );
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
