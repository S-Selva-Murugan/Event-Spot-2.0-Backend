const mongoose = require("mongoose");
const User = require("./app/models/user-model");
const Event = require("./app/models/event-model");

const MONGO_URI =
  "mongodb+srv://selvakvs11_db_user:gW1knHynYqBTANL3@mycluster.jfaj9lg.mongodb.net/?retryWrites=true&w=majority&appName=MyCluster";

const EVENT_TYPES = [
  "Music",
  "Tech",
  "Workshop",
  "Sports",
  "Food",
  "Art",
  "Business",
  "Community",
];

const LOCATIONS = [
  { label: "Indiranagar, Bengaluru", lat: 12.9719, lng: 77.6412 },
  { label: "Koramangala, Bengaluru", lat: 12.9352, lng: 77.6245 },
  { label: "Whitefield, Bengaluru", lat: 12.9698, lng: 77.75 },
  { label: "Jayanagar, Bengaluru", lat: 12.9293, lng: 77.5838 },
  { label: "MG Road, Bengaluru", lat: 12.9756, lng: 77.6066 },
  { label: "HSR Layout, Bengaluru", lat: 12.9116, lng: 77.6474 },
  { label: "Yelahanka, Bengaluru", lat: 13.1007, lng: 77.5963 },
  { label: "Electronic City, Bengaluru", lat: 12.8399, lng: 77.677 },
];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pick = (arr) => arr[rand(0, arr.length - 1)];

const buildEvent = (index, customer) => {
  const location = pick(LOCATIONS);
  const type = pick(EVENT_TYPES);
  const daysFromNow = rand(2, 120);
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(18 + (index % 3), 0, 0, 0);

  const totalTickets = rand(80, 500);
  const ticketPrice = rand(200, 2500);
  const eventName = `${type} Fest ${index + 1}`;

  return {
    eventName,
    eventDescription: `Join ${eventName} for an engaging ${type.toLowerCase()} experience with speakers, sessions, and networking.`,
    eventOrganizerName: customer.name || "Community Organizer",
    eventType: type,
    location: location.label,
    latitude: location.lat,
    longitude: location.lng,
    date,
    startTime: "18:00",
    endTime: "21:00",
    totalTickets,
    ticketPrice,
    parkingAvailable: index % 2 === 0,
    foodAvailable: index % 3 !== 0,
    contactEmail: customer.email,
    contactPhone: `9${rand(100000000, 999999999)}`,
    photos: [],
    isApproved: true,
    suggestion: "",
    createdBy: customer.cognitoId || String(customer._id),
  };
};

async function seedEvents() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const customer = await User.findOne({ role: "customer" }).sort({ createdAt: 1 });
    if (!customer) {
      throw new Error("No customer user found. Create a customer first.");
    }

    const events = Array.from({ length: 30 }).map((_, i) => buildEvent(i, customer));
    const inserted = await Event.insertMany(events);

    const totalEvents = await Event.countDocuments();
    const customerEventCount = await Event.countDocuments({
      createdBy: customer.cognitoId || String(customer._id),
    });

    console.log(`Inserted ${inserted.length} events for customer ${customer.email}`);
    console.log(`Total events in DB: ${totalEvents}`);
    console.log(`Total events for this customer: ${customerEventCount}`);
  } catch (err) {
    console.error("Failed to seed events:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedEvents();
