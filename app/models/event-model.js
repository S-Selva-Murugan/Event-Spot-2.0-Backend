const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  eventName: { type: String, required: true },
  eventDescription: { type: String , required: true },
  eventOrganizerName: { type: String },
  eventType: { type: String, required: true },
  location: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  date: { type: Date, required: true },
  startTime: { type: String },
  endTime: { type: String },
  totalTickets: Number,
  ticketPrice: Number,
  parkingAvailable: Boolean,
  foodAvailable: Boolean,
  contactEmail: String,
  contactPhone: String,
  photos: [String],
  isApproved: { type: Boolean, default: null },
  suggestion: String,
  createdBy: { type: String, required: true },
}, { timestamps: true} );

module.exports = mongoose.model("Event", eventSchema);
