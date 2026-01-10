import { Router, Response } from 'express';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { computeTeamScores } from '../scoring/engine';

const router = Router();

// Public scores endpoint (read-only for authenticated users)
router.use(authenticate);

// Get scores for a week (all teams)
router.get('/:week', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const weekNum = parseInt(week);

  // Get persisted scores (bench_points is tiebreaker)
  const scores = db.prepare(`
    SELECT ts.*, t.name as team_name, t.conference
    FROM team_scores ts
    JOIN teams t ON ts.team_id = t.id
    WHERE ts.week = ?
    ORDER BY ts.starter_points DESC, ts.bench_points DESC
  `).all(weekNum);

  res.json(scores);
});

// Get live/computed scores (without persisting)
router.get('/:week/live', (req: AuthRequest, res: Response) => {
  const { week } = req.params;
  const weekNum = parseInt(week);

  try {
    const scores = computeTeamScores(weekNum);
    res.json(scores);
  } catch (error) {
    console.error('Compute scores error:', error);
    res.status(500).json({ error: 'Failed to compute scores' });
  }
});

// Get detailed score breakdown for a team
router.get('/:week/team/:teamId', (req: AuthRequest, res: Response) => {
  const { week, teamId } = req.params;
  const weekNum = parseInt(week);

  const teamScore = db.prepare(`
    SELECT ts.*, t.name as team_name, t.conference
    FROM team_scores ts
    JOIN teams t ON ts.team_id = t.id
    WHERE ts.team_id = ? AND ts.week = ?
  `).get(teamId, weekNum);

  const playerScores = db.prepare(`
    SELECT ps.*, p.name, p.position, p.nfl_team_abbr
    FROM player_scores ps
    JOIN players p ON ps.player_id = p.id
    WHERE ps.team_id = ? AND ps.week = ?
    ORDER BY ps.is_starter DESC, ps.points DESC
  `).all(teamId, weekNum);

  if (!teamScore) {
    res.json({
      teamScore: null,
      playerScores: []
    });
    return;
  }

  res.json({
    teamScore,
    playerScores
  });
});

// Get conference standings
router.get('/:week/standings/:conference', (req: AuthRequest, res: Response) => {
  const { week, conference } = req.params;
  const weekNum = parseInt(week);

  if (conference !== 'AFC' && conference !== 'NFC') {
    res.status(400).json({ error: 'Conference must be AFC or NFC' });
    return;
  }

  const standings = db.prepare(`
    SELECT ts.*, t.name as team_name, t.conference
    FROM team_scores ts
    JOIN teams t ON ts.team_id = t.id
    WHERE ts.week = ? AND t.conference = ?
    ORDER BY ts.starter_points DESC, ts.bench_points DESC
  `).all(weekNum, conference);

  res.json(standings);
});

export default router;

