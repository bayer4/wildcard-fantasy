# Wildcard Fantasy

A one-week fantasy football Wildcard app with admin-seeded teams, lineup management, and scoring.

## Quick Start

### Backend

```bash
cd server
npm install
npm run dev
```

Server runs at http://localhost:3001

### Frontend

```bash
cd client
npm install
npm run dev
```

Client runs at http://localhost:5173

---

## Setup Guide

The app starts with an empty database. All data must be uploaded via admin endpoints.

### 1. Create Admin User

First, register an admin user via the API or frontend:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "yourpassword", "role": "ADMIN"}'
```

### 2. Seed Teams & Rosters

Login as admin, then POST to `/api/admin/seed` with your league structure:

```json
{
  "conferences": [
    {
      "name": "AFC",
      "teams": [
        {
          "name": "Team Alpha",
          "roster": [
            { "displayName": "Patrick Mahomes", "position": "QB", "nflTeam": "KC" },
            { "displayName": "Travis Kelce", "position": "TE", "nflTeam": "KC" },
            { "displayName": "KC Defense", "position": "DEF", "nflTeam": "KC" }
          ]
        },
        {
          "name": "Team Beta",
          "roster": [
            { "displayName": "Lamar Jackson", "position": "QB", "nflTeam": "BAL" },
            { "displayName": "Derrick Henry", "position": "RB", "nflTeam": "BAL" }
          ]
        }
      ]
    },
    {
      "name": "NFC",
      "teams": [
        {
          "name": "Team Gamma",
          "roster": [
            { "displayName": "Jalen Hurts", "position": "QB", "nflTeam": "PHI" }
          ]
        }
      ]
    }
  ]
}
```

**Valid positions**: `QB`, `RB`, `WR`, `TE`, `K`, `DEF`

**Notes**:
- Players are stored globally and can appear on multiple fantasy teams
- The same player on different teams is allowed
- Roster entries link fantasy teams to players
- Lineup entries are created for the current week (default: all BENCH)

### 3. Upload Scoring Rules

POST to `/api/admin/rules`:

```json
{
  "name": "PPR Standard",
  "rules": {
    "passing": { 
      "yardsPerPoint": 25, 
      "tdPoints": 4, 
      "interceptionPoints": -2, 
      "twoPtConversionPoints": 2 
    },
    "rushing": { 
      "yardsPerPoint": 10, 
      "tdPoints": 6, 
      "twoPtConversionPoints": 2 
    },
    "receiving": { 
      "yardsPerPoint": 10, 
      "tdPoints": 6, 
      "receptionPoints": 1, 
      "twoPtConversionPoints": 2 
    },
    "kicking": { 
      "fgMade0_39Points": 3, 
      "fgMade40_49Points": 4, 
      "fgMade50_54Points": 5, 
      "fgMade55PlusPoints": 6, 
      "fgMissedPoints": -1, 
      "xpMadePoints": 1, 
      "xpMissedPoints": -1 
    },
    "defense": { 
      "sackPoints": 1, 
      "interceptionPoints": 2, 
      "fumbleRecoveryPoints": 2, 
      "defenseTDPoints": 6, 
      "safetyPoints": 2, 
      "blockedKickPoints": 2, 
      "returnTDPoints": 6,
      "pointsAllowedScoring": [
        { "maxPoints": 0, "fantasyPoints": 10 },
        { "maxPoints": 6, "fantasyPoints": 7 },
        { "maxPoints": 13, "fantasyPoints": 4 },
        { "maxPoints": 20, "fantasyPoints": 1 },
        { "maxPoints": 27, "fantasyPoints": 0 },
        { "maxPoints": 34, "fantasyPoints": -1 },
        { "maxPoints": 99, "fantasyPoints": -4 }
      ],
      "yardsAllowedScoring": [
        { "maxYards": 99, "fantasyPoints": 5 },
        { "maxYards": 199, "fantasyPoints": 3 },
        { "maxYards": 299, "fantasyPoints": 2 },
        { "maxYards": 349, "fantasyPoints": 0 },
        { "maxYards": 399, "fantasyPoints": -1 },
        { "maxYards": 449, "fantasyPoints": -3 },
        { "maxYards": 499, "fantasyPoints": -5 },
        { "maxYards": 549, "fantasyPoints": -6 },
        { "maxYards": 9999, "fantasyPoints": -7 }
      ]
    },
    "misc": { 
      "fumbleLostPoints": -2 
    },
    "bonuses": {
      "passingTD50PlusYards": 2,
      "rushingTD50PlusYards": 2,
      "receivingTD50PlusYards": 2,
      "passing300PlusYards": 3,
      "passing400PlusYards": 5,
      "rushing100PlusYards": 3,
      "rushing200PlusYards": 5,
      "receiving100PlusYards": 3,
      "receiving200PlusYards": 5,
      "fg55PlusYards": 3
    }
  }
}
```

### 4. Ingest Game Stats

After games are played, POST stats to `/api/admin/ingest/manual`:

```json
{
  "games": [
    { 
      "week": 1, 
      "homeTeamAbbr": "KC", 
      "awayTeamAbbr": "HOU", 
      "kickoffTime": "2025-01-11T16:30:00Z", 
      "status": "final" 
    }
  ],
  "playerGameStats": [
    { 
      "playerName": "Patrick Mahomes", 
      "position": "QB", 
      "nflTeamAbbr": "KC", 
      "gameWeek": 1, 
      "passYards": 320, 
      "passTDs": 3, 
      "passInterceptions": 1,
      "rushYards": 25,
      "rushTDs": 0 
    }
  ],
  "defenseGameStats": [
    { 
      "teamAbbr": "KC", 
      "gameWeek": 1, 
      "pointsAllowed": 17, 
      "yardsAllowed": 320, 
      "sacks": 4, 
      "interceptions": 2 
    }
  ]
}
```

### 5. Recompute Scores

POST to `/api/admin/recompute-scores`:

```json
{ "week": 1 }
```

This requires:
- Scoring rules uploaded
- Games exist for the week
- Player stats exist for the week

---

## API Reference

### Authentication

- `POST /api/auth/register` - Register user (role: "ADMIN" or "TEAM")
- `POST /api/auth/login` - Login (returns JWT token)

### Admin Endpoints (requires ADMIN role)

- `POST /api/admin/seed` - Seed conferences, teams, rosters
- `POST /api/admin/rules` - Upload scoring rules
- `GET /api/admin/rules` - List all rule sets
- `POST /api/admin/ingest/manual` - Ingest game stats
- `POST /api/admin/recompute-scores` - Calculate fantasy scores
- `GET /api/admin/status` - Database status counts
- `GET /api/admin/teams` - List teams
- `GET /api/admin/players` - List players
- `GET /api/admin/lineup/:teamId/:week` - View team lineup
- `PUT /api/admin/settings` - Update league settings

### Team Endpoints (requires TEAM or ADMIN role)

- `GET /api/team/my-team` - Get current user's team
- `GET /api/team/lineup/:week` - Get lineup for week
- `PUT /api/team/lineup/:week/:rosterPlayerId` - Set starter/bench status
- `GET /api/team/scores/:week` - Get team scores
- `GET /api/team/standings/:week` - Get standings

---

## Database Schema

The app uses SQLite with the following key tables:

- `conferences` - League divisions (e.g., AFC, NFC)
- `teams` - Fantasy teams
- `players` - Global NFL player registry
- `roster_players` - Join table (team → players)
- `lineup_entries` - Weekly starter/bench status
- `games` - NFL game schedule
- `player_game_stats` - Per-game player stats
- `team_defense_game_stats` - Per-game defense stats
- `scoring_rule_sets` - Uploaded scoring configurations
- `team_scores` / `player_scores` - Computed fantasy points

---

## Environment Variables

Create `server/.env`:

```
PORT=3001
JWT_SECRET=your-secret-key
DATABASE_PATH=./data/wildcard.db
SPORTSDATAIO_API_KEY=optional-for-live-stats
```

---

## Lineup Locking

Players are locked when:
1. Their NFL game kicks off (based on `kickoffTime` in games table)
2. Global lock time is set (via `/api/admin/settings`)

Locked players cannot be moved between STARTER and BENCH.
