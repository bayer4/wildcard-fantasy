/**
 * One-time script to create admin user
 * Run with: npx ts-node src/seed/createAdmin.ts
 * Or in production: node dist/seed/createAdmin.js
 */
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db, { initializeDatabase } from '../db';

const EMAIL = 'admin@bcfl.com';
const PASSWORD = 'bigdil';

initializeDatabase();

// Check if user already exists
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL) as { id: string } | undefined;

if (existing) {
  // Update password and ensure admin role
  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE email = ?').run(passwordHash, 'ADMIN', EMAIL);
  console.log(`✅ Updated existing user ${EMAIL} - password reset and role set to ADMIN`);
} else {
  // Create new admin user
  const adminId = uuidv4();
  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `).run(adminId, EMAIL, passwordHash, 'ADMIN');
  console.log(`✅ Created admin user: ${EMAIL} / ${PASSWORD}`);
}

process.exit(0);

