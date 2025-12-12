const mongoose = require("mongoose");
const User = require("./app/models/user-model");

const MONGO_URI = "mongodb+srv://selvakvs11_db_user:gW1knHynYqBTANL3@mycluster.jfaj9lg.mongodb.net/?retryWrites=true&w=majority&appName=MyCluster"

async function seedUsers() {
  try {
    await mongoose.connect(MONGO_URI);
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
