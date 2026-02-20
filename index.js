const express = require('express');
const cors = require('cors');
const configureDB = require('./config/db');
const eventCltr = require('./app/controllers/event-ctlr');
const userCltr = require('./app/controllers/user-cltr');
const bookingCltr = require('./app/controllers/booking-cltr');
const paymentCltr = require('./app/controllers/payment-ctlr');
const multer = require('multer');
const cognitoAuth = require('./middlewares/cognitoAuth');
const Razorpay = require('razorpay');
const { Queue } = require('bullmq');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { QdrantVectorStore } = require('@langchain/qdrant');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

configureDB();
app.use(cors());

// Body parser configuration
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const queue = new Queue('file-upload-queue', {
  connection: {
    host: 'localhost',
    port: '6379',
  },
});

// ✅ Initialize Razorpay (test mode)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, // test key
  key_secret: process.env.RAZORPAY_KEY_SECRET, // test secret
});

// -------------------- MULTER SETUP --------------------
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// -------------------- LOGGER --------------------
app.use((req, res, next) => {
  console.log(req.method, req.path);
  next();
});

// -------------------- EVENT ROUTES --------------------
app.get('/api/events', eventCltr.listAll);
app.post('/api/events', cognitoAuth, upload.array('photos', 3), eventCltr.createEvent);
app.delete('/api/events/:id', eventCltr.deleteEvent);
app.put('/api/events/:id', upload.array('photos', 3), eventCltr.updateEvent);
app.get('/api/events/:id', eventCltr.getEventById);
app.get('/api/myEvents', cognitoAuth, eventCltr.getMyEvents);

// -------------------- USER ROUTES --------------------
app.get('/api/users', userCltr.listAll);
app.get('/api/users/:id', userCltr.getById);
app.put('/api/users/:id', userCltr.update);
app.delete('/api/users/:id', userCltr.remove);
app.post('/api/users/login', userCltr.login);

// -------------------- BOOKING ROUTES --------------------
app.post('/api/bookings', cognitoAuth, bookingCltr.create);
app.get('/api/bookings', cognitoAuth, bookingCltr.listUserBookings);

// -------------------- PAYMENT ROUTES --------------------
// Create Razorpay order
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
      });
    }

    const options = {
      amount: amount * 100, // convert to paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Order creation failed',
      error: error.message,
    });
  }
});

// Verify payment (before creating booking)
app.post('/api/payment/verify', paymentCltr.verify);

// Razorpay webhook handler
// Note: For proper webhook signature verification, you should use express.raw() middleware
// But for now, we'll use JSON body and verify with the parsed body
// In production, configure webhook route separately with raw body parser
app.post('/api/payment/webhook', express.json({ verify: (req, res, buf) => {
  // Store raw body for signature verification
  req.rawBody = buf.toString('utf8');
}}), paymentCltr.webhook);

// -------------------- CHATBOT UPLOAD --------------------
const multerLocal = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '_' + file.originalname);
    },
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF or TXT files allowed'), false);
  },
});

const chatbotUpload = [
  multerLocal.any(),
  (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    if (req.files.length > 1) {
      return res.status(400).json({ success: false, message: 'Upload only one file' });
    }
    req.file = req.files[0];
    next();
  },
];

app.post('/api/chatbot/upload', chatbotUpload, async (req, res) => {
  try {
    await queue.add('file-ready', {
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: req.file,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Upload failed', error: err });
  }
});

app.get('/chat', async (req, res) => {
  try {
    const userQuery = req.query.message;
    if (!userQuery || !String(userQuery).trim()) {
      return res.status(400).json({ message: 'Query message is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        message: 'OPENAI_API_KEY is missing in backend environment.',
      });
    }

    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    });
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: 'http://localhost:6333',
        collectionName: 'langchainjs-testing',
      }
    );
    const ret = vectorStore.asRetriever({
      k: 2,
    });
    const result = await ret.invoke(String(userQuery));

    const SYSTEM_PROMPT = `
  You are a helpful AI Assistant who answers the user query based on the available context from PDF file.
  Context:
  ${JSON.stringify(result)}
  `;

    const chatResult = await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: String(userQuery) },
      ],
    });

    return res.json({
      message: chatResult.choices[0].message.content,
      docs: result,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      message: 'Failed to process chat request',
      error: error?.message || 'Unknown error',
    });
  }
});

// -------------------- SERVER --------------------
app.listen(PORT, () => {
  console.log(`✅ Server started on http://localhost:${PORT}`);
});
