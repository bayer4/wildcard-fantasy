import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { generateToken, authenticate, AuthRequest } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

// Helper: check if any admin exists
function adminExists(): boolean {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  return !!admin;
}

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, role = 'TEAM' } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Check if email exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Determine role:
    // - If no admin exists, first user becomes ADMIN automatically
    // - Otherwise, use the requested role (ADMIN allowed via explicit request)
    let userRole: UserRole;
    if (!adminExists()) {
      userRole = 'ADMIN';
      console.log(`No admin exists. Promoting ${email} to ADMIN.`);
    } else if (role === 'ADMIN') {
      userRole = 'ADMIN';
    } else {
      userRole = 'TEAM';
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(userId, email, passwordHash, userRole);

    const token = generateToken({ id: userId, email, role: userRole, teamId: null });

    res.status(201).json({
      token,
      user: { id: userId, email, role: userRole, teamId: null }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = db.prepare(`
      SELECT u.id, u.email, u.password_hash, u.role, u.team_id, t.name as team_name
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE u.email = ?
    `).get(email) as { id: string; email: string; password_hash: string; role: UserRole; team_id: string | null; team_name: string | null } | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role, teamId: user.team_id });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        teamId: user.team_id,
        teamName: user.team_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  const user = db.prepare(`
    SELECT u.id, u.email, u.role, u.team_id, t.name as team_name
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = ?
  `).get(req.user!.id) as { id: string; email: string; role: UserRole; team_id: string | null; team_name: string | null };

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    teamId: user.team_id,
    teamName: user.team_name
  });
});

// Change own password
router.put('/password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters' });
      return;
    }

    // Get current user's password hash
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string } | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user!.id);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Promote user to ADMIN
// - If no admin exists: any authenticated user can promote any user
// - If admin exists: only admins can promote
router.post('/promote', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Check if admin already exists
    const hasAdmin = adminExists();
    
    // If admin exists, only admin can promote
    if (hasAdmin && req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Only admins can promote users' });
      return;
    }

    // Find the user to promote
    const userToPromote = db.prepare('SELECT id, email, role FROM users WHERE email = ?')
      .get(email) as { id: string; email: string; role: string } | undefined;

    if (!userToPromote) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (userToPromote.role === 'ADMIN') {
      res.status(400).json({ error: 'User is already an admin' });
      return;
    }

    // Promote to admin and clear teamId
    db.prepare('UPDATE users SET role = ?, team_id = NULL WHERE id = ?')
      .run('ADMIN', userToPromote.id);

    console.log(`Promoted ${email} to ADMIN`);

    res.json({ 
      success: true, 
      message: `${email} has been promoted to ADMIN`,
      user: {
        id: userToPromote.id,
        email: userToPromote.email,
        role: 'ADMIN',
        teamId: null
      }
    });
  } catch (error) {
    console.error('Promote error:', error);
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

export default router;
