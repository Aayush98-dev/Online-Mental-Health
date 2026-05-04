import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import morgan from 'morgan';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// --- Middlewares (Professional Stack) ---
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for Vite integration compatibility
}));
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // Request logging

// --- MongoDB Connection Logic ---
const MONGODB_URI = process.env.MONGODB_URI?.trim();

if (!MONGODB_URI || MONGODB_URI.includes('localhost') || MONGODB_URI.length < 10) {
  console.warn('⚠️ MONGODB_URI is missing or invalid. Atlas connection skipped.');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas: Connected'))
    .catch(err => {
      console.error('❌ MongoDB connection error:');
      if (err instanceof Error) {
        console.error(`- ${err.name}: ${err.message}`);
        if (err.name === 'MongooseServerSelectionError') {
           console.error('👉 TIP: Check your MongoDB Atlas Network Access (IP Whitelist). Use 0.0.0.0/0 for testing.');
        }
      }
    });
}

// --- Schemas & Models (Persistence Layer) ---

const LoginHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  email: String,
  timestamp: { type: Date, default: Date.now },
  device: String,
  ip: String
});

const DetectionHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  category: { type: String, enum: ['emotion', 'general'], default: 'emotion' },
  result: {
    emotion: String,
    confidence: Number,
    recommendations: [String],
    bpm: Number
  }
});

const ContactHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  therapistId: String,
  therapistName: String,
  timestamp: { type: Date, default: Date.now },
  message: String,
  status: { type: String, default: 'pending' }
});

const LoginHistory = mongoose.model('LoginHistory', LoginHistorySchema);
const DetectionHistory = mongoose.model('DetectionHistory', DetectionHistorySchema);
const ContactHistory = mongoose.model('ContactHistory', ContactHistorySchema);

// --- API Routes (Business Logic Layer) ---

// 1. Health & Status
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    uptime: process.uptime(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' 
  });
});

// 2. Authentication Logging
app.post('/api/auth/login-history', async (req, res) => {
  try {
    const { userId, email, device } = req.body;
    const log = new LoginHistory({ 
      userId, 
      email, 
      device, 
      ip: req.ip 
    });
    await log.save();
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Login log error:', error);
    res.status(500).json({ error: 'Database service unavailable' });
  }
});

// 3. AI Detection History
app.post('/api/history/detection', async (req, res) => {
  try {
    const { userId, result } = req.body;
    const history = new DetectionHistory({ userId, result });
    await history.save();
    res.status(201).json({ success: true, id: history._id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record detection' });
  }
});

app.get('/api/history/detection/:userId', async (req, res) => {
  try {
    const logs = await DetectionHistory.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'History retrieval failed' });
  }
});

// 4. Advanced Statistics (Great for project demo!)
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Aggregate emotion counts
    const emotionCounts = await DetectionHistory.aggregate([
      { $match: { userId } },
      { $group: { _id: '$result.emotion', count: { $sum: 1 } } }
    ]);

    // Latest heart rate trend
    const trends = await DetectionHistory.find({ 
      userId, 
      'result.bpm': { $exists: true } 
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .select('timestamp result.bpm');

    res.json({ emotionCounts, trends });
  } catch (error) {
    res.status(500).json({ error: 'Statistics generation failed' });
  }
});

// 5. Therapist Contact Requests
app.post('/api/contacts/request', async (req, res) => {
  try {
    const contact = new ContactHistory(req.body);
    await contact.save();
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Inquiry failed to save' });
  }
});

// --- Vite Development Integration ---

async function bootstrap() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).send('Internal Server Error');
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERENITY BACKEND: Running on http://localhost:${PORT}`);
  });
}

bootstrap();
