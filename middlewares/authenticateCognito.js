const { CognitoJwtVerifier } = require("aws-jwt-verify");
const User = require('../app/models/user-model');

// ✅ Configure the verifier with YOUR Cognito details
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id", // We'll use ID token (contains user info)
  clientId: process.env.COGNITO_APP_CLIENT_ID,
});

const authenticateCognito = async (req, res, next) => {
  try {
    // 1. Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or invalid' });
    }

    const token = authHeader.split(' ')[1]; // Extract token after "Bearer "

    // 2. Verify the token with AWS Cognito
    const payload = await verifier.verify(token);
    console.log('Token verified! Payload:', payload);

    // 3. Extract user info from token
    const cognitoUserId = payload.sub; // Unique Cognito user ID
    const email = payload.email;
    const name = payload.name || email.split('@')[0];

    // 4. Find or create user in MongoDB
    let user = await User.findOne({ cognitoId: cognitoUserId });

    if (!user) {
      console.log('Creating new user in MongoDB...');
      user = new User({
        cognitoId: cognitoUserId,
        email: email,
        name: name,
      });
      await user.save();
      console.log('User created:', user);
    } else {
      console.log('Existing user found:', user);
    }

    // 5. Attach user to request object
    req.user = user;
    
    // 6. Continue to next middleware/controller
    next();

  } catch (err) {
    console.error('Authentication error:', err.message);
    
    if (err.message.includes('Token expired')) {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    res.status(401).json({ error: 'Invalid token', details: err.message });
  }
};

module.exports = authenticateCognito;