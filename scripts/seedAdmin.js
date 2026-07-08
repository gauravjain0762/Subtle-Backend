require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/Admin");

const run = async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await Admin.findOne({ email: email.trim().toLowerCase() });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
  } else {
    await Admin.create({ email, password });
    console.log(`Admin created: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run();
