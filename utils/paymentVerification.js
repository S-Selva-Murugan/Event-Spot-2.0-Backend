const crypto = require('crypto');
const Razorpay = require('razorpay');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Verify Razorpay payment signature
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature to verify
 * @returns {boolean} - True if signature is valid
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.error('❌ RAZORPAY_KEY_SECRET not configured');
      return false;
    }

    // Create the expected signature
    const text = `${orderId}|${paymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    // Compare signatures using constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(signature)
    );

    return isValid;
  } catch (error) {
    console.error('❌ Error verifying payment signature:', error);
    return false;
  }
};

/**
 * Verify webhook signature from Razorpay
 * @param {string} webhookSecret - Razorpay webhook secret
 * @param {string} webhookSignature - Signature from X-Razorpay-Signature header
 * @param {string} webhookBody - Raw request body as string
 * @returns {boolean} - True if signature is valid
 */
const verifyWebhookSignature = (webhookSecret, webhookSignature, webhookBody) => {
  try {
    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(generatedSignature),
      Buffer.from(webhookSignature)
    );
  } catch (error) {
    console.error('❌ Error verifying webhook signature:', error);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay API
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object|null>} - Payment details or null if error
 */
const fetchPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('❌ Error fetching payment details:', error);
    return null;
  }
};

/**
 * Fetch order details from Razorpay API
 * @param {string} orderId - Razorpay order ID
 * @returns {Promise<Object|null>} - Order details or null if error
 */
const fetchOrderDetails = async (orderId) => {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return order;
  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    return null;
  }
};

/**
 * Comprehensive payment verification
 * Verifies signature and checks payment status with Razorpay API
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature
 * @returns {Promise<{isValid: boolean, payment: Object|null, order: Object|null, error: string|null}>}
 */
const verifyPayment = async (orderId, paymentId, signature) => {
  try {
    // Step 1: Verify signature
    const isSignatureValid = verifyPaymentSignature(orderId, paymentId, signature);
    if (!isSignatureValid) {
      return {
        isValid: false,
        payment: null,
        order: null,
        error: 'Invalid payment signature',
      };
    }

    // Step 2: Fetch payment details from Razorpay
    const payment = await fetchPaymentDetails(paymentId);
    if (!payment) {
      return {
        isValid: false,
        payment: null,
        order: null,
        error: 'Failed to fetch payment details from Razorpay',
      };
    }

    // Step 3: Verify payment status
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return {
        isValid: false,
        payment,
        order: null,
        error: `Payment not successful. Status: ${payment.status}`,
      };
    }

    // Step 4: Verify order matches payment
    if (payment.order_id !== orderId) {
      return {
        isValid: false,
        payment,
        order: null,
        error: 'Order ID mismatch',
      };
    }

    // Step 5: Fetch order details
    const order = await fetchOrderDetails(orderId);
    if (!order) {
      return {
        isValid: false,
        payment,
        order: null,
        error: 'Failed to fetch order details from Razorpay',
      };
    }

    // All checks passed
    return {
      isValid: true,
      payment,
      order,
      error: null,
    };
  } catch (error) {
    console.error('❌ Error in comprehensive payment verification:', error);
    return {
      isValid: false,
      payment: null,
      order: null,
      error: error.message || 'Payment verification failed',
    };
  }
};

module.exports = {
  verifyPaymentSignature,
  verifyWebhookSignature,
  verifyPayment,
  fetchPaymentDetails,
  fetchOrderDetails,
};

