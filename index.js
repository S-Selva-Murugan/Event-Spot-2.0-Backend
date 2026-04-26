const express = require('express');
const cors = require('cors');
const configureDB = require('./config/db');
const eventCltr = require('./app/controllers/event-ctlr');
const userCltr = require('./app/controllers/user-cltr');
const bookingCltr = require('./app/controllers/booking-cltr');
const paymentCltr = require('./app/controllers/payment-ctlr');
const analyticsCltr = require('./app/controllers/analytics-ctlr');
const multer = require('multer');
const cognitoAuth = require('./middlewares/cognitoAuth');
const authAny = require('./middlewares/authAny');
const requireAdmin = require('./middlewares/requireAdmin');
const Razorpay = require('razorpay');
const { OpenAIEmbeddings } = require('@langchain/openai');
const OpenAI = require('openai');
const path = require('path');
const { processChatbotFile } = require('./utils/chatbotIngestion');
const {
  deleteChatbotFileFromS3,
  getChatbotFileFromS3,
  listChatbotFilesFromS3,
  uploadChatbotFileToS3,
} = require('./utils/chatbotStorage');
const { getQdrantRetriever, isQdrantReachable, QDRANT_URL } = require('./utils/qdrant');
const { getChatbotQueue } = require('./utils/redisQueue');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const bodyParser = require('body-parser');

const app = express();
const PORT = Number(process.env.PORT || 3001);

configureDB();
app.use(cors());

// Body parser configuration
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
app.get('/api/users', authAny, requireAdmin, userCltr.listAll);
app.get('/api/users/:id', authAny, requireAdmin, userCltr.getById);
app.put('/api/users/:id', authAny, requireAdmin, userCltr.update);
app.delete('/api/users/:id', authAny, requireAdmin, userCltr.remove);
app.post('/api/users/login', userCltr.login);

// -------------------- BOOKING ROUTES --------------------
app.post('/api/bookings', cognitoAuth, bookingCltr.create);
app.get('/api/bookings', cognitoAuth, bookingCltr.listUserBookings);

// -------------------- ADMIN ROUTES --------------------
app.put('/api/admin/events/:id/moderation', authAny, requireAdmin, eventCltr.moderateEvent);
app.get('/api/admin/analytics', authAny, requireAdmin, analyticsCltr.summary);

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
  storage: multer.memoryStorage(),
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

app.get('/api/chatbot/files', authAny, requireAdmin, async (req, res) => {
  try {
    const files = await listChatbotFilesFromS3();
    return res.json({ success: true, files });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to list uploaded chatbot files',
      error: err.message,
    });
  }
});

app.get('/api/chatbot/files/:filename/preview', authAny, requireAdmin, async (req, res) => {
  try {
    const file = await getChatbotFileFromS3(req.params.filename);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.contentLength));
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    return res.send(file.buffer);
  } catch (err) {
    const message = err.name === 'NoSuchKey' ? 'Uploaded file not found' : 'Failed to preview uploaded file';
    const statusCode = err.name === 'NoSuchKey' ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message,
      error: err.message,
    });
  }
});

app.delete('/api/chatbot/files/:filename', authAny, requireAdmin, async (req, res) => {
  try {
    await deleteChatbotFileFromS3(req.params.filename);
    return res.json({ success: true, message: 'Uploaded file deleted successfully' });
  } catch (err) {
    const message = err.name === 'NoSuchKey' ? 'Uploaded file not found' : 'Failed to delete uploaded file';
    const statusCode = err.name === 'NoSuchKey' ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message,
      error: err.message,
    });
  }
});

app.post('/api/chatbot/upload', authAny, requireAdmin, chatbotUpload, async (req, res) => {
  try {
    const uploadedFile = await uploadChatbotFileToS3(req.file);
    const jobData = {
      storageKey: uploadedFile.storageKey,
      filename: uploadedFile.filename,
      originalName: uploadedFile.originalName,
      mimeType: uploadedFile.mimeType,
    };

    const queue = await getChatbotQueue();

    if (queue) {
      await queue.add('file-ready', jobData);

      return res.json({
        success: true,
        message: 'File uploaded successfully and queued for processing',
        processingMode: 'queue',
        file: {
          filename: uploadedFile.filename,
          originalname: uploadedFile.originalName,
          mimetype: uploadedFile.mimeType,
          size: uploadedFile.size,
        },
      });
    }

    const result = await processChatbotFile(jobData);

    return res.json({
      success: true,
      message: 'File uploaded successfully and processed inline',
      processingMode: 'inline',
      result,
      file: {
        filename: uploadedFile.filename,
        originalname: uploadedFile.originalName,
        mimetype: uploadedFile.mimeType,
        size: uploadedFile.size,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: err.message,
    });
  }
});

app.get('/health', (req, res) => {
  return res.json({
    success: true,
    status: 'ok',
  });
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

    const trimmedQuery = String(userQuery).trim();
    const qdrantReachable = await isQdrantReachable();
    let docs = [];

    if (qdrantReachable) {
      try {
        const embeddings = new OpenAIEmbeddings({
          model: 'text-embedding-3-small',
          apiKey: process.env.OPENAI_API_KEY,
        });
        const retriever = await getQdrantRetriever(embeddings, { k: 2 });
        docs = await retriever.invoke(trimmedQuery);
      } catch (retrievalError) {
        console.error('Chat retrieval warning:', retrievalError.message);
      }
    } else {
      console.warn(`Qdrant is not reachable at ${QDRANT_URL}. Chat will answer without PDF context.`);
    }

    const systemLines = [
      'You are Namitha, the EventSpot assistant.',
      'Help users with events, bookings, tickets, dashboard usage, and organizer workflows.',
      'Be concise, practical, and friendly.',
    ];

    if (docs.length > 0) {
      systemLines.push(
        'Use the uploaded PDF context below when it is relevant. If the context does not answer the question, say that clearly and then help with the best general guidance you can provide.',
        `Context: ${JSON.stringify(docs)}`
      );
    } else {
      systemLines.push(
        'The PDF knowledge base is currently unavailable or empty, so answer from general EventSpot product knowledge only.',
        'If the user asks about specific PDF content, mention that the document knowledge base is not available right now.'
      );
    }

    const chatResult = await client.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: systemLines.join('\n\n') },
        { role: 'user', content: trimmedQuery },
      ],
    });

    return res.json({
      message: chatResult.choices[0].message.content,
      docs,
      knowledgeBaseStatus: docs.length > 0 ? 'connected' : (qdrantReachable ? 'empty' : 'unavailable'),
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      message: 'Failed to process chat request',
      error: error?.message || 'Unknown error',
    });
  }
});

// Return JSON for unknown routes so frontend never receives HTML by default.
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// -------------------- SERVER --------------------
app.listen(PORT, () => {
  console.log(`✅ Server started on http://localhost:${PORT}`);
});
