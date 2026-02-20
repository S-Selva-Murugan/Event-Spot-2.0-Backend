const { OAuth2Client } = require("google-auth-library");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const User = require("../app/models/user-model");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const cognitoVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.COGNITO_APP_CLIENT_ID,
});

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

module.exports = async function authAny(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const provider = String(req.headers["x-auth-provider"] || "")
      .trim()
      .toLowerCase();

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    if (!provider) {
      return res.status(401).json({ error: "x-auth-provider header is required" });
    }

    const token = authHeader.split(" ")[1];

    if (provider === "google") {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const email = normalizeEmail(payload?.email);

      if (!email) return res.status(401).json({ error: "Invalid Google token email" });

      const user = await User.findOne({ email });
      if (!user) return res.status(401).json({ error: "User not found" });

      req.user = user;
      req.authProvider = "google";
      return next();
    }

    if (provider === "cognito") {
      const payload = await cognitoVerifier.verify(token);
      const cognitoId = payload.sub;
      const email = normalizeEmail(payload.email);
      const name = payload.name || "";

      let user = await User.findOne({ cognitoId });
      if (!user && email) {
        user = await User.findOne({ email });
      }

      if (!user) {
        user = await User.create({
          name,
          email,
          cognitoId,
        });
      } else if (!user.cognitoId) {
        user.cognitoId = cognitoId;
        await user.save();
      }

      req.user = user;
      req.cognitoPayload = payload;
      req.authProvider = "cognito";
      return next();
    }

    return res.status(401).json({ error: "Unsupported auth provider" });
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ error: "Invalid or expired token", details: err.message });
  }
};
