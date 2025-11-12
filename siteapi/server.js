const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'test_db';
const PORT = process.env.PORT || 4000;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, { dbName: DB_NAME })
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const CommentSchema = new mongoose.Schema({
  publication_id: { type: String, required: true },
  display_name: { type: String, default: 'Anonymous', trim: true, maxlength: 60 },
  body: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

const Comment = mongoose.model('Comment', CommentSchema);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/publications/:pubId/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ publication_id: req.params.pubId }).sort({ created_at: -1 });
    res.json(comments);
  } catch (err) {
    console.error('Error fetching comments:', err.message);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

app.post('/api/publications/:pubId/comments', async (req, res) => {
  try {
    const { display_name, body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    const comment = await Comment.create({
      publication_id: req.params.pubId,
      display_name: display_name?.trim() || 'Anonymous',
      body: body.trim()
    });
    res.status(201).json(comment);
  } catch (err) {
    console.error('Error saving comment:', err.message);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});


const PublicationSchema = new mongoose.Schema({
  source: { type: String, default: 'google_scholar' },
  external_id: { type: String, required: true },
  title: { type: String, required: true },
  authors_ieee: String,
  year: Number,
  venue: String,
  is_active: { type: Boolean, default: true },
  last_synced_at: Date
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

PublicationSchema.index({ source: 1, external_id: 1 }, { unique: true });

const Publication = mongoose.model('Publication', PublicationSchema);

app.get('/api/publications', async (req, res) => {
  try {
    const pubs = await Publication.find({ is_active: true })
      .sort({ year: -1, created_at: -1 })
      .select('_id title authors_ieee year venue');
    res.json(pubs);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load publications' });
  }
});

