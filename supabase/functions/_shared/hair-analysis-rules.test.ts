import {
  buildConsistencyRecord,
  buildHairAnalysisConsistencyIssues,
} from '../../../src/features/hairAnalysisConsistency.js';
import { getHairAnalysisAvailability } from '../../../src/features/hairAnalysisAvailability.js';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test('first Hair Check is available without a misleading date', () => {
  const result = getHairAnalysisAvailability(null, Date.parse('2026-09-10T00:00:00Z'));
  assert(result.hasPreviousCheck === false, 'First-time state should not have a prior date');
  assert(result.isLocked === false, 'First-time Hair Check should be available');
  assert(result.nextCheckAt === null, 'First-time state should not invent a next date');
});

Deno.test('repeat Hair Check uses the same exact seven-day rule', () => {
  const latest = '2026-09-08T02:00:00Z';
  const before = getHairAnalysisAvailability(latest, Date.parse('2026-09-15T01:59:59Z'));
  const atBoundary = getHairAnalysisAvailability(latest, Date.parse('2026-09-15T02:00:00Z'));
  assert(before.isLocked === true, 'Check should remain locked before seven full days');
  assert(atBoundary.isLocked === false, 'Check should unlock at the seven-day boundary');
});

Deno.test('meaningful high-confidence mismatch requires an explicit resolution', () => {
  const answers = { oilyAfterWash: 'no', dandruffOrFlakes: 'no', dryOrRough: 'normal_balanced' };
  const analysis = { confidence_score: 0.9, oiliness_level: 8, dryness_level: 2, damage_level: 1 };
  const issues = buildHairAnalysisConsistencyIssues({ answers, analysis });
  assert(issues.some((issue: { id?: string }) => issue.id === 'visible_oiliness'), 'Expected oiliness mismatch');

  const record = buildConsistencyRecord({
    answers,
    analysis,
    issues,
    resolutions: { visible_oiliness: 'keep_original_answer' },
  });
  assert(record.original_answers.oilyAfterWash === 'no', 'Original answer must be preserved');
  assert(record.conflicts[0].resolution === 'keep_original_answer', 'Resolution must be preserved');
});

Deno.test('low-confidence observations do not create a mismatch interruption', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { oilyAfterWash: 'no' },
    analysis: { confidence_score: 0.5, oiliness_level: 9 },
  });
  assert(issues.length === 0, 'Low-confidence finding should not interrupt the donor');
});

Deno.test('Coily self-assessment versus Straight visual finding requires review', () => {
  const answers = { hairTexture: 'Coily' };
  const analysis = {
    confidence_score: 0.92,
    detected_texture: 'Straight',
    oiliness_level: 4,
    dryness_level: 4,
    damage_level: 3,
  };
  const issues = buildHairAnalysisConsistencyIssues({ answers, analysis });
  const textureIssue = issues.find((issue: { category?: string }) => issue.category === 'texture');

  assert(Boolean(textureIssue), 'Expected a high-confidence texture review item');
  assert(textureIssue?.donorAnswer === 'Coily', 'Original Coily answer must remain visible');
  assert(textureIssue?.visualFinding === 'Straight', 'Independent Straight visual finding must remain visible');

  const record = buildConsistencyRecord({
    answers,
    analysis,
    issues,
    resolutions: { [textureIssue!.id]: 'accept_visual_finding' },
  });
  assert(record.resolved_values.texture === 'Straight', 'Accepting the visual finding should resolve texture to Straight');
  assert(record.ai_visible_findings.detected_texture === 'Straight', 'The AI finding must not be overwritten');
});

Deno.test('matching Straight texture proceeds without a texture review item', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairTexture: 'Straight' },
    analysis: { confidence_score: 0.95, detected_texture: 'Straight' },
  });
  assert(!issues.some((issue: { category?: string }) => issue.category === 'texture'), 'Matching texture should not be interrupted');
});

Deno.test('a clear Straight versus Curly texture difference requires review', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairTexture: 'Straight' },
    analysis: { confidence_score: 0.92, detected_texture: 'Curly' },
  });
  assert(issues.some((issue: { category?: string }) => issue.category === 'texture'), 'Straight versus Curly should be reviewed');
});

Deno.test('adjacent Wavy versus Straight only interrupts at strong confidence', () => {
  const weakIssues = buildHairAnalysisConsistencyIssues({
    answers: { hairTexture: 'Wavy' },
    analysis: { confidence_score: 0.82, detected_texture: 'Straight' },
  });
  const strongIssues = buildHairAnalysisConsistencyIssues({
    answers: { hairTexture: 'Wavy' },
    analysis: { confidence_score: 0.94, detected_texture: 'Straight' },
  });
  assert(!weakIssues.some((issue: { category?: string }) => issue.category === 'texture'), 'An uncertain adjacent texture should not interrupt');
  assert(strongIssues.some((issue: { category?: string }) => issue.category === 'texture'), 'A clear adjacent texture difference should be reviewed');
});

Deno.test('reported oiliness matches an oily self-assessment', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { oilyAfterWash: 'yes' },
    analysis: { confidence_score: 0.93, oiliness_level: 8 },
  });
  assert(!issues.some((issue: { category?: string }) => issue.category === 'visible_oiliness'), 'Matching visible oiliness should not interrupt');
});

Deno.test('visible flaking conflicts with a no-flaking answer', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { dandruffOrFlakes: 'no' },
    analysis: { confidence_score: 0.9, dandruff_detected: true, dandruff_severity: 'mild' },
  });
  assert(issues.some((issue: { category?: string }) => issue.category === 'visible_flaking'), 'Visible flaking should be reviewed');
});

Deno.test('visible flaking matches a visible-flaking answer', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { dandruffOrFlakes: 'a_little' },
    analysis: { confidence_score: 0.9, dandruff_detected: true, dandruff_severity: 'mild' },
  });
  assert(!issues.some((issue: { category?: string }) => issue.category === 'visible_flaking'), 'Matching visible flaking should not interrupt');
});

Deno.test('balanced condition versus clear visible dryness requires review', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { dryOrRough: 'normal_balanced' },
    analysis: {
      confidence_score: 0.91,
      detected_condition: 'Visible dryness',
      visible_condition_status: 'Visible Concerns Detected',
      dryness_level: 8,
      damage_level: 2,
      oiliness_level: 2,
    },
  });
  assert(issues.some((issue: { category?: string }) => issue.category === 'visible_condition'), 'Visible dryness should be reviewed against balanced appearance');
});

Deno.test('high versus low apparent density requires review when supplied', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairDensity: 'High' },
    analysis: { confidence_score: 0.93, detected_density: 'Light' },
  });
  assert(issues.some((issue: { category?: string }) => issue.category === 'apparent_density'), 'High versus low apparent density should be reviewed');
});

Deno.test('color does not conflict when lighting evidence is poor', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairColor: 'Black' },
    analysis: {
      confidence_score: 0.96,
      detected_color: 'Brown',
      per_view_notes: [{ view: 'Back Hair', notes: 'Poor lighting creates a strong color cast.' }],
    },
  });
  assert(!issues.some((issue: { category?: string }) => issue.category === 'color'), 'Poor lighting must suppress a color conflict');
});

Deno.test('small visible length estimate differences are treated as a match', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairLength: '8 inches' },
    analysis: { confidence_score: 0.95, estimated_length: 7.9 * 2.54, length_measurable: true },
  });
  assert(!issues.some((issue: { category?: string }) => issue.category === 'length'), '8 inches versus 7.9 inches should match');
});

Deno.test('large visible length differences require review when length was supplied', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairLength: '18 inches' },
    analysis: { confidence_score: 0.95, estimated_length: 8 * 2.54, length_measurable: true },
  });
  assert(issues.some((issue: { category?: string }) => issue.category === 'length'), '18 inches versus about 8 inches should be reviewed');
});

Deno.test('multiple meaningful differences exclude the matching flaking answer', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: {
      hairTexture: 'Coily',
      oilyAfterWash: 'no',
      dandruffOrFlakes: 'no',
    },
    analysis: {
      confidence_score: 0.9,
      detected_texture: 'Straight',
      oiliness_level: 8,
      dandruff_detected: false,
      dryness_level: 3,
      damage_level: 2,
    },
  });
  assert(issues.some((issue: { category?: string }) => issue.category === 'texture'), 'Texture mismatch should be shown');
  assert(issues.some((issue: { category?: string }) => issue.category === 'visible_oiliness'), 'Oiliness mismatch should be shown');
  assert(!issues.some((issue: { category?: string }) => issue.category === 'visible_flaking'), 'Matching flaking answer should not be shown');
});

Deno.test('uncertain texture never becomes a forced mismatch', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { hairTexture: 'Wavy' },
    analysis: { confidence_score: 0.9, detected_texture: 'Unable to determine' },
  });
  assert(issues.length === 0, 'An undetermined visual finding must not become a mismatch');
});

Deno.test('an explicit category-level unable result suppresses a conflict', () => {
  const issues = buildHairAnalysisConsistencyIssues({
    answers: { dandruffOrFlakes: 'a_lot' },
    analysis: {
      confidence_score: 0.95,
      dandruff_detected: false,
      assessment_consistency: [{
        category: 'visible_flaking',
        answer_key: 'dandruff_or_flakes',
        self_assessment: 'a_lot',
        visual_finding: 'Unable to determine',
        consistent: false,
        requires_confirmation: false,
        unable_to_determine: true,
        confidence: 0.95,
        explanation: 'The scalp view is not clear enough.',
        relevant_view: 'Scalp / Root Area',
      }],
    },
  });
  assert(!issues.some((issue: { category?: string }) => issue.category === 'visible_flaking'), 'Unable findings must never force a mismatch');
});

Deno.test('keeping the original preserves both self-report and AI observation', () => {
  const answers = { hairTexture: 'Coily' };
  const analysis = { confidence_score: 0.91, detected_texture: 'Straight' };
  const issues = buildHairAnalysisConsistencyIssues({ answers, analysis });
  const textureIssue = issues[0];
  const record = buildConsistencyRecord({
    answers,
    analysis,
    issues,
    resolutions: { [textureIssue.id]: 'keep_original_answer' },
  });

  assert(record.original_answers.hairTexture === 'Coily', 'Self-reported Coily must be preserved');
  assert(record.ai_visible_findings.detected_texture === 'Straight', 'AI-observed Straight must be preserved');
  assert(record.resolved_values.texture === 'Coily', 'The donor confirmation should resolve to the retained self-report');
  assert(record.conflicts[0].resolution_source === 'self_reported', 'Resolution source should remain transparent');
});
