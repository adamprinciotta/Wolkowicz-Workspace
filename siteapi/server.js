const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors());

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'test_db';
const PORT = process.env.PORT || 4000;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

mongoose.set('strictQuery', true);
mongoose
  .connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log('Server listening on http://localhost/:' + PORT);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});