const express = require('express');
const fs = require('node:fs');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: true,
  optionsSuccessStatus: 200,
};

app.options('*', cors()) // include before other routes
app.use(cors(corsOptions));
app.use(express.json());

const { Pool } = require('pg');

const poolConfig = {
  user: process.env.PGUSER || 'fullstack_user',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'fullstack',
  port: parseInt(process.env.PGPORT, 10) || 5432,
};

if (process.env.PGPASSWORD_FILE) {
  poolConfig.password = fs.readFileSync(process.env.PGPASSWORD_FILE, 'utf8').trim();
} else {
  poolConfig.password = process.env.PGPASSWORD || 'fullstack_password';
}

const pool = new Pool(poolConfig);

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
