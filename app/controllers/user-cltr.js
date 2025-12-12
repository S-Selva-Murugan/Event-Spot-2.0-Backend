const User = require("../models/user-model");

const userCltr = {};

// 🔹 Login or auto-register (Google/Manual)
userCltr.login = async (req, res) => {
  try {
    const { email, name, image } = req.body;

    // Validate email is provided
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email is required" 
      });
    }

    // 1️⃣ Check if user exists
    let user = await User.findOne({ email });

    // 2️⃣ If not, create a new one (default role = customer)
    if (!user) {
      user = new User({
        name: name || "",
        email,
        image: image || "",
        role: "customer",
      });
      await user.save();
    } else {
      // Update name and image if provided and user exists
      if (name && name !== user.name) {
        user.name = name;
      }
      if (image && image !== user.image) {
        user.image = image;
      }
      if (name || image) {
        await user.save();
      }
    }

    // 3️⃣ Return user data
    res.json({
      success: true,
      message: "Login successful",
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    console.error("❌ Error name:", err.name);
    console.error("❌ Error message:", err.message);
    console.error("❌ Error code:", err.code);
    if (err.errors) {
      console.error("❌ Validation errors:", err.errors);
    }
    
    // Better error handling - extract meaningful error message
    let errorMessage = err.message || "Login failed";
    let errorDetails = err.message;
    
    // Handle specific Mongoose errors
    if (err.name === "ValidationError") {
      errorDetails = Object.values(err.errors || {}).map(e => e.message).join(", ");
      errorMessage = "Validation error: " + errorDetails;
    } else if (err.code === 11000) {
      // Duplicate key error
      errorMessage = "Email already exists";
      errorDetails = "A user with this email already exists";
    } else if (err.name === "MongoServerError") {
      errorMessage = err.message || "Database error";
      errorDetails = err.message;
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Login failed", 
      error: errorMessage,
      details: errorDetails,
      errorType: err.name || "Unknown"
    });
  }
};

// ✅ Create or Find User (used for login/signup)
userCltr.createOrFind = async (req, res) => {
  try {
    const { name, email, image, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        name,
        email,
        image,
        role: role || "customer",
      });
      await user.save();
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to create or find user", details: err });
  }
};

// ✅ Get all users (Admin use)
userCltr.listAll = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users", details: err });
  }
};

// ✅ Get user by ID or email
userCltr.getById = async (req, res) => {
  const { id } = req.params;
  try {
    const user =
      id.includes("@")
        ? await User.findOne({ email: id })
        : await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: "Invalid user ID", details: err });
  }
};

// ✅ Update user details (name, role, image, etc.)
userCltr.update = async (req, res) => {
  const { id } = req.params;
  const { body } = req;
  try {
    const updatedUser = await User.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: "User updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    res.status(400).json({ error: "Failed to update user", details: err });
  }
};

// ✅ Delete user
userCltr.remove = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      message: "User deleted successfully",
      user: deletedUser,
    });
  } catch (err) {
    res.status(400).json({ error: "Failed to delete user", details: err });
  }
};

module.exports = userCltr;