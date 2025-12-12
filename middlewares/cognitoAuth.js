// middlewares/cognitoAuth.js
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const User = require("../app/models/user-model"); // your Mongoose User model

// configure the verifier - set userPoolId & clientId (app client) for your pool
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id", // verifying ID tokens
  clientId: process.env.COGNITO_APP_CLIENT_ID,
});

module.exports = async function cognitoAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = auth.split(" ")[1];

    // verify the token (signature + expiry + audience)
    const payload = await verifier.verify(token);
    // payload contains claims including payload.sub (Cognito user id), payload.email, payload.name

    const cognitoId = payload.sub;
    const email = payload.email;
    const name = payload.name || "";

    // find the user in Mongo by cognitoId or by email
    // If you only want to use Mongo _id and not require cognitoId in schema,
    // still keep cognitoId optional and upsert when missing.
    let user = await User.findOne({ cognitoId });

    if (!user) {
      // fallback: try finding by email and then set cognitoId
      if (email) {
        user = await User.findOne({ email });
      }
    }

    if (!user) {
      // create new user doc (first-time login via Cognito)
      user = await User.create({
        name,
        email,
        cognitoId, // optional in the schema, but good to store
      });
    } else if (!user.cognitoId) {
      // if user existed (created earlier via other flow) attach cognitoId
      user.cognitoId = cognitoId;
      await user.save();
    }

    // attach user doc to request
    req.user = user;
    // also attach token payload if you need claims later
    req.cognitoPayload = payload;

    next();
  } catch (err) {
    console.error("Cognito auth error:", err);
    return res.status(401).json({ error: "Invalid or expired token", details: err.message });
  }
};
