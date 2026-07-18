const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://mskprintcloud:mskprintcloud@cluster0.isduixd.mongodb.net/mskprint?retryWrites=true&w=majority&appName=Cluster0"
    );

    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.log("❌ MongoDB Connection Failed");
    console.log(error.message);
    process.exit(1);
  }
};

module.exports = connectDB;

module.exports = connectDB;