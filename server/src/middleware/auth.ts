import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db';
import { User, UserRole } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'wildcard-fantasy-secret-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    teamId: string | null;
  };
}

export function generateToken(user: { id: string; email: string; role: UserRole; teamId: string | null }): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, teamId: user.teamId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): { id: string; email: string; role: UserRole; teamId: string | null } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: UserRole; teamId: string | null };
  } catch {
    return null;
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Verify user still exists
  const user = db.prepare('SELECT id, email, role, team_id FROM users WHERE id = ?').get(decoded.id) as any;
  
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    teamId: user.team_id
  };

  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

export function requireTeamOrAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Admin can access anything
  if (req.user.role === 'ADMIN') {
    next();
    return;
  }

  // Team user must have a team assigned
  if (req.user.role === 'TEAM' && !req.user.teamId) {
    res.status(403).json({ error: 'No team assigned to user' });
    return;
  }

  next();
}

