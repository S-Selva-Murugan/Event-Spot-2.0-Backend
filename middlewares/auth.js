const { OAuth2Client } = require("google-auth-library");
const User = require("../app/models/user-model");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const provider = req.headers["x-auth-provider"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header missing" });
    }

    const token = authHeader.split(" ")[1];

    if (provider === "google") {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      const user = await User.findOne({ email: payload.email });
      if (!user) return res.status(401).json({ error: "User not found" });

      req.user = user;
      next();
    } else {
      res.status(401).json({ error: "Unsupported provider" });
    }
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = protect;
