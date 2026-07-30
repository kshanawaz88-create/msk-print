const mongoose = require("mongoose");
require("dotenv").config();

const Shop = require("./models/Shop");

(async () => {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

    await mongoose.connect(uri);

    console.log("Database:", mongoose.connection.name);

    const shops = await Shop.find({})
      .select("shopName shopCode code slug isActive status")
      .lean();

    console.log("Shops:");
    console.log(shops);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();