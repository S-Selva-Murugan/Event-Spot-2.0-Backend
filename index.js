const express = require('express');
const cors = require('cors');
const configureDB = require('./config/db');
const eventCltr = require('./app/controllers/event-ctlr');
const userCltr = require('./app/controllers/user-cltr');
const bookingCltr = require('./app/controllers/booking-cltr');
const multer = require('multer');
const cognitoAuth = require('./middlewares/cognitoAuth');
const Razorpay = require('razorpay');
require('dotenv').config();
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

configureDB();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

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

// -------------------- PAYMENT (directly here) --------------------
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

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
    });
  }
});

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

app.post('/api/chatbot/upload', multerLocal.single('file'), (req, res) => {
  try {
    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: req.file,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Upload failed', error: err });
  }
});

// -------------------- SERVER --------------------
app.listen(PORT, () => {
  console.log(`✅ Server started on http://localhost:${PORT}`);
});
