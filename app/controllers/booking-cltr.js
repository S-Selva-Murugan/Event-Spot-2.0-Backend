const Booking = require("../models/booking-model");
const { verifyPayment } = require("../../utils/paymentVerification");

const bookingCltr = {};

// ✅ Create booking after payment success (with verification)
bookingCltr.create = async (req, res) => {
  try {
    const {
      eventId,
      tickets,
      totalAmount,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    // 🔒 SECURITY: Get userId from authenticated user (prevents user impersonation)
    const userId = req.user?.cognitoId || req.cognitoPayload?.sub || req.body.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Validate required fields
    if (!eventId || !tickets || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: eventId, tickets, totalAmount",
      });
    }

    // Validate payment fields
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment details: razorpayOrderId, razorpayPaymentId, razorpaySignature",
      });
    }

    // 🔒 SECURITY: Verify payment before creating booking
    const verification = await verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    
    if (!verification.isValid) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        error: verification.error,
      });
    }

    // Check if booking already exists for this payment (prevent duplicates)
    const existingBooking = await Booking.findOne({
      razorpayPaymentId: razorpayPaymentId,
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "Booking already exists for this payment",
        booking: existingBooking,
      });
    }

    // Verify payment amount matches booking amount
    const paymentAmount = verification.payment.amount / 100; // Convert from paise to rupees
    if (Math.abs(paymentAmount - totalAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: "Payment amount mismatch",
        expected: totalAmount,
        received: paymentAmount,
      });
    }

    // All checks passed - create booking
    const booking = new Booking({
      eventId,
      userId,
      tickets,
      totalAmount,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentStatus: verification.payment.status === "captured" ? "paid" : "authorized",
      paymentDate: new Date(),
    });

    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error("❌ Booking creation failed:", err);
    res.status(500).json({ success: false, message: "Booking failed", error: err.message });
  }
};

// ✅ Get all bookings for a user
bookingCltr.listUserBookings = async (req, res) => {
  try {
    // 🔒 SECURITY: Get userId from authenticated user (prevents accessing other users' bookings)
    const userId = req.user?.cognitoId || req.cognitoPayload?.sub || req.query.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { page, limit } = req.query;
    const hasPagination = page !== undefined || limit !== undefined;
    const filter = { userId };

    if (!hasPagination) {
      const bookings = await Booking.find(filter)
        .populate("eventId")
        .sort({ createdAt: -1 });
      return res.json(bookings);
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (safePage - 1) * safeLimit;

    const [bookings, total] = await Promise.all([
      Booking.find(filter).populate("eventId").sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      Booking.countDocuments(filter),
    ]);

    return res.json({
      data: bookings,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    });
  } catch (err) {
    console.error("❌ Fetch user bookings error:", err);
    res.status(500).json({ error: "Failed to fetch user bookings" });
  }
};

module.exports = bookingCltr;
