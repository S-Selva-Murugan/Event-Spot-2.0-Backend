const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {

    cognitoId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    role: {
      type: String,
      enum: ["admin", "customer"],
      default: "customer", // default user role
    },
    image: {
      type: String, // optional profile image (from Google or upload)
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
