const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  currency: { 
    type: String, 
    enum: ["USD", "EUR", "MXN", "COP", "ARS"],
    default: "USD" 
  },
  imageUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Product", productSchema);
