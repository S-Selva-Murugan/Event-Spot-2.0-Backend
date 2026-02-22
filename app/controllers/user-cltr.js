const User = require("../models/user-model");
const { OAuth2Client } = require("google-auth-library");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const cognitoVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.COGNITO_APP_CLIENT_ID,
});

const userCltr = {};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const verifyIdentityFromProvider = async ({ provider, idToken }) => {
  if (!provider || !idToken) {
    return { error: "provider and idToken are required" };
  }

  if (provider === "google") {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);

    if (!email) return { error: "Google token does not contain email" };
    if (payload?.email_verified === false) {
      return { error: "Google email is not verified" };
    }

    return {
      email,
      name: payload?.name || "",
      image: payload?.picture || "",
      cognitoId: null,
    };
  }

  if (provider === "cognito") {
    const payload = await cognitoVerifier.verify(idToken);
    const email = normalizeEmail(payload?.email);

    if (!email) return { error: "Cognito token does not contain email" };

    return {
      email,
      name: payload?.name || "",
      image: "",
      cognitoId: payload?.sub || null,
    };
  }

  return { error: "Unsupported provider" };
};

// 🔹 Login or auto-register (Google/Manual)
userCltr.login = async (req, res) => {
  try {
    const { provider, idToken, name: requestName, image: requestImage } = req.body;
    const verifiedIdentity = await verifyIdentityFromProvider({ provider, idToken });

    if (verifiedIdentity.error) {
      return res.status(400).json({
        success: false,
        message: verifiedIdentity.error,
      });
    }

    const email = verifiedIdentity.email;
    const name = requestName || verifiedIdentity.name || "";
    const image = requestImage || verifiedIdentity.image || "";
    const cognitoId = verifiedIdentity.cognitoId;

    // Validate email is provided
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
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
        cognitoId: cognitoId || undefined,
        role: "customer",
      });
      await user.save();
    } else {
      let requiresSave = false;

      if (provider === "cognito") {
        if (cognitoId && user.cognitoId && user.cognitoId !== cognitoId) {
          return res.status(409).json({
            success: false,
            message: "Email is already linked to a different Cognito account",
          });
        }
        if (cognitoId && !user.cognitoId) {
          user.cognitoId = cognitoId;
          requiresSave = true;
        }
      }

      // Update name and image if provided and user exists
      if (name && name !== user.name) {
        user.name = name;
        requiresSave = true;
      }
      if (image && image !== user.image) {
        user.image = image;
        requiresSave = true;
      }

      if (requiresSave) {
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
      errorType: err.name || "Unknown",
    });
  }
};

// ✅ Create or Find User (used for login/signup)
userCltr.createOrFind = async (req, res) => {
  try {
    const { name, email, image, role } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      user = new User({
        name,
        email: normalizedEmail,
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
    const { page, limit } = req.query;
    const hasPagination = page !== undefined || limit !== undefined;

    if (!hasPagination) {
      const users = await User.find().sort({ createdAt: -1 });
      return res.json(users);
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (safePage - 1) * safeLimit;

    const [users, total] = await Promise.all([
      User.find().sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      User.countDocuments(),
    ]);

    return res.json({
      data: users,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    });
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
        ? await User.findOne({ email: normalizeEmail(id) })
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
