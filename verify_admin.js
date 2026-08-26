const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://pfelixtest123_db_user:EDSHlYgn8vO5UGSa@ac-zbtbtpc-shard-00-00.umnx9te.mongodb.net:27017,ac-zbtbtpc-shard-00-01.umnx9te.mongodb.net:27017,ac-zbtbtpc-shard-00-02.umnx9te.mongodb.net:27017/?ssl=true&replicaSet=atlas-7vwioj-shard-0&authSource=admin&appName=Cluster0';

async function verifyAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Find admin user
    const user = await db.collection('users').findOne({ email: 'admin@subtlekitchen.com' });
    
    if (user) {
      console.log('✅ Admin user found!');
      console.log('📧 Email:', user.email);
      console.log('👤 Name:', user.firstName, user.lastName);
      console.log('🔐 Role:', user.role);
      console.log('📊 Status:', user.status);
      console.log('🆔 ID:', user._id);
      console.log('🔑 Password hash exists:', !!user.password);
    } else {
      console.log('❌ Admin user NOT found in database');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyAdmin();
