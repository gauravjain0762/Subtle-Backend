const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = 'mongodb://pfelixtest123_db_user:EDSHlYgn8vO5UGSa@ac-zbtbtpc-shard-00-00.umnx9te.mongodb.net:27017,ac-zbtbtpc-shard-00-01.umnx9te.mongodb.net:27017,ac-zbtbtpc-shard-00-02.umnx9te.mongodb.net:27017/?ssl=true&replicaSet=atlas-7vwioj-shard-0&authSource=admin&appName=Cluster0';

async function createAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Hash password
    const hashedPassword = await bcrypt.hash('Subtle@123', 10);
    
    // Create admin user
    const adminUser = {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@subtlekitchen.com',
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert into users collection
    const result = await db.collection('users').insertOne(adminUser);
    
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@subtlekitchen.com');
    console.log('🔑 Password: Subtle@123');
    console.log('🆔 User ID:', result.insertedId);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
