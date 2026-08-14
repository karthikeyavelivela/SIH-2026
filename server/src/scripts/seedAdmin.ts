import bcrypt from 'bcrypt';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import { User } from '../models/User';
import mongoose from 'mongoose';

async function seedAdmin() {
  await connectDb();

  // try/finally guarantees disconnect on every exit path, including if
  // User.findOne/User.create throws mid-flight (the process still hard-exits
  // via the outer .catch below on failure, but the connection is closed
  // cleanly first rather than left dangling until then).
  try {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      // eslint-disable-next-line no-console
      console.log('Admin already exists, skipping seed:', existingAdmin.phone);
      return;
    }

    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    const admin = await User.create({
      name: 'FYRO Root Admin',
      phone: env.ADMIN_PHONE,
      passwordHash,
      role: 'admin',
      accountStatus: 'active',
    });

    // eslint-disable-next-line no-console
    console.log('Seeded admin account:', admin.phone);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
