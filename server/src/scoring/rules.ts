/**
 * BCFL Scoring Rules - No validation, store as opaque JSON blob
 * 
 * The BCFL format uses milestone-based scoring with bonuses:
 * - yardageMilestones with totalBonus values
 * - td50PlusBonus for big plays
 * - combinedRushReceive for combo yards
 * - qbRushingTdBonus, nonQbPassTdPoints
 * - kicking tiers (fgUnder53, fg53or54, fg55Plus)
 * - defenseSpecialTeams (shutout, interception, fumbleRecovery)
 */

// No validation - accept any rules object as-is
export function validateScoringRules(_rules: any): boolean {
  // Always return true - we store whatever is provided
  return true;
}

/**
 * Returns the BCFL schema documentation for reference
 */
export function getScoringRulesSchema(): object {
  return {
    _note: "BCFL milestone/bonus-based scoring. Rules are stored as-is without validation.",
    example: {
      name: "2025 BCFL Scoring Rules",
      notes: ["All scoring uses NFL face value with BCFL bonus points."],
      bonuses: {
        rushing: {
          yardageMilestones: [
            { yards: 75, totalBonus: 3 },
            { yards: 100, totalBonus: 7 },
            { yards: 150, totalBonus: 10 },
            { yards: 200, totalBonus: 13 }
          ],
          td50PlusBonus: 3
        },
        receiving: {
          yardageMilestones: [
            { yards: 75, totalBonus: 3 },
            { yards: 100, totalBonus: 7 },
            { yards: 150, totalBonus: 10 },
            { yards: 200, totalBonus: 13 }
          ],
          td50PlusBonus: 3
        },
        combinedRushReceive: {
          onlyIfNeitherCategoryReached: true,
          milestones: [
            { yards: 125, bonus: 3, requiresNeitherRush75NorReceive75: true },
            { yards: 150, bonus: 4, requiresNeitherRush100NorReceive100: true }
          ]
        },
        passing: {
          tdPoints: 4,
          yardageMilestones: [
            { yards: 250, totalBonus: 3 },
            { yards: 300, totalBonus: 7 },
            { yards: 350, totalBonus: 10 },
            { yards: 400, totalBonus: 13 }
          ],
          tdPass50PlusBonus: 3,
          qbRushingTdBonus: 3,
          interception: -1,
          nonQbPassTdPoints: 7
        },
        turnovers: {
          fumble: -1
        },
        kicking: {
          fgUnder53: 3,
          fg53or54: 4,
          fg55Plus: 3,
          missedXP: -1,
          missedFG30to39: -1,
          missedFG29orLess: -2
        },
        defenseSpecialTeams: {
          directScore: "NFL_FACE_VALUE",
          shutout: 7,
          interception: 1,
          fumbleRecovery: 1,
          leastTotalYardageAllowed: 3
        },
        twoPointConversions: {
          playerScoring: 2,
          playerPassing: 1
        }
      }
    }
  };
}

/**
 * Normalize incoming rules payload to extract the actual rules object
 * Handles multiple shapes:
 * A) { "name": string, "active"?: boolean, ...BCFL_RULES_FIELDS }
 * B) { "ruleSetName": string, "active"?: boolean, "rules": { ...BCFL_RULES_FIELDS } }
 * C) { name, rules: { ruleSetName, active, rules: {...} } } (UI shape)
 */
export function normalizeRulesPayload(body: any): { name: string; active: boolean; rules: any } {
  // Extract name from various possible locations
  const finalName = 
    body.name || 
    body.ruleSetName || 
    body.rules?.ruleSetName ||
    body.rules?.name ||
    "Ruleset";

  // Extract active flag
  const finalActive = 
    body.active ?? 
    body.rules?.active ?? 
    true;

  // Extract the actual rules object
  let finalRules: any;
  
  if (body.rules?.rules) {
    // Shape C: nested rules.rules
    finalRules = { ...body.rules.rules };
  } else if (body.rules && typeof body.rules === 'object') {
    // Shape B: rules at top level
    finalRules = { ...body.rules };
  } else {
    // Shape A: rules fields at top level
    finalRules = { ...body };
  }

  // Remove metadata keys from the rules object
  delete finalRules.name;
  delete finalRules.ruleSetName;
  delete finalRules.active;

  return {
    name: finalName,
    active: finalActive,
    rules: finalRules
  };
}
