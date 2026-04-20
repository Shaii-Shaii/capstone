import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/google-ai.ts';

const analysisSchema = {
  type: 'object',
  properties: {
    analysis: {
      type: 'object',
      properties: {
        is_hair_detected: {
          type: 'boolean',
        },
        invalid_image_reason: {
          type: 'string',
        },
        missing_views: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        per_view_notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              view: {
                type: 'string',
              },
              clearly_visible: {
                type: 'boolean',
              },
              notes: {
                type: 'string',
              },
            },
            required: ['view', 'clearly_visible', 'notes'],
          },
        },
        estimated_length: {
          type: 'number',
          nullable: true,
        },
        detected_texture: {
          type: 'string',
        },
        detected_density: {
          type: 'string',
        },
        detected_condition: {
          type: 'string',
        },
        visible_damage_notes: {
          type: 'string',
        },
        confidence_score: {
          type: 'number',
          nullable: true,
        },
        decision: {
          type: 'string',
        },
        summary: {
          type: 'string',
        },
        donation_readiness_note: {
          type: 'string',
        },
        history_assessment: {
          type: 'string',
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
              },
              recommendation_text: {
                type: 'string',
              },
              priority_order: {
                type: 'integer',
              },
            },
            required: ['title', 'recommendation_text', 'priority_order'],
          },
        },
      },
      required: [
        'is_hair_detected',
        'invalid_image_reason',
        'missing_views',
        'per_view_notes',
        'estimated_length',
        'detected_texture',
        'detected_density',
        'detected_condition',
        'visible_damage_notes',
        'confidence_score',
        'decision',
        'summary',
        'donation_readiness_note',
        'history_assessment',
        'recommendations',
      ],
    },
  },
  required: ['analysis'],
};

type HairImage = {
  mimeType?: string;
  dataUrl?: string;
  viewKey?: string;
  viewLabel?: string;
};

type ComplianceContext = {
  acknowledged?: boolean;
};

type DonationRequirementContext = {
  donation_requirement_id?: number | null;
  minimum_hair_length?: number | null;
  chemical_treatment_status?: boolean | null;
  colored_hair_status?: boolean | null;
  bleached_hair_status?: boolean | null;
  rebonded_hair_status?: boolean | null;
  hair_texture_status?: string;
  notes?: string;
};

type SubmissionContext = {
  submission_id?: number | null;
  donation_drive_id?: number | null;
  organization_id?: number | null;
  detail_id?: number | null;
  declared_length?: number | null;
  declared_texture?: string;
  declared_density?: string;
  declared_condition?: string;
};

type HistoryContextEntry = {
  created_at?: string;
  detected_condition?: string;
  decision?: string;
  summary?: string;
  estimated_length?: number | null;
};

type HistoryContext = {
  total_checks?: number | null;
  latest_condition?: string;
  latest_check_at?: string;
  entries?: HistoryContextEntry[];
};

const expectedViews = ['Front View Photo', 'Side Profile Photo', 'Hair Ends Close-Up'];
const MIN_DONATION_LENGTH_CM = 35.56;
const ELIGIBLE_STATUS = 'Eligible for hair donation';
const IMPROVE_STATUS = 'Improve hair condition';
const canonicalViewAliases: Record<string, string> = {
  'front view photo': 'Front View Photo',
  front_view: 'Front View Photo',
  'full hair length photo': 'Front View Photo',
  'side profile photo': 'Side Profile Photo',
  'side view photo': 'Side Profile Photo',
  side_profile: 'Side Profile Photo',
  side_view: 'Side Profile Photo',
  'hair ends close-up': 'Hair Ends Close-Up',
  'photo of the hair ends': 'Hair Ends Close-Up',
  hair_ends_close_up: 'Hair Ends Close-Up',
};

const instructions = [
  // Role and output format
  'You are a hair-condition analyst reviewing donor hair photos for a hair donation mobile app.',
  'Your primary job is to carefully examine each uploaded photo, describe EXACTLY what you observe, then provide tailored recommendations based on those specific observations.',
  'Return valid JSON only — no markdown, no commentary outside the JSON structure.',

  // Image-first analysis mandate — STRENGTHENED
  'CRITICAL RULE 1: The uploaded photos are the PRIMARY and MOST IMPORTANT source of truth. Questionnaire answers are ONLY supporting context.',
  'CRITICAL RULE 2: You MUST describe what you ACTUALLY SEE in the photos. Do not rely on questionnaire answers alone.',
  'CRITICAL RULE 3: Every recommendation MUST be based on VISIBLE observations from the photos, not generic hair care advice.',
  '',
  'OBSERVATION CHECKLIST — examine each photo for:',
  '1. SCALP: Is the scalp visible? Is it oily (shiny, greasy appearance)? Dry (flaky, tight)? Clean? Any visible flaking or buildup?',
  '2. ROOTS: Are the roots oily or dry? Any product buildup visible?',
  '3. HAIR SHAFT: Does the hair look shiny and lustrous, or dull and matte? Any visible frizz along the shaft? Signs of chemical processing (uneven color, texture changes)?',
  '4. TEXTURE: Straight, wavy, curly, coily, or mixed? Is the texture consistent or uneven?',
  '5. DENSITY: How thick does the hair appear? Light, medium, thick, or dense coverage?',
  '6. ENDS: Are the ends split, frayed, or damaged? Do they look dry and rough, or healthy and sealed?',
  '7. OVERALL HEALTH: Does the hair look healthy and well-maintained, or does it show signs of damage, dryness, or neglect?',
  '8. SPECIFIC DAMAGE SIGNS: Breakage, thinning, brittleness, excessive frizz, uneven texture, color damage?',
  '',
  'Your detected_condition, visible_damage_notes, summary, and recommendations MUST directly reflect these observations.',
  'If the questionnaire says "dry hair" but the photos show shiny, healthy hair, trust the photos and note the discrepancy.',
  'If the photos show visible split ends and dryness but the questionnaire says "no problems", trust the photos.',

  // Hair detection and validity
  'First confirm whether the images clearly show human hair intended for screening.',
  'If the images do not clearly show hair, set is_hair_detected to false, explain briefly in invalid_image_reason, and set decision to "Retake Photos".',
  'Only use "Retake Photos" decision when image quality genuinely prevents analysis.',

  // Per-view notes — STRENGTHENED
  'For each provided photo view, write a detailed per_view_notes entry describing WHAT YOU SEE:',
  '- Front View: scalp condition, root oiliness/dryness, overall hair appearance, texture, density',
  '- Side Profile: hair length visibility, shaft condition, shine or dullness, texture consistency',
  '- Hair Ends Close-Up: ends condition (split/healthy), dryness, damage, fraying',
  'Use missing_views only when a required view is genuinely absent or completely unusable.',

  // Length estimation
  'Estimate hair length in centimeters as a numeric value when the full hair fall from root to ends is visible. Use the Front View Photo and Side Profile Photo together. Return null only if both root and ends are blocked or cropped.',

  // Detected fields — OBSERVATION-BASED
  'detected_texture: use Straight, Wavy, Curly, Coily, or Mixed — based ONLY on what you see in the photos.',
  'detected_density: use Light, Medium, Thick, or Dense — based ONLY on what you see in the photos.',
  'detected_condition: use one precise label based on the MOST PROMINENT VISIBLE condition you observe:',
  '  - Healthy: shiny, lustrous, no visible damage, sealed ends, good scalp condition',
  '  - Dry: dull appearance, rough texture, lack of shine, dry-looking ends',
  '  - Frizzy: visible frizz along shaft, flyaways, uneven texture',
  '  - Damaged: visible breakage, split ends, frayed ends, brittle appearance',
  '  - Oily: shiny/greasy scalp, oily roots, limp appearance near scalp',
  '  - Chemically Treated: uneven color, texture changes, processing signs',
  '  - Dry and Frizzy: combination of dullness and frizz',
  '  - Dry and Damaged: combination of dryness and visible damage',
  'Do NOT default to "Needs Better Photos" unless the image quality truly prevents observation.',
  'confidence_score: decimal 0–1 reflecting how clearly the photos allowed detailed observation.',

  // visible_damage_notes — OBSERVATION-BASED
  'visible_damage_notes: describe EXACTLY what you observe in the photos:',
  '- If you see split ends, say "visible split ends observed in close-up view"',
  '- If you see oily scalp, say "scalp appears oily with visible shine at roots"',
  '- If you see dryness, say "hair shaft appears dull with lack of natural shine"',
  '- If you see healthy hair, say "hair appears healthy with good shine and sealed ends"',
  'Be specific and factual. This field should read like observation notes, not generic statements.',

  // Summary — OBSERVATION-BASED
  'summary: write 2–3 sentences that:',
  '1. Start with what you OBSERVE in the photos (e.g., "The uploaded photos show hair with visible shine and healthy-looking ends...")',
  '2. Mention specific visible characteristics (texture, scalp condition, ends condition, shine/dullness)',
  '3. Connect observations to the detected condition',
  '4. End with "Final screening requires manual review."',
  'Example: "The uploaded photos show wavy hair with medium density and visible shine along the shaft. The ends appear mostly healthy with minimal splitting. The scalp looks clean without visible oiliness or flaking. This check suggests the hair is in good condition. Final screening requires manual review."',

  // Recommendations — MOST CRITICAL SECTION
  'recommendations: provide exactly 3 recommendations that are DIRECTLY TIED to your observations.',
  '',
  'CRITICAL: Each recommendation MUST be SPECIFIC to what you OBSERVED in the photos.',
  'DO NOT give generic hair care advice. DO NOT repeat the same recommendations for different hair conditions.',
  '',
  'RECOMMENDATION GENERATION RULES:',
  '1. If you observed OILY SCALP → recommend scalp-control shampoo, washing technique, avoiding heavy products on scalp',
  '2. If you observed DRY HAIR/DULL APPEARANCE → recommend deep conditioning, moisturizing products, reducing wash frequency',
  '3. If you observed SPLIT/DAMAGED ENDS → recommend trimming ends, protein treatments, reducing heat',
  '4. If you observed FRIZZ → recommend anti-frizz products, microfiber towel, humidity protection',
  '5. If you observed HEALTHY HAIR → recommend maintenance routine, protective measures, monthly treatments',
  '6. If you observed CHEMICAL DAMAGE → recommend color-safe products, protein-moisture balance, recovery treatments',
  '7. If you observed SCALP FLAKING → recommend anti-dandruff products, scalp exfoliation, gentle cleansing',
  '',
  'Each recommendation must have:',
  '- title: short, specific label (e.g., "Address Visible Split Ends" not "Hair Care")',
  '- recommendation_text: 2–3 actionable sentences explaining WHAT to do and WHY based on what you observed',
  '- priority_order: 1 = most urgent based on severity of observed issue',
  '',
  'BAD EXAMPLE (generic): "Use a good conditioner to keep your hair healthy."',
  'GOOD EXAMPLE (observation-based): "The close-up view shows visible split ends and fraying. Trim 1-2 cm of the ends to remove damaged portions and prevent further splitting up the hair shaft."',

  // Decision
  'decision: set to one of: Eligible, Needs Review, Not Yet Eligible, or Retake Photos.',
  'Base this on: (1) visible evidence from photos, (2) donation requirement context if provided, (3) observed hair condition.',
  'Use "Retake Photos" ONLY when image quality prevents observation, not as a default.',

  // donation_readiness_note
  'donation_readiness_note: include only when the observed hair length and condition suggest donation readiness.',
  'Base this on what you observe in the photos, not just the questionnaire.',
  'If the hair looks too short, damaged, or not ready, explain why based on observations.',

  // history_assessment — STRENGTHENED
  'history_assessment: if 2 or more prior hair-check entries are provided:',
  '- Compare the current observed condition to the most recent prior condition',
  '- State whether the hair appears to be improving, similar, or declining',
  '- Be specific: "Compared to the last check, the hair now shows less visible dryness and improved shine."',
  '- If less than 2 prior entries, return an empty string.',

  // Safety and accuracy
  'Use safe wording: "this check suggests", "based on the visible photos", "the photos show", "observed in the images".',
  'Do not diagnose medical conditions. Do not invent characteristics not visible in the images.',
  'If a field cannot be determined from the photos, return an empty string or null.',
  'This is AI-assisted screening guidance only, not medical advice.',
].join('\n');

const analysisInstructions = [
  'You are an AI hair analysis assistant for Donivra.',
  'Return valid JSON only.',
  'Return one JSON object only.',
  'Do not use markdown.',
  'Do not wrap the JSON in code fences.',
  'Do not add explanatory text before or after the JSON.',
  'Use the uploaded or captured hair photos as a major basis for the result. Use the questionnaire only as supporting context, not the main basis.',
  'Analyze visible hair condition, visible hair assessment, visible hair length estimate, donation suitability, and improvement recommendations.',
  'Be practical, honest, and evidence-based. Do not invent certainty when the image evidence is weak.',
  'Analyze visible clues such as dryness, oiliness, flakes if visible, frizz, roughness, split or damaged ends, shine or dullness, density appearance, texture appearance, scalp visibility, and overall healthy or unhealthy appearance.',
  'Do not give generic repeated recommendations unless the visible evidence truly supports them.',
  'Do not let the final result mainly focus on retaking photos, improving lighting, or capture quality. Mention those only briefly when they materially limit confidence.',
  'Use per_view_notes for factual view-specific observations that describe what is actually visible.',
  'Use visible_damage_notes for a concise note about visible damage, or state that no obvious visible damage is seen when appropriate.',
  'Use detected_condition for the main visible condition. Prefer labels like Healthy, Dry, Oily, Damaged, Mixed Concerns, Frizzy, Dry and Damaged, Dry and Frizzy, or Chemically Treated.',
  'Estimate visible hair length only. Visible hair length means the visible length from the scalp or head area to the lowest clearly visible hair tip.',
  'Do not invent fake precision when the hair is curled, tied, blocked, cropped, blurry, or lacks reliable scale. Return null when a numeric estimate is not reasonably supported.',
  `Donation suitability must respect the 14-inch rule. Fourteen inches is ${MIN_DONATION_LENGTH_CM} cm.`,
  `Set decision to exactly one of: "${ELIGIBLE_STATUS}" or "${IMPROVE_STATUS}".`,
  `Use "${ELIGIBLE_STATUS}" only when the visible hair length appears at least ${MIN_DONATION_LENGTH_CM} cm, the visible condition appears suitable for donation, and the evidence is clear enough for that judgment.`,
  `Use "${IMPROVE_STATUS}" when the visible length appears below ${MIN_DONATION_LENGTH_CM} cm, the visible condition is not suitable, or the evidence is too limited for confident eligibility.`,
  'If the hair looks healthy but too short for donation, still return "Improve hair condition" and tailor recommendations toward healthy growth, length retention, reduced breakage, and maintaining current hair health.',
  'Questionnaire answers should support interpretation for wash frequency, itch, flakes, oiliness, dryness, hair fall, chemical history, and heat use, but they must not replace the photo evidence.',
  'confidence_score must reflect image clarity, visibility of ends and full length, texture and scalp detail, consistency across views, and consistency with the questionnaire.',
  'summary must be concise, human-friendly, and combine image-based observations, questionnaire context, and the final combined assessment.',
  'history_assessment should mention whether the current result appears better, similar, or worse than recent saved checks only when history is provided.',
  'recommendations must focus on improving hair condition, maintaining healthy hair, supporting longer healthier growth if the hair is too short, and reducing visible damage.',
  'Recommendations should be specific to the observed condition, such as reducing heat exposure, improving scalp care, adjusting wash routine, improving moisture care, trimming damaged ends when appropriate, and avoiding harsh chemical processing.',
  'Do not diagnose disease. Use careful phrases such as "the photos show", "this check suggests", and "based on the visible images".',
].join('\n');


const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeViewLabel = (value: unknown) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return '';
  return canonicalViewAliases[normalized] || normalizeString(value);
};

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractBase64Payload = (dataUrl: string) => {
  const normalized = normalizeString(dataUrl);
  if (!normalized.startsWith('data:')) return '';
  const commaIndex = normalized.indexOf(',');
  if (commaIndex < 0) return '';
  return normalized.slice(commaIndex + 1).replace(/\s+/g, '');
};

const extractMimeTypeFromDataUrl = (dataUrl: string) => {
  const normalized = normalizeString(dataUrl);
  const match = normalized.match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || '';
};

const normalizeConfidence = (value: unknown) => {
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  if (parsed > 1 && parsed <= 100) return Math.max(0, Math.min(1, parsed / 100));
  return Math.max(0, Math.min(1, parsed));
};

const normalizeMissingViews = (source: unknown) => {
  const list = Array.isArray(source)
    ? source.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const seen = new Set<string>();

  return list.filter((item) => {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const normalizeRecommendationsV2 = (source: unknown) => {
  const rows = Array.isArray(source)
    ? source
      .map((item, index) => ({
        title: normalizeString(item?.title) || `Recommendation ${index + 1}`,
        recommendation_text: normalizeString(item?.recommendation_text),
        priority_order: Number.isFinite(Number(item?.priority_order)) && Number(item?.priority_order) > 0
          ? Number(item?.priority_order)
          : index + 1,
      }))
      .filter((item) => item.recommendation_text)
      .sort((left, right) => left.priority_order - right.priority_order)
    : [];

  return rows.slice(0, 3);
};

const buildSummaryFromAnalysisFields = ({
  isHairDetected,
  invalidImageReason,
  missingViews,
  detectedTexture,
  detectedDensity,
  detectedCondition,
  visibleDamageNotes,
  decision,
}: {
  isHairDetected: boolean;
  invalidImageReason: string;
  missingViews: string[];
  detectedTexture: string;
  detectedDensity: string;
  detectedCondition: string;
  visibleDamageNotes: string;
  decision: string;
}) => {
  if (!isHairDetected) {
    return invalidImageReason || 'The uploaded photos did not show enough visible hair for a reliable image-based result. Final screening requires manual review.';
  }

  if (missingViews.length) {
    return `The current photos allow only a partial hair check because these required views are missing or unclear: ${missingViews.join(', ')}. Final screening requires manual review.`;
  }

  const observationParts = [
    detectedTexture ? `${detectedTexture.toLowerCase()} hair` : 'visible hair',
    detectedDensity ? `with ${detectedDensity.toLowerCase()} density` : '',
    detectedCondition ? `showing a ${detectedCondition.toLowerCase()} condition` : '',
  ].filter(Boolean);

  const notesPart = visibleDamageNotes
    ? `${visibleDamageNotes.charAt(0).toUpperCase()}${visibleDamageNotes.slice(1)}.`
    : '';

  const decisionPart = decision === ELIGIBLE_STATUS
    ? 'This check suggests the visible condition and length may be suitable for donation.'
    : 'This check suggests the hair still needs improvement before donation readiness.';

  return `${observationParts.join(' ')}. ${notesPart} ${decisionPart} Final screening requires manual review.`
    .replace(/\s+/g, ' ')
    .trim();
};

const hasIncompleteCriticalAnalysisFields = (analysis: Record<string, unknown>) => {
  const summary = normalizeString(analysis?.summary);
  const detectedCondition = normalizeString(analysis?.detected_condition);
  const recommendations = normalizeRecommendationsV2(analysis?.recommendations);
  const isHairDetected = analysis?.is_hair_detected !== false;

  if (!summary) return true;
  if (isHairDetected && !detectedCondition) return true;
  if (isHairDetected && !recommendations.length) return true;
  return false;
};

const repairIncompleteAnalysis = async ({
  partialAnalysis,
  concernType,
  questionnaireAnswers,
  requirementContext,
  historyContext,
  providedViews,
}: {
  partialAnalysis: Record<string, unknown>;
  concernType: string;
  questionnaireAnswers: Record<string, unknown>;
  requirementContext: DonationRequirementContext | null;
  historyContext: HistoryContext | null;
  providedViews: string[];
}) => {
  console.info('[analyze-hair-submission] repair pass started', {
    concernType,
    providedViews,
    partialKeys: Object.keys(partialAnalysis || {}),
  });

  const repaired = await createStructuredResponse({
    model: 'gemini-2.5-flash',
    responseJsonSchema: analysisSchema,
    maxOutputTokens: 1400,
    temperature: 0.15,
    systemInstruction: [
      'You repair incomplete structured hair-analysis JSON for Donivra.',
      'Return one JSON object only.',
      'Do not use markdown.',
      'Do not use code fences.',
      'Do not add explanation before or after the JSON.',
      'Preserve all valid existing fields when possible.',
      'Fill any missing or empty critical fields, especially summary, detected_condition, and recommendations.',
      'Recommendations must remain specific to the observed condition and not generic.',
      'Summary must be concise, human-friendly, and aligned with the existing visible findings.',
    ].join('\n'),
    contents: [
      {
        role: 'user',
        parts: [{
          text: [
            'Repair this partial hair analysis so that required structured fields are complete.',
            `concern_type: ${concernType}`,
            `provided_views: ${providedViews.join(', ') || 'not provided'}`,
            '',
            'Questionnaire context:',
            formatQuestionnaireAnswers(questionnaireAnswers),
            '',
            'History context:',
            formatHistoryContext(historyContext),
            '',
            'Requirement context:',
            formatRequirementContext(requirementContext),
            '',
            'Partial analysis JSON:',
            JSON.stringify({ analysis: partialAnalysis }),
          ].join('\n'),
        }],
      },
    ],
  });

  return repaired?.analysis || {};
};

const resolveSafeAnalysisError = (error: unknown) => {
  const message = normalizeString(error instanceof Error ? error.message : String(error || ''));
  const technicalMessage = message.toLowerCase();

  if (!message) {
    return {
      status: 500,
      message: 'We could not analyze the hair photos right now. Please try again.',
    };
  }

  if (
    technicalMessage.includes('guided donation questions')
    || technicalMessage.includes('guided hair questions')
    || technicalMessage.includes('compliance checklist')
    || technicalMessage.includes('required hair views')
    || technicalMessage.includes('clear hair photo')
    || technicalMessage.includes('no valid image payload')
  ) {
    return { status: 422, message };
  }

  if (
    technicalMessage.includes('too large')
    || technicalMessage.includes('maximum context length')
    || technicalMessage.includes('request entity too large')
    || technicalMessage.includes('413')
  ) {
    return {
      status: 422,
      message: 'The uploaded photos are too large for analysis right now. Please retake or upload clearer but smaller images.',
    };
  }

  if (
    technicalMessage.includes('unsupported image')
    || technicalMessage.includes('invalid image')
    || technicalMessage.includes('does not represent a valid image')
    || technicalMessage.includes('image parse')
    || technicalMessage.includes('image_url')
  ) {
    return {
      status: 422,
      message: 'One of the uploaded photos could not be processed for AI analysis. Please retake or upload that view again.',
    };
  }

  return {
    status: 500,
    message,
  };
};

const formatRequirementContext = (requirementContext: DonationRequirementContext | null) => {
  if (!requirementContext) {
    return 'No donation requirement context was available for this screening.';
  }

  return [
    `donation_requirement_id: ${requirementContext.donation_requirement_id ?? 'not provided'}`,
    `minimum_hair_length_cm: ${requirementContext.minimum_hair_length ?? 'not provided'}`,
    `chemical_treatment_allowed: ${requirementContext.chemical_treatment_status ?? 'unknown'}`,
    `colored_hair_allowed: ${requirementContext.colored_hair_status ?? 'unknown'}`,
    `bleached_hair_allowed: ${requirementContext.bleached_hair_status ?? 'unknown'}`,
    `rebonded_hair_allowed: ${requirementContext.rebonded_hair_status ?? 'unknown'}`,
    `hair_texture_status: ${normalizeString(requirementContext.hair_texture_status) || 'not provided'}`,
    `notes: ${normalizeString(requirementContext.notes) || 'not provided'}`,
  ].join('\n');
};

const formatSubmissionContext = (submissionContext: SubmissionContext | null) => {
  if (!submissionContext?.submission_id) {
    return 'No prior submission context was provided.';
  }

  return [
    `submission_id: ${submissionContext.submission_id}`,
    `donation_drive_id: ${submissionContext.donation_drive_id ?? 'not provided'}`,
    `organization_id: ${submissionContext.organization_id ?? 'not provided'}`,
    `detail_id: ${submissionContext.detail_id ?? 'not provided'}`,
    `declared_length: ${submissionContext.declared_length ?? 'not provided'}`,
    `declared_texture: ${normalizeString(submissionContext.declared_texture) || 'not provided'}`,
    `declared_density: ${normalizeString(submissionContext.declared_density) || 'not provided'}`,
    `declared_condition: ${normalizeString(submissionContext.declared_condition) || 'not provided'}`,
  ].join('\n');
};

const formatHistoryContext = (historyContext: HistoryContext | null) => {
  if (!historyContext?.entries?.length) {
    return 'No prior hair-check history was provided.';
  }

  return [
    `total_checks: ${historyContext.total_checks ?? historyContext.entries.length}`,
    `latest_condition: ${normalizeString(historyContext.latest_condition) || 'not provided'}`,
    `latest_check_at: ${normalizeString(historyContext.latest_check_at) || 'not provided'}`,
    'Recent checks:',
    ...historyContext.entries.slice(0, 6).map((entry, index) => (
      `${index + 1}. created_at=${normalizeString(entry.created_at) || 'not provided'} | condition=${normalizeString(entry.detected_condition) || 'not provided'} | decision=${normalizeString(entry.decision) || 'not provided'} | estimated_length=${normalizeNumber(entry.estimated_length) ?? 'not provided'} | summary=${normalizeString(entry.summary) || 'not provided'}`
    )),
  ].join('\n');
};

const formatQuestionnaireAnswers = (answers: Record<string, unknown> = {}) => (
  Object.entries(answers)
    .map(([key, value]) => `${key}: ${value === '' || value === null || value === undefined ? 'not provided' : String(value)}`)
    .join('\n')
);

const isDonationConditionAcceptable = (condition: string, visibleDamageNotes: string) => {
  const normalizedCondition = condition.toLowerCase();
  const normalizedNotes = visibleDamageNotes.toLowerCase();

  if (!normalizedCondition) return false;
  if (normalizedCondition.includes('healthy')) return true;
  if (normalizedCondition.includes('dry') || normalizedCondition.includes('damage') || normalizedCondition.includes('frizz')) return false;
  if (normalizedCondition.includes('oily') || normalizedCondition.includes('treated')) return false;
  if (normalizedNotes.includes('split') || normalizedNotes.includes('fray') || normalizedNotes.includes('breakage')) return false;

  return normalizedCondition.includes('good');
};

const scoreConditionForTrend = (condition: string) => {
  const normalized = condition.toLowerCase();
  if (normalized.includes('healthy') || normalized.includes('good')) return 4;
  if (normalized.includes('oily')) return 3;
  if (normalized.includes('dry') || normalized.includes('frizz')) return 2;
  if (normalized.includes('damage') || normalized.includes('treated')) return 1;
  return 2;
};

const inferHistoryAssessment = (historyContext: HistoryContext | null, currentCondition: string, currentLength: number | null) => {
  if (!historyContext?.entries?.length) return '';

  const latestPrior = historyContext.entries[0];
  if (!latestPrior) return '';

  const priorCondition = normalizeString(latestPrior.detected_condition);
  const priorLength = normalizeNumber(latestPrior.estimated_length);
  const currentScore = scoreConditionForTrend(currentCondition);
  const priorScore = scoreConditionForTrend(priorCondition);

  if (currentScore > priorScore) {
    return 'Compared with your most recent saved check, the current photos suggest better overall hair condition and improved donation readiness.';
  }

  if (currentScore < priorScore) {
    return 'Compared with your most recent saved check, the current photos suggest more visible care needs, so improving condition should come before donation planning.';
  }

  if (currentLength != null && priorLength != null) {
    if (currentLength > priorLength + 1) {
      return 'Compared with your most recent saved check, the condition looks similar but the visible length appears improved.';
    }
    if (currentLength < priorLength - 1) {
      return 'Compared with your most recent saved check, the visible length appears shorter or less clearly retained, so focus on preserving length.';
    }
  }

  return 'Compared with your most recent saved check, the overall appearance looks similar.';
};

const normalizeAnalysisPayload = (
  analysis: Record<string, unknown>,
  providedViews: string[],
  concernType: string,
  requirementContext: DonationRequirementContext | null,
  questionnaireAnswers: Record<string, unknown>,
  historyContext: HistoryContext | null,
) => {
  const isHairDetected = analysis?.is_hair_detected !== false;
  const normalizedMissingViews = normalizeMissingViews(analysis?.missing_views);
  const normalizedViewNotes = Array.isArray(analysis?.per_view_notes)
    ? analysis.per_view_notes
      .map((item) => ({
        view: normalizeString(item?.view),
        clearly_visible: item?.clearly_visible !== false,
        notes: normalizeString(item?.notes),
      }))
      .filter((item) => item.view)
    : [];
  const estimatedLength = normalizeNumber(analysis?.estimated_length);
  const detectedTexture = normalizeString(analysis?.detected_texture);
  const detectedDensity = normalizeString(analysis?.detected_density);
  const detectedCondition = normalizeString(analysis?.detected_condition);
  const invalidImageReason = normalizeString(analysis?.invalid_image_reason);
  const visibleDamageNotes = normalizeString(analysis?.visible_damage_notes);
  const confidenceScore = normalizeConfidence(analysis?.confidence_score);
  const inferredMissingViews = expectedViews.filter((view) => !providedViews.includes(view));
  const missingViews = [...new Set([...inferredMissingViews, ...normalizedMissingViews])];
  const minimumDonationLengthCm = Math.max(
    MIN_DONATION_LENGTH_CM,
    requirementContext?.minimum_hair_length != null ? Number(requirementContext.minimum_hair_length) : 0,
  );
  const donationReadinessNote = normalizeString(analysis?.donation_readiness_note);
  const historyAssessment = normalizeString(analysis?.history_assessment);
  const conditionAcceptable = isDonationConditionAcceptable(detectedCondition, visibleDamageNotes);
  const hasClearEnoughEvidence = isHairDetected && !missingViews.length && (confidenceScore == null || confidenceScore >= 0.35);
  const meetsLengthRule = estimatedLength != null && estimatedLength >= minimumDonationLengthCm;
  const normalizedRecommendations = normalizeRecommendationsV2(analysis?.recommendations);

  let decision = normalizeString(analysis?.decision) === ELIGIBLE_STATUS
    ? ELIGIBLE_STATUS
    : IMPROVE_STATUS;
  if (!hasClearEnoughEvidence || !meetsLengthRule || !conditionAcceptable || concernType === 'donation_eligibility' && normalizeString(analysis?.decision) !== ELIGIBLE_STATUS) {
    decision = IMPROVE_STATUS;
  }

  if (isHairDetected && !detectedCondition) {
    throw new Error('Google AI returned an incomplete hair condition result.');
  }

  if (isHairDetected && !normalizedRecommendations.length) {
    throw new Error('Google AI returned no usable hair-care recommendations.');
  }

  const summary = normalizeString(analysis?.summary) || buildSummaryFromAnalysisFields({
    isHairDetected,
    invalidImageReason,
    missingViews,
    detectedTexture,
    detectedDensity,
    detectedCondition,
    visibleDamageNotes,
    decision,
  });

  return {
    is_hair_detected: isHairDetected,
    invalid_image_reason: invalidImageReason,
    missing_views: missingViews,
    per_view_notes: normalizedViewNotes,
    estimated_length: estimatedLength,
    detected_texture: detectedTexture || (!isHairDetected ? '' : 'Unclear'),
    detected_density: detectedDensity || (!isHairDetected ? '' : 'Unclear'),
    detected_condition: detectedCondition || (!isHairDetected ? 'Low-confidence image review' : 'Mixed Concerns'),
    visible_damage_notes: visibleDamageNotes,
    confidence_score: confidenceScore,
    decision,
    summary,
    donation_readiness_note: donationReadinessNote,
    history_assessment: historyAssessment,
    recommendations: normalizedRecommendations,
  };
};

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await request.json();
    const images = Array.isArray(body?.images) ? body.images.filter(Boolean) as HairImage[] : [];
    const concernType = normalizeString(body?.concern_type) || 'donation_eligibility';
    const questionnaireAnswers = body?.questionnaire_answers && typeof body.questionnaire_answers === 'object'
      ? body.questionnaire_answers as Record<string, unknown>
      : {};
    const donationRequirementContext = body?.donation_requirement_context && typeof body.donation_requirement_context === 'object'
      ? body.donation_requirement_context as DonationRequirementContext
      : null;
    const complianceContext = body?.compliance_context && typeof body.compliance_context === 'object'
      ? body.compliance_context as ComplianceContext
      : null;
    const submissionContext = body?.submission_context && typeof body.submission_context === 'object'
      ? body.submission_context as SubmissionContext
      : null;
    const historyContext = body?.history_context && typeof body.history_context === 'object'
      ? body.history_context as HistoryContext
      : null;

    if (!images.length) {
      return createJsonResponse({ error: 'Please upload at least one clear hair photo before analysis.' }, 400);
    }

    if (!normalizeString(questionnaireAnswers?.screening_intent)) {
      return createJsonResponse({ error: 'Please complete the guided hair questions before analysis.' }, 422);
    }

    if (!complianceContext?.acknowledged) {
      return createJsonResponse({ error: 'Please confirm the photo compliance checklist before analysis.' }, 422);
    }

    const validImages = images.filter((image) => typeof image?.dataUrl === 'string' && image.dataUrl.startsWith('data:'));
    const providedViews = new Set(
      validImages
        .map((image) => normalizeViewLabel(image.viewLabel || image.viewKey))
        .filter(Boolean)
    );
    const missingProvidedViews = expectedViews.filter((view) => !providedViews.has(view));

    if (missingProvidedViews.length) {
      return createJsonResponse({
        error: `Please add these required hair views before analysis: ${missingProvidedViews.join(', ')}.`,
      }, 422);
    }

    console.info('[analyze-hair-submission] invoked', {
      concernType,
      imageCount: images.length,
      validImageCount: validImages.length,
      providedViews: Array.from(providedViews),
      missingProvidedViews,
      hasQuestionnaireAnswers: Boolean(Object.keys(questionnaireAnswers).length),
      hasComplianceContext: Boolean(complianceContext?.acknowledged),
      hasDonationRequirementContext: Boolean(donationRequirementContext),
      hasSubmissionContext: Boolean(submissionContext?.submission_id),
      historyEntryCount: Array.isArray(historyContext?.entries) ? historyContext.entries.length : 0,
      hasGoogleAiApiKey: Boolean(Deno.env.get('GOOGLE_AI_API_KEY')),
    });
    console.info('[analyze-hair-submission] received questionnaire', {
      questionKeyCount: Object.keys(questionnaireAnswers).length,
      screeningIntent: normalizeString(questionnaireAnswers?.screening_intent) || '',
    });
    console.info('[analyze-hair-submission] received images count', {
      imageCount: images.length,
      validImageCount: validImages.length,
      providedViews: Array.from(providedViews),
    });

    const userContent = [
      {
        type: 'input_text',
        text: [
          '=== HAIR ANALYSIS REQUEST ===',
          `concern_type: ${concernType}`,
          `screening_intent: ${normalizeString(questionnaireAnswers?.screening_intent) || 'not provided'}`,
          `photo_compliance_acknowledged: ${complianceContext?.acknowledged === true ? 'yes' : 'no'}`,
          '',
          '=== STEP 1: INSPECT EACH UPLOADED PHOTO ===',
          'Before generating any output, carefully look at each photo for the following visible characteristics:',
          '- Scalp: visible scalp condition, oiliness, dryness, or flaking',
          '- Roots: oily or dry roots, buildup at scalp area',
          '- Hair shaft: shine or luster vs dullness, signs of dryness or chemical processing',
          '- Texture and density: straight/wavy/curly/coily, light/medium/thick/dense',
          '- Ends: split ends, dry or rough ends, healthy ends',
          '- Visible damage: breakage, frizz, thinning, brittleness',
          'Use per_view_notes to record what you observe in each view.',
          '',
          '=== STEP 2: STRUCTURED QUESTIONNAIRE CONTEXT (supporting only) ===',
          'Use questionnaire answers as supporting context — not the primary basis for the result.',
          'If the photos clearly contradict the questionnaire, trust the photos.',
          formatQuestionnaireAnswers(questionnaireAnswers),
          '',
          '=== STEP 3: PRIOR HAIR-CHECK HISTORY ===',
          formatHistoryContext(historyContext),
          '',
          '=== STEP 4: DONATION REQUIREMENT CONTEXT ===',
          formatRequirementContext(donationRequirementContext),
          '',
          '=== STEP 5: PREVIOUS SUBMISSION CONTEXT ===',
          formatSubmissionContext(submissionContext),
          '',
          '=== STEP 6: GENERATE RESULT ===',
          'Based on what you see in the photos and the supporting questionnaire context:',
          '1. detected_condition — the most prominent visible condition label',
          '2. summary — 2-3 sentences about what the photos show and what is recommended. Be specific about visible characteristics.',
          '3. recommendations — 3 items, each SPECIFIC to the visible detected_condition. Do NOT give generic advice. Tailor each recommendation to what you see.',
          '4. decision — based on photo evidence and requirement context',
          '5. visible_damage_notes — factual description of what photos show about ends and scalp',
          'Expected views present: Front View Photo, Side Profile Photo, Hair Ends Close-Up.',
          `Visible length must be treated as visible hair only, and the 14-inch rule means at least ${MIN_DONATION_LENGTH_CM} cm of visible length.`,
          `Use "${ELIGIBLE_STATUS}" only when visible condition appears suitable and visible length appears to meet the 14-inch rule.`,
          `Use "${IMPROVE_STATUS}" when the visible length appears shorter than 14 inches, when condition needs work, or when confidence is too low for a strong eligibility judgment.`,
          'If the hair appears healthy but too short, focus the recommendations on length retention, healthy growth habits, reduced breakage, and maintaining current hair health.',
          'Lower confidence when scale is unclear, the full fall of the hair is not visible, the ends are obscured, or the image is blurry or poorly lit.',
          'Keep the final result focused on hair condition, hair assessment, donation suitability, and practical improvement advice instead of capture instructions.',
        ].join('\n'),
      },
      ...validImages.flatMap((image, index) => ([
        {
          type: 'input_text',
          text: `Image ${index + 1}: ${image.viewLabel || image.viewKey || `Photo ${index + 1}`} — examine this photo carefully for visible scalp condition, hair shine or dullness, texture, density, and ends condition.`,
        },
        {
          type: 'input_image',
          image_url: image.dataUrl,
          detail: 'high',
        },
      ])),
    ];


    if (userContent.length === 1) {
      return createJsonResponse({ error: 'No valid image payload was provided.' }, 400);
    }

    console.info('[analyze-hair-submission] gemini request prepared', {
      model: 'gemini-2.5-flash',
      textPartCount: userContent.filter((item) => item.type === 'input_text').length,
      imagePartCount: userContent.filter((item) => item.type === 'input_image').length,
      hasQuestionnaireAnswers: Boolean(Object.keys(questionnaireAnswers).length),
      historyEntryCount: Array.isArray(historyContext?.entries) ? historyContext.entries.length : 0,
    });

    const providerResult = await createStructuredResponse({
      systemInstruction: analysisInstructions,
      responseJsonSchema: analysisSchema,
      maxOutputTokens: 1600,
      model: 'gemini-2.5-flash',
      includeDiagnostics: true,
      contents: [
        {
          role: 'user',
          parts: userContent.map((item: any) => {
            if (item.type === 'input_text') {
              return { text: item.text };
            }

            const imageUrl = String(item.image_url || '');
            const mimeType = extractMimeTypeFromDataUrl(imageUrl) || 'image/jpeg';
            const imageData = extractBase64Payload(imageUrl);

            return {
              inlineData: {
                mimeType,
                data: imageData,
              },
            };
          }),
        },
      ],
    });
    const result = providerResult?.parsed || {};
    const diagnostics = providerResult?.diagnostics || {
      provider: 'gemini',
      provider_request_attempted: true,
      provider_response_status: null,
      provider_parse_success: false,
      provider_model: 'gemini-2.5-flash',
    };

    console.info('[analyze-hair-submission] gemini response parsed successfully', {
      model: 'gemini-2.5-flash',
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
      hasAnalysisEnvelope: Boolean(result?.analysis),
      providerResponseStatus: diagnostics.provider_response_status,
      providerParseSuccess: diagnostics.provider_parse_success,
    });

    let rawAnalysis = result?.analysis || {};

    if (hasIncompleteCriticalAnalysisFields(rawAnalysis)) {
      console.warn('[analyze-hair-submission] incomplete analysis detected, requesting repair', {
        concernType,
        hasSummary: Boolean(normalizeString(rawAnalysis?.summary)),
        hasDetectedCondition: Boolean(normalizeString(rawAnalysis?.detected_condition)),
        recommendationCount: normalizeRecommendationsV2(rawAnalysis?.recommendations).length,
      });

      rawAnalysis = await repairIncompleteAnalysis({
        partialAnalysis: rawAnalysis,
        concernType,
        questionnaireAnswers,
        requirementContext: donationRequirementContext,
        historyContext,
        providedViews: Array.from(providedViews),
      });
    }

    const analysis = normalizeAnalysisPayload(
      rawAnalysis,
      Array.from(providedViews),
      concernType,
      donationRequirementContext,
      questionnaireAnswers,
      historyContext,
    );

    console.info('[analyze-hair-submission] google ai result ready', {
      concernType,
      hasAnalysis: Boolean(analysis),
      isHairDetected: analysis?.is_hair_detected ?? null,
      missingViews: Array.isArray(analysis?.missing_views) ? analysis.missing_views : [],
      decision: analysis?.decision || '',
      recommendationCount: Array.isArray(analysis?.recommendations) ? analysis.recommendations.length : 0,
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    console.info('[analyze-hair-submission] returning structured result', {
      provider: diagnostics.provider,
      providerRequestAttempted: diagnostics.provider_request_attempted,
      providerResponseStatus: diagnostics.provider_response_status,
      providerParseSuccess: diagnostics.provider_parse_success,
    });

    return createJsonResponse({
      success: true,
      provider: diagnostics.provider,
      edge_function_invoked: true,
      provider_request_attempted: diagnostics.provider_request_attempted,
      provider_response_status: diagnostics.provider_response_status,
      provider_parse_success: diagnostics.provider_parse_success,
      analysis,
    });
  } catch (error) {
    console.error('[analyze-hair-submission]', error);
    const safeError = resolveSafeAnalysisError(error);
    const diagnostics = (error as { diagnostics?: {
      provider?: string;
      provider_request_attempted?: boolean;
      provider_response_status?: number | null;
      provider_parse_success?: boolean;
      provider_error_type?: string;
      retry_after_seconds?: number | null;
    } })?.diagnostics;

    return createJsonResponse({
      error: safeError.message,
      edge_function_invoked: true,
      provider: diagnostics?.provider || 'gemini',
      provider_request_attempted: diagnostics?.provider_request_attempted ?? false,
      provider_response_status: diagnostics?.provider_response_status ?? null,
      provider_parse_success: diagnostics?.provider_parse_success ?? false,
      error_type: diagnostics?.provider_error_type || null,
      retry_after_seconds: diagnostics?.retry_after_seconds ?? null,
    }, safeError.status);
  }
});
