const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'],
  credentials: true
}));

// JWT instead of sessions
app.use(passport.initialize());

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'test_db';
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.SESSION_SECRET || 'your_jwt_secret';

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

// User Schema for storing OAuth users
const UserSchema = new mongoose.Schema({
  google_id: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  display_name: String,
  picture: String,
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ google_id: profile.id });
      
      if (!user) {
        user = new User({
          google_id: profile.id,
          email: profile.emails[0].value,
          display_name: profile.displayName,
          picture: profile.photos[0]?.value
        });
        await user.save();
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Check JWT token
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ authenticated: false });
  }
};

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

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
};

// ==================== AUTH ROUTES ====================

// Google OAuth login route
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback route
app.get('/auth/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    // Create JWT token
    const token = jwt.sign({
      _id: req.user._id,
      email: req.user.email,
      display_name: req.user.display_name,
      picture: req.user.picture
    }, JWT_SECRET, { expiresIn: '7d' });
    
    // Redirect with token
    res.redirect(`http://127.0.0.1:5500/home.html?token=${token}`);
  }
);

// Get current user
app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(401).json({ authenticated: false });
    }
    
    res.json({
      id: user._id,
      email: user.email,
      display_name: user.display_name,
      picture: user.picture
    });
  } catch (err) {
    res.status(401).json({ authenticated: false });
  }
});

// Logout route
app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// ==================== COMMENT ROUTES ====================

const CommentSchema = new mongoose.Schema({
  publication_id: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  display_name: { type: String, default: 'Anonymous', trim: true, maxlength: 60 },
  body: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

const Comment = mongoose.model('Comment', CommentSchema);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/publications/:pubId/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ publication_id: req.params.pubId })
      .populate('user_id', 'display_name picture')
      .sort({ created_at: -1 });
    res.json(comments);
  } catch (err) {
    console.error('Error fetching comments:', err.message);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

app.post('/api/publications/:pubId/comments', verifyToken, async (req, res) => {
  try {
    const { display_name, body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    
    const comment = await Comment.create({
      publication_id: req.params.pubId,
      user_id: req.user._id,
      display_name: req.user.display_name,
      body: body.trim()
    });
    
    res.status(201).json(comment);
  } catch (err) {
    console.error('Error saving comment:', err.message);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

// ==================== PUBLICATION ROUTES ====================

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