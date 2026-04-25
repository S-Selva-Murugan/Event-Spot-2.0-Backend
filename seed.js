const mongoose = require("mongoose");
const path = require("path");
const User = require("./app/models/user-model");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function seedUsers() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not configured");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clear existing users (optional)
    await User.deleteMany({});
    console.log("🧹 Cleared old users");

    // Create users
    const users = [
      {
        name: "Namitha",
        email: "namithayohannan1802@.com",
        // image: "https://i.pravatar.cc/150?img=1",
        role: "customer",
      },
      {
        name: "Selva Murugan",
        email: "selvakvs11@gmail.com",
        // image: "https://i.pravatar.cc/150?img=2",
        role: "admin",
      },
    ];

    await User.insertMany(users);
    console.log("✅ Users seeded successfully");

    const all = await User.find();
    console.table(all.map(u => ({ name: u.name, email: u.email, role: u.role })));

    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Error seeding users:", err);
    mongoose.connection.close();
  }
}

seedUsers();
