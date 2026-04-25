const mongoose = require('mongoose');

const configureDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('connected to db');
  } catch (e) {
    console.log(e.message);
  }
};

module.exports = configureDB;
