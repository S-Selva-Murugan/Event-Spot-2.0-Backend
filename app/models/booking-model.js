const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: String, // from Cognito user ID
      required: true,
    },
    tickets: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paymentStatus: {
      type: String,
      enum: ["created", "authorized", "paid", "failed", "refunded"],
      default: "created",
    },
    paymentDate: Date,
    failureReason: String,
    refundAmount: Number,
    refundDate: Date,
    refundId: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
