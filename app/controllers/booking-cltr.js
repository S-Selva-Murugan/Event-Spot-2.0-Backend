const Booking = require("../models/booking-model");

const bookingCltr = {};

// ✅ Create booking after payment success
bookingCltr.create = async (req, res) => {
  try {
    const {
      eventId,
      userId,
      tickets,
      totalAmount,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    const booking = new Booking({
      eventId,
      userId,
      tickets,
      totalAmount,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      paymentStatus: "paid",
    });

    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error("❌ Booking creation failed:", err);
    res.status(500).json({ success: false, message: "Booking failed" });
  }
};

// ✅ Get all bookings for a user
bookingCltr.listUserBookings = async (req, res) => {
  try {
    const { userId } = req.query;
    const bookings = await Booking.find({ userId }).populate("eventId");
    res.json(bookings);
  } catch (err) {
    console.error("❌ Fetch user bookings error:", err);
    res.status(500).json({ error: "Failed to fetch user bookings" });
  }
};

module.exports = bookingCltr;
