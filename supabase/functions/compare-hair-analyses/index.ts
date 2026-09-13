import { createClient } from 'npm:@supabase/supabase-js@2';
import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse, resolveOpenRouterHairVisionModel } from '../_shared/ai-vision.ts';

const comparisonSchema = {
  type: 'object',
  properties: {
    comparison: {
      type: 'object',
      properties: {
        outcome: {
          type: 'string',
          enum: [
            'improved_visible_findings',
            'similar',
            'new_visible_concerns',
            'mixed_changes',
            'insufficient_comparable_data',
          ],
        },
        summary: { type: 'string' },
        notable_changes: { type: 'array', items: { type: 'string' } },
      },
      required: ['outcome', 'summary', 'notable_changes'],
    },
  },
  required: ['comparison'],
};

const instructions = [
  'Compare two saved donor Hair Analysis results and return JSON only.',
  'Use only the supplied structured results. Do not request, infer, or mention photos that are not supplied.',
  'Write one concise, encouraging, nonmedical progress summary of at most three sentences.',
  'Use visible-observation language such as "appears", "visible", and "detected". Never claim healing, diagnosis, cure, or medical improvement.',
  'Outcome must be improved_visible_findings, similar, new_visible_concerns, mixed_changes, or insufficient_comparable_data.',
  'Prioritize saved visual findings: visible-condition status, dryness, roughness, visible damage, oiliness, visible scalp flaking, apparent density, and observations.',
  'Call Straight, Wavy, Curly, and Coily classifications Hair Pattern. Never use Hair Texture or Texture for them.',
  'A Hair Pattern or hair-color change is descriptive only. Never call it improvement, worsening, healthier, or damage.',
  'If Hair Pattern/color are the only differences, use outcome=similar and state that the visible Hair Pattern or color appears different while overall visible-condition findings remain similar.',
  'Do not use self-assessment alone as evidence of visible progress.',
].join('\n');

const getBearerToken = (request: Request) => {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const normalizeString = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const normalizeStringArray = (value: unknown) => Array.isArray(value)
  ? value.map(normalizeString).filter(Boolean)
  : [];

const toAnalysisObject = (value: unknown) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const buildScreeningSnapshot = (row: Record<string, unknown>) => {
  const result = toAnalysisObject(row.Analysis_Result);
  const reviewed = toAnalysisObject(result.reviewed_details);
  return {
    screening_id: row.AI_Screening_ID,
    completed_at: row.Created_At,
    visible_condition_status: normalizeString(result.visible_condition_status),
    visible_concerns: normalizeStringArray(result.visible_concerns),
    hair_pattern: normalizeString(
      reviewed.hair_pattern
      || reviewed.texture
      || result.hair_pattern
      || row.Detected_Texture,
    ),
    color: normalizeString(reviewed.color || row.Detected_Color),
    apparent_density: normalizeString(reviewed.apparent_density || row.Detected_Density),
    condition: normalizeString(reviewed.condition || row.Detected_Condition),
    dryness_level: Number(row.Dryness_Level ?? result.dryness_level ?? 0),
    oiliness_level: Number(row.Oiliness_Level ?? result.oiliness_level ?? 0),
    damage_level: Number(row.Damage_Level ?? result.damage_level ?? 0),
    visible_scalp_flaking: row.Dandruff_Detected === true,
    flaking_notes: normalizeString(row.Dandruff_Notes || result.dandruff_notes),
    visible_damage_notes: normalizeString(row.Visible_Damage_Notes || result.visible_damage_notes),
    summary: normalizeString(row.Summary || result.summary),
  };
};

const buildVisibleQualitySignature = (snapshot: ReturnType<typeof buildScreeningSnapshot>) => JSON.stringify({
  visible_condition_status: snapshot.visible_condition_status,
  visible_concerns: [...snapshot.visible_concerns].map((item) => item.toLowerCase()).sort(),
  apparent_density: snapshot.apparent_density.toLowerCase(),
  condition: snapshot.condition.toLowerCase(),
  dryness_level: snapshot.dryness_level,
  oiliness_level: snapshot.oiliness_level,
  damage_level: snapshot.damage_level,
  visible_scalp_flaking: snapshot.visible_scalp_flaking,
});

const replaceLegacyPatternTerms = (value: string) => value
  .replace(/hair\s+texture/gi, 'Hair Pattern')
  .replace(/\btexture\b/gi, 'Hair Pattern')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeCachedComparison = (row: Record<string, unknown>) => ({
  comparison_id: row.Comparison_ID,
  user_id: row.User_ID,
  previous_screening_id: row.Previous_AI_Screening_ID,
  current_screening_id: row.Current_AI_Screening_ID,
  outcome: normalizeString(row.Comparison_Type),
  summary: replaceLegacyPatternTerms(normalizeString(row.Comparison_Summary)),
  details: toAnalysisObject(row.Comparison_Details),
  model: normalizeString(row.Model),
  generation_status: normalizeString(row.Generation_Status),
  created_at: row.Created_At,
});

const comparisonSelect = [
  'Comparison_ID',
  'User_ID',
  'Previous_AI_Screening_ID',
  'Current_AI_Screening_ID',
  'Comparison_Type',
  'Comparison_Summary',
  'Comparison_Details',
  'Model',
  'Generation_Status',
  'Created_At',
].join(',');

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return createJsonResponse({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return createJsonResponse({ error: 'Hair Analysis comparison is not configured.' }, 500);
  }

  const token = getBearerToken(request);
  if (!token) return createJsonResponse({ error: 'Authorization is required.' }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const authResult = await supabase.auth.getUser(token);
  const authUserId = authResult.data?.user?.id || '';
  if (!authUserId || authResult.error) {
    return createJsonResponse({ error: 'A valid authenticated session is required.' }, 401);
  }

  const userResult = await supabase
    .from('users')
    .select('user_id, role')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  const userId = Number(userResult.data?.user_id);
  if (userResult.error || !Number.isInteger(userId) || userId <= 0) {
    return createJsonResponse({ error: 'Donor account could not be resolved.' }, 404);
  }
  if (normalizeString(userResult.data?.role).toLowerCase() !== 'donor') {
    return createJsonResponse({ error: 'Only donor accounts can compare Hair Analysis results.' }, 403);
  }

  const screeningsResult = await supabase
    .from('AI_Screenings')
    .select('AI_Screening_ID,User_ID,Detected_Color,Detected_Texture,Detected_Density,Detected_Condition,Visible_Damage_Notes,Dryness_Level,Oiliness_Level,Damage_Level,Dandruff_Detected,Dandruff_Notes,Summary,Analysis_Result,Created_At')
    .eq('User_ID', userId)
    .not('Analysis_Result', 'cs', JSON.stringify({ source: 'manual_seed' }))
    .not('Summary', 'ilike', '%Copied into event donation registration.%')
    .order('Created_At', { ascending: false })
    .order('AI_Screening_ID', { ascending: false })
    .limit(2);
  if (screeningsResult.error) {
    return createJsonResponse({ error: 'Completed Hair Analysis results could not be loaded.' }, 500);
  }
  if ((screeningsResult.data || []).length < 2) {
    return createJsonResponse({ comparison: null, reason: 'not_enough_completed_screenings' });
  }

  const currentRow = screeningsResult.data[0] as Record<string, unknown>;
  const previousRow = screeningsResult.data[1] as Record<string, unknown>;
  const currentId = Number(currentRow.AI_Screening_ID);
  const previousId = Number(previousRow.AI_Screening_ID);
  const model = resolveOpenRouterHairVisionModel(Deno.env.get('OPENROUTER_HAIR_ANALYSIS_MODEL'));

  const cachedResult = await supabase
    .from('Hair_Analysis_Comparisons')
    .select(comparisonSelect)
    .eq('Previous_AI_Screening_ID', previousId)
    .eq('Current_AI_Screening_ID', currentId)
    .maybeSingle();
  if (cachedResult.data) {
    return createJsonResponse({ comparison: normalizeCachedComparison(cachedResult.data), cached: true });
  }
  if (cachedResult.error) {
    return createJsonResponse({ error: 'Hair Analysis comparison cache could not be read.' }, 500);
  }
  if (!(Deno.env.get('OPENROUTER_API_KEY') || '').trim()) {
    return createJsonResponse({ error: 'Hair Analysis comparison is not configured.' }, 500);
  }

  const reservation = await supabase
    .from('Hair_Analysis_Comparisons')
    .insert({
      User_ID: userId,
      Previous_AI_Screening_ID: previousId,
      Current_AI_Screening_ID: currentId,
      Comparison_Type: 'insufficient_comparable_data',
      Comparison_Summary: 'Preparing your Hair Analysis comparison.',
      Comparison_Details: {},
      Model: model,
      Generation_Status: 'pending',
    })
    .select(comparisonSelect)
    .single();

  if (reservation.error) {
    const racedResult = await supabase
      .from('Hair_Analysis_Comparisons')
      .select(comparisonSelect)
      .eq('Previous_AI_Screening_ID', previousId)
      .eq('Current_AI_Screening_ID', currentId)
      .maybeSingle();
    if (racedResult.data) {
      return createJsonResponse({ comparison: normalizeCachedComparison(racedResult.data), cached: true });
    }
    return createJsonResponse({ error: 'Hair Analysis comparison could not be reserved.' }, 500);
  }

  const previous = buildScreeningSnapshot(previousRow);
  const current = buildScreeningSnapshot(currentRow);

  try {
    const providerResult = await createStructuredResponse({
      providerMode: 'openrouter-only',
      model,
      systemInstruction: instructions,
      responseJsonSchema: comparisonSchema,
      maxOutputTokens: 700,
      temperature: 0.2,
      reasoningEffort: 'minimal',
      includeDiagnostics: true,
      contents: [{
        role: 'user',
        parts: [{
          text: JSON.stringify({ previous_analysis: previous, latest_analysis: current }),
        }],
      }],
    }) as { parsed?: Record<string, unknown>; diagnostics?: Record<string, unknown> };
    const parsed = toAnalysisObject(providerResult.parsed);
    const source = toAnalysisObject(parsed.comparison || parsed);
    const allowedOutcomes = [
      'improved_visible_findings',
      'similar',
      'new_visible_concerns',
      'mixed_changes',
      'insufficient_comparable_data',
    ];
    const providerOutcome = allowedOutcomes.includes(normalizeString(source.outcome))
      ? normalizeString(source.outcome)
      : 'insufficient_comparable_data';
    const sameVisibleQuality = buildVisibleQualitySignature(previous) === buildVisibleQualitySignature(current);
    const hairPatternChanged = previous.hair_pattern.toLowerCase() !== current.hair_pattern.toLowerCase();
    const colorChanged = previous.color.toLowerCase() !== current.color.toLowerCase();
    const outcome = sameVisibleQuality ? 'similar' : providerOutcome;
    const descriptiveChangeSummary = hairPatternChanged
      ? 'Your latest Hair Analysis detected a different visible Hair Pattern, while the overall visible-condition findings remain similar.'
      : colorChanged
        ? 'Your latest Hair Analysis detected a different visible hair color, while the overall visible-condition findings remain similar.'
        : 'Your latest Hair Analysis appears generally consistent with your previous result, with no major new visible changes.';
    const summary = (sameVisibleQuality
      ? descriptiveChangeSummary
      : replaceLegacyPatternTerms(normalizeString(source.summary)))
      || 'Your two latest Hair Analysis results are saved, but there is not enough comparable visible detail for a progress summary.';
    const details = {
      notable_changes: normalizeStringArray(source.notable_changes).map(replaceLegacyPatternTerms),
      previous,
      latest: current,
    };

    const updateResult = await supabase
      .from('Hair_Analysis_Comparisons')
      .update({
        Comparison_Type: outcome,
        Comparison_Summary: summary,
        Comparison_Details: details,
        Model: normalizeString(providerResult.diagnostics?.provider_model) || model,
        Generation_Status: 'completed',
      })
      .eq('Comparison_ID', reservation.data.Comparison_ID)
      .select(comparisonSelect)
      .single();
    if (updateResult.error || !updateResult.data) {
      return createJsonResponse({ error: 'The generated Hair Analysis comparison could not be saved.' }, 500);
    }
    return createJsonResponse({ comparison: normalizeCachedComparison(updateResult.data), cached: false });
  } catch (error) {
    console.error('[compare-hair-analyses]', error);
    const failureSummary = 'Your two latest Hair Analysis results are saved, but a progress summary is unavailable right now.';
    const failedResult = await supabase
      .from('Hair_Analysis_Comparisons')
      .update({
        Comparison_Summary: failureSummary,
        Comparison_Details: { previous, latest: current },
        Generation_Status: 'failed',
      })
      .eq('Comparison_ID', reservation.data.Comparison_ID)
      .select(comparisonSelect)
      .single();
    return createJsonResponse({
      comparison: failedResult.data ? normalizeCachedComparison(failedResult.data) : null,
      cached: false,
    });
  }
});
