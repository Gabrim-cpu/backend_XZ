import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

let db = null;

export const connectMongoDB = async () => {
  try {
    await client.connect();
    db = client.db('xz_database');
    console.log('✅ MongoDB connected successfully');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return null;
  }
};

export const getDB = () => db;
export default client;