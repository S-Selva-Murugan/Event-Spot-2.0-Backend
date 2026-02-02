const { verifyPayment, verifyWebhookSignature } = require('../../utils/paymentVerification');
const Booking = require('../models/booking-model');

const paymentCltr = {};

/**
 * Verify payment before creating booking
 * POST /api/payment/verify
 */
paymentCltr.verify = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    // Validate required fields
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId, paymentId, signature',
      });
    }

    // Verify payment
    const verification = await verifyPayment(orderId, paymentId, signature);

    if (!verification.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        error: verification.error,
        payment: verification.payment,
      });
    }

    // Check if booking already exists for this payment
    const existingBooking = await Booking.findOne({
      razorpayPaymentId: paymentId,
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: 'Booking already exists for this payment',
        booking: existingBooking,
      });
    }

    // Payment is valid - return success
    // Frontend should then call booking creation endpoint
    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: verification.payment,
      order: verification.order,
    });
  } catch (error) {
    console.error('❌ Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message,
    });
  }
};

/**
 * Handle Razorpay webhooks
 * POST /api/payment/webhook
 */
paymentCltr.webhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('❌ RAZORPAY_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Get webhook signature from header
    const webhookSignature = req.headers['x-razorpay-signature'];
    if (!webhookSignature) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    // Get raw body for signature verification
    // The raw body should be stored in req.rawBody by the middleware
    const webhookBody = req.rawBody || JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = verifyWebhookSignature(webhookSecret, webhookSignature, webhookBody);
    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`📢 Webhook received: ${event}`);

    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;

      case 'payment.authorized':
        await handlePaymentAuthorized(payload);
        break;

      case 'order.paid':
        await handleOrderPaid(payload);
        break;

      case 'refund.created':
        await handleRefundCreated(payload);
        break;

      default:
        console.log(`⚠️ Unhandled webhook event: ${event}`);
    }

    // Always return 200 to acknowledge webhook receipt
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    // Still return 200 to prevent Razorpay from retrying
    res.status(200).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Handle payment.captured event
 */
async function handlePaymentCaptured(payload) {
  try {
    const payment = payload.payment.entity;
    const orderId = payment.order_id;
    const paymentId = payment.id;

    // Update booking status if exists
    const booking = await Booking.findOne({ razorpayPaymentId: paymentId });
    if (booking) {
      booking.paymentStatus = 'paid';
      await booking.save();
      console.log(`✅ Updated booking ${booking._id} to paid status`);
    } else {
      console.log(`⚠️ Payment captured but no booking found for payment ${paymentId}`);
    }
  } catch (error) {
    console.error('❌ Error handling payment.captured:', error);
  }
}

/**
 * Handle payment.failed event
 */
async function handlePaymentFailed(payload) {
  try {
    const payment = payload.payment.entity;
    const paymentId = payment.id;

    // Update booking status if exists
    const booking = await Booking.findOne({ razorpayPaymentId: paymentId });
    if (booking) {
      booking.paymentStatus = 'failed';
      await booking.save();
      console.log(`❌ Updated booking ${booking._id} to failed status`);
    }
  } catch (error) {
    console.error('❌ Error handling payment.failed:', error);
  }
}

/**
 * Handle payment.authorized event
 */
async function handlePaymentAuthorized(payload) {
  try {
    const payment = payload.payment.entity;
    const paymentId = payment.id;

    console.log(`🔐 Payment authorized: ${paymentId}`);
    // Payment is authorized but not yet captured
    // You may want to update booking status to 'authorized' if needed
  } catch (error) {
    console.error('❌ Error handling payment.authorized:', error);
  }
}

/**
 * Handle order.paid event
 */
async function handleOrderPaid(payload) {
  try {
    const order = payload.order.entity;
    const orderId = order.id;

    console.log(`💰 Order paid: ${orderId}`);
    // Update all bookings for this order
    const bookings = await Booking.find({ razorpayOrderId: orderId });
    for (const booking of bookings) {
      booking.paymentStatus = 'paid';
      await booking.save();
    }
  } catch (error) {
    console.error('❌ Error handling order.paid:', error);
  }
}

/**
 * Handle refund.created event
 */
async function handleRefundCreated(payload) {
  try {
    const refund = payload.refund.entity;
    const paymentId = refund.payment_id;

    console.log(`💸 Refund created: ${refund.id} for payment ${paymentId}`);
    // Update booking with refund information
    const booking = await Booking.findOne({ razorpayPaymentId: paymentId });
    if (booking) {
      // You may want to add refund fields to booking model
      booking.paymentStatus = 'refunded';
      await booking.save();
      console.log(`✅ Updated booking ${booking._id} to refunded status`);
    }
  } catch (error) {
    console.error('❌ Error handling refund.created:', error);
  }
}

module.exports = paymentCltr;

