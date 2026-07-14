const mongoose = require("mongoose");

const connectDB = async () => {
  try {

    await mongoose.connect(
      "mongodb+srv://mskprintcloud:M$kcloud123@cluster0.isduixd.mongodb.net/mskprint?appName=Cluster0"
    );

    console.log("MongoDB Connected");

  } catch (error) {

    console.log("MongoDB Connection Failed:");
    console.log(error.message);

  }
};

module.exports = connectDB;