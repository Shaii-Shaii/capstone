import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/google-ai.ts';

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    analysis: {
      type: 'object',
      additionalProperties: false,
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
            additionalProperties: false,
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
          type: ['number', 'null'],
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
          type: ['number', 'null'],
        },
        decision: {
          type: 'string',
        },
        summary: {
          type: 'string',
        },
        length_assessment: {
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
            additionalProperties: false,
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
        'length_assessment',
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

type CorrectedDetailsContext = {
  length_value?: number | null;
  length_unit?: string;
  normalized_length_cm?: number | null;
  texture?: string;
  density?: string;
};

type HistoryContextEntry = {
  created_at?: string;
  detected_condition?: string;
  decision?: string;
  summary?: string;
  estimated_length?: number | null;
  recommendations?: {
    title?: string;
    recommendation_text?: string;
    priority_order?: number | null;
  }[];
};

type HistoryContext = {
  total_checks?: number | null;
  latest_condition?: string;
  latest_check_at?: string;
  latest_result?: HistoryContextEntry | null;
  latest_recommendations?: {
    title?: string;
    recommendation_text?: string;
    priority_order?: number | null;
  }[];
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

const analysisInstructions = [
  'You are an AI hair analysis assistant for Donivra.',
  'Return valid JSON only.',
  'Return one JSON object only.',
  'Do not use markdown.',
  'Do not wrap the JSON in code fences.',
  'Do not add explanatory text before or after the JSON.',
  'The uploaded hair photos are the primary source of truth. Questionnaire answers are supporting context only.',
  'Analyze the actual uploaded hair photos carefully and let visible evidence drive the result.',
  'The current uploaded photos must determine the current detected_condition, estimated_length, length_assessment, decision, summary, and recommendations.',
  'If corrected_details are provided, treat the corrected hair length, texture, and density as user-confirmed override inputs for this reassessment.',
  'When corrected_details are provided, use them in the final reassessment while still relying on the uploaded photos for the visible condition, damage notes, summary, donation suitability reasoning, and recommendations.',
  'Do not reuse, copy, or paraphrase wording from previous logs as the current result.',
  'If prior history is provided, use it only for comparison and follow-up context. It must not replace what is visible in the current uploaded photos.',
  'Analyze visible hair condition, visible hair assessment, visible hair length estimate, donation suitability, and improvement recommendations.',
  'Be practical, honest, and evidence-based. Do not invent certainty when the image evidence is weak.',
  'Analyze visible clues such as dryness, oiliness, flakes if visible, frizz, roughness, split or damaged ends, shine or dullness, density appearance, texture appearance, scalp visibility, and overall healthy or unhealthy appearance.',
  'Do not give generic repeated recommendations unless the visible evidence truly supports them.',
  'Do not let the final result mainly focus on retaking photos, improving lighting, or capture quality. Mention those only briefly when they materially limit confidence.',
  'You must differentiate different-looking photo sets. If the uploaded images look different, preserve those differences in the condition, summary, length assessment, and recommendations.',
  'Use per_view_notes for factual view-specific observations that describe what is actually visible.',
  'Use visible_damage_notes for a concise note about visible damage, or state that no obvious visible damage is seen when appropriate.',
  'Use detected_condition for the main visible condition. Prefer labels like Healthy, Dry, Oily, Damaged, Mixed Concerns, Frizzy, Dry and Damaged, Dry and Frizzy, or Chemically Treated.',
  'Estimate visible hair length only. Visible hair length means the visible length from the scalp or root area down to the lowest clearly visible hair tip.',
  'Use the front and side views together to judge visible length from root to hair end. Look at whether the hair falls above the shoulder, at shoulder level, below the shoulder, near the chest, or lower.',
  'Look for where the hair visibly starts near the head or scalp and where it visibly ends. Note when the hair is curled, tied, cropped, blocked, or partially hidden.',
  'Return a numeric estimated_length only when a reasonable image-based estimate is possible. Lower confidence honestly if the visible root-to-tip span is unclear.',
  'length_assessment must explain the visual basis for the length estimate using the uploaded views, including whether the ends are fully visible and whether the hair appears likely to meet the 14-inch donation threshold.',
  `Donation suitability must respect the 14-inch rule. Fourteen inches is ${MIN_DONATION_LENGTH_CM} cm.`,
  `Set decision to exactly one of: "${ELIGIBLE_STATUS}" or "${IMPROVE_STATUS}".`,
  `Use "${ELIGIBLE_STATUS}" only when the visible hair length appears at least ${MIN_DONATION_LENGTH_CM} cm from root to tip, the visible condition appears suitable for donation, and the evidence is clear enough for that judgment.`,
  `Use "${IMPROVE_STATUS}" when the visible root-to-tip length appears below ${MIN_DONATION_LENGTH_CM} cm, the visible condition is not suitable, or the evidence is too limited for confident eligibility.`,
  'If the hair looks healthy but too short for donation, still return "Improve hair condition" and tailor recommendations toward healthy growth, length retention, reduced breakage, and maintaining current hair health.',
  'Questionnaire answers should support interpretation for wash frequency, itch, flakes, oiliness, dryness, hair fall, chemical history, and heat use, but they must not replace the photo evidence.',
  'confidence_score must reflect image clarity, visibility of ends and full length, texture and scalp detail, consistency across views, and consistency with the questionnaire.',
  'summary must be concise, human-friendly, and primarily grounded in image-based observations before mentioning supporting questionnaire context.',
  'history_assessment should mention whether the current result appears better, similar, or worse than recent saved checks only when history is provided.',
  'When questionnaire_mode is "returning_follow_up", treat the questionnaire as a progress check. Compare the current photos with the latest saved result and latest recommendations when they are provided.',
  'For returning follow-up checks, use prior recommendations to assess whether the user appears to have followed advice, whether the hair looks improved or worse, and whether new visible issues appeared.',
  'History is secondary context only. Never let prior logs decide the current condition when the new uploaded photos show something different.',
  'recommendations must focus on improving hair condition, maintaining healthy hair, supporting longer healthier growth if the hair is too short, and reducing visible damage.',
  'Recommendations should be specific to the observed condition, such as reducing heat exposure, improving scalp care, adjusting wash routine, improving moisture care, trimming damaged ends when appropriate, and avoiding harsh chemical processing.',
  'Do not repeat generic recommendation wording across different results unless the visible evidence is truly the same.',
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
        title: normalizeString(item?.title),
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
const hasIncompleteCriticalAnalysisFields = (analysis: Record<string, unknown>) => {
  const summary = normalizeString(analysis?.summary);
  const detectedCondition = normalizeString(analysis?.detected_condition);
  const lengthAssessment = normalizeString(analysis?.length_assessment);
  const recommendations = normalizeRecommendationsV2(analysis?.recommendations);
  const isHairDetected = analysis?.is_hair_detected !== false;

  if (!summary) return true;
  if (isHairDetected && !detectedCondition) return true;
  if (isHairDetected && !lengthAssessment) return true;
  if (isHairDetected && !recommendations.length) return true;
  return false;
};

const resolveSafeAnalysisError = (error: unknown) => {
  const message = normalizeString(error instanceof Error ? error.message : String(error || ''));
  const technicalMessage = message.toLowerCase();
  const diagnostics = (error as {
    diagnostics?: {
      provider_response_status?: number | null;
      provider_retry_exhausted?: boolean;
      provider_error_type?: string;
      retry_after_seconds?: number | null;
    };
  })?.diagnostics;

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
    diagnostics?.provider_error_type === 'quota_exceeded'
    || technicalMessage.includes('quota exceeded')
    || technicalMessage.includes('free tier request limit')
    || technicalMessage.includes('rate limit')
  ) {
    const retryAfterSeconds = Number(diagnostics?.retry_after_seconds);
    console.warn('[analyze-hair-submission] quota or rate-limit error detected', {
      providerResponseStatus: diagnostics?.provider_response_status ?? null,
      providerErrorType: diagnostics?.provider_error_type || 'unknown',
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
    });

    return {
      status: 429,
      message: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? `Cannot analyze hair, please try again in ${retryAfterSeconds} seconds.`
        : 'Cannot analyze hair right now. Please try again later.',
    };
  }

  if (
    diagnostics?.provider_retry_exhausted
    || diagnostics?.provider_response_status === 429
    || diagnostics?.provider_response_status === 503
    || technicalMessage.includes('high demand')
    || technicalMessage.includes('temporarily busy')
    || technicalMessage.includes('temporarily unavailable')
    || technicalMessage.includes('retry later')
    || technicalMessage.includes('service unavailable')
    || technicalMessage.includes('resource exhausted')
  ) {
    return {
      status: 503,
      message: 'Hair analysis is temporarily busy right now. Please try again in a moment.',
    };
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
  ].join('\n');
};

const formatCorrectedDetailsContext = (correctedDetails: CorrectedDetailsContext | null) => {
  if (!correctedDetails) {
    return 'No user-corrected hair details were provided for this analysis pass.';
  }

  return [
    `corrected_length_value: ${correctedDetails.length_value ?? 'not provided'}`,
    `corrected_length_unit: ${normalizeString(correctedDetails.length_unit) || 'not provided'}`,
    `corrected_length_cm: ${normalizeNumber(correctedDetails.normalized_length_cm) ?? 'not provided'}`,
    `corrected_texture: ${normalizeString(correctedDetails.texture) || 'not provided'}`,
    `corrected_density: ${normalizeString(correctedDetails.density) || 'not provided'}`,
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
    historyContext.latest_result
      ? `latest_result: created_at=${normalizeString(historyContext.latest_result.created_at) || 'not provided'} | condition=${normalizeString(historyContext.latest_result.detected_condition) || 'not provided'} | decision=${normalizeString(historyContext.latest_result.decision) || 'not provided'} | estimated_length=${normalizeNumber(historyContext.latest_result.estimated_length) ?? 'not provided'}`
      : 'latest_result: not provided',
    Array.isArray(historyContext.latest_recommendations) && historyContext.latest_recommendations.length
      ? [
          'latest_recommendations:',
          ...historyContext.latest_recommendations.slice(0, 4).map((recommendation, index) => (
            `- ${index + 1}. title=${normalizeString(recommendation.title) || 'not provided'} | recommendation=${normalizeString(recommendation.recommendation_text) || 'not provided'} | priority=${normalizeNumber(recommendation.priority_order) ?? 'not provided'}`
          )),
        ].join('\n')
      : 'latest_recommendations: not provided',
    'Recent checks for trend comparison only:',
    ...historyContext.entries.slice(0, 6).map((entry, index) => (
      `${index + 1}. created_at=${normalizeString(entry.created_at) || 'not provided'} | condition=${normalizeString(entry.detected_condition) || 'not provided'} | decision=${normalizeString(entry.decision) || 'not provided'} | estimated_length=${normalizeNumber(entry.estimated_length) ?? 'not provided'}${Array.isArray(entry.recommendations) && entry.recommendations.length ? ` | recommendations=${entry.recommendations.map((recommendation) => normalizeString(recommendation.title) || normalizeString(recommendation.recommendation_text)).filter(Boolean).slice(0, 3).join('; ')}` : ''}`
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

const normalizeAnalysisPayload = (
  analysis: Record<string, unknown>,
  providedViews: string[],
  concernType: string,
  requirementContext: DonationRequirementContext | null,
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
  const lengthAssessment = normalizeString(analysis?.length_assessment);
  const donationReadinessNote = normalizeString(analysis?.donation_readiness_note);
  const historyAssessment = normalizeString(analysis?.history_assessment);
  const normalizedRecommendations = normalizeRecommendationsV2(analysis?.recommendations);
  const decision = normalizeString(analysis?.decision);

  if (isHairDetected && !detectedCondition) {
    throw new Error('Google AI returned an incomplete hair condition result.');
  }

  if (isHairDetected && !lengthAssessment) {
    throw new Error('Google AI returned no usable image-based hair length assessment.');
  }

  if (isHairDetected && !normalizedRecommendations.length) {
    throw new Error('Google AI returned no usable hair-care recommendations.');
  }

  const summary = normalizeString(analysis?.summary);

  if (!summary) {
    throw new Error('Google AI returned no usable assessment summary.');
  }

  if (decision !== ELIGIBLE_STATUS && decision !== IMPROVE_STATUS) {
    throw new Error('Google AI returned an unsupported donation decision.');
  }

  console.info('[analyze-hair-submission] normalized ai field origin', {
    concernType,
    providedViews,
    usedAiSummary: Boolean(summary),
    usedAiCondition: Boolean(detectedCondition),
    usedAiTexture: Boolean(detectedTexture),
    usedAiDensity: Boolean(detectedDensity),
    usedAiLengthEstimate: estimatedLength != null,
    usedAiLengthAssessment: Boolean(lengthAssessment),
    usedAiRecommendations: normalizedRecommendations.length,
    usedAiDonationReadinessNote: Boolean(donationReadinessNote),
    usedAiHistoryAssessment: Boolean(historyAssessment),
    confidenceScore,
    decision,
    minimumDonationLengthCm,
    likelyMeetsDonationLengthThreshold: estimatedLength != null ? estimatedLength >= minimumDonationLengthCm : null,
    conditionAcceptableByRule: isDonationConditionAcceptable(detectedCondition, visibleDamageNotes),
    missingViews,
  });

  return {
    is_hair_detected: isHairDetected,
    invalid_image_reason: invalidImageReason,
    missing_views: missingViews,
    per_view_notes: normalizedViewNotes,
    estimated_length: estimatedLength,
    detected_texture: detectedTexture,
    detected_density: detectedDensity,
    detected_condition: detectedCondition,
    visible_damage_notes: visibleDamageNotes,
    confidence_score: confidenceScore,
    decision,
    summary,
    length_assessment: lengthAssessment,
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
    const correctedDetails = body?.corrected_details && typeof body.corrected_details === 'object'
      ? body.corrected_details as CorrectedDetailsContext
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
      hasCorrectedDetails: Boolean(correctedDetails),
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
    console.info('[analyze-hair-submission] image payload validation', {
      imageDetails: validImages.map((image, index) => ({
        index: index + 1,
        view: normalizeViewLabel(image.viewLabel || image.viewKey) || `Photo ${index + 1}`,
        mimeType: extractMimeTypeFromDataUrl(String(image.dataUrl || '')) || normalizeString(image.mimeType) || 'unknown',
        hasDataUrl: typeof image?.dataUrl === 'string' && image.dataUrl.startsWith('data:'),
        base64Length: extractBase64Payload(String(image.dataUrl || '')).length,
      })),
    });

    const userContent = [
      {
        type: 'input_text',
        text: [
          '=== HAIR ANALYSIS REQUEST ===',
          `concern_type: ${concernType}`,
          `questionnaire_mode: ${normalizeString(questionnaireAnswers?.questionnaire_mode) || 'first_time'}`,
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
          '- Visible length: where the hair starts near the head/root area, where the visible hair ends, and whether the hair falls above the shoulder, at the shoulder, below the shoulder, near the chest, or lower',
          'Use per_view_notes to record what you observe in each view.',
          '',
          '=== STEP 2: STRUCTURED QUESTIONNAIRE CONTEXT (supporting only) ===',
          'Use questionnaire answers as supporting context — not the primary basis for the result.',
          'If the photos clearly contradict the questionnaire, trust the photos.',
          formatQuestionnaireAnswers(questionnaireAnswers),
          '',
          '=== STEP 3: PRIOR HAIR-CHECK HISTORY ===',
          normalizeString(questionnaireAnswers?.questionnaire_mode) === 'returning_follow_up'
            ? formatHistoryContext(historyContext)
            : 'Ignore prior hair-check history for the current analysis result. Treat this as a fresh photo-based analysis.',
          normalizeString(questionnaireAnswers?.questionnaire_mode) === 'returning_follow_up'
            ? 'Returning-user follow-up instruction: compare the current photos and answers against the latest saved result and recommendations only for follow-up context. The current detected condition, length, decision, summary, and recommendations must still come from the new uploaded photos.'
            : 'First-time instruction: treat this as a baseline hair check and focus on the current photos plus the full intake answers.',
          '',
          '=== STEP 4: USER-CORRECTED DETAILS ===',
          formatCorrectedDetailsContext(correctedDetails),
          correctedDetails
            ? 'Use the corrected hair length, texture, and density as confirmed inputs for this reassessment. Do not let them manually replace the final result; instead, use them to produce an updated AI assessment and recommendation.'
            : 'No corrected details were provided, so use the photo-based detection normally.',
          '',
          '=== STEP 5: DONATION REQUIREMENT CONTEXT ===',
          formatRequirementContext(donationRequirementContext),
          '',
          '=== STEP 6: PREVIOUS SUBMISSION CONTEXT ===',
          formatSubmissionContext(submissionContext),
          '',
          '=== STEP 7: GENERATE RESULT ===',
          'Based on what you see in the photos and the supporting questionnaire context:',
          '1. detected_condition — the most prominent visible condition label',
          '2. estimated_length — your numeric visible root-to-tip length estimate in centimeters when reasonably supported by the images',
          '3. length_assessment — explain the visible basis for the length estimate, including whether the ends are fully visible and whether the hair appears likely to meet the 14-inch threshold',
          '4. summary — 2-3 sentences about what the photos show and what is recommended. Be specific about visible characteristics.',
          '5. recommendations — 3 items, each SPECIFIC to the visible detected_condition. Do NOT give generic advice. Tailor each recommendation to what you see.',
          '6. decision — based on photo evidence and requirement context',
          '7. visible_damage_notes — factual description of what photos show about ends and scalp',
          'Expected views present: Front View Photo, Side Profile Photo, Hair Ends Close-Up.',
          `Visible length must be treated as visible hair only from root to visible tip, and the 14-inch rule means at least ${MIN_DONATION_LENGTH_CM} cm of visible length.`,
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
      imageLabels: validImages.map((image, index) => normalizeViewLabel(image.viewLabel || image.viewKey) || `Photo ${index + 1}`),
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
              inline_data: {
                mime_type: mimeType,
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
      provider_endpoint: '',
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
    console.info('[analyze-hair-submission] raw ai analysis field presence', {
      concernType,
      hasSummary: Boolean(normalizeString(rawAnalysis?.summary)),
      hasLengthAssessment: Boolean(normalizeString(rawAnalysis?.length_assessment)),
      hasDetectedCondition: Boolean(normalizeString(rawAnalysis?.detected_condition)),
      hasDetectedTexture: Boolean(normalizeString(rawAnalysis?.detected_texture)),
      hasDetectedDensity: Boolean(normalizeString(rawAnalysis?.detected_density)),
      hasVisibleDamageNotes: Boolean(normalizeString(rawAnalysis?.visible_damage_notes)),
      hasEstimatedLength: normalizeNumber(rawAnalysis?.estimated_length) != null,
      recommendationCount: normalizeRecommendationsV2(rawAnalysis?.recommendations).length,
      perViewNoteCount: Array.isArray(rawAnalysis?.per_view_notes) ? rawAnalysis.per_view_notes.length : 0,
    });

    if (hasIncompleteCriticalAnalysisFields(rawAnalysis)) {
      console.error('[analyze-hair-submission] incomplete ai analysis from gemini', {
        concernType,
        hasSummary: Boolean(normalizeString(rawAnalysis?.summary)),
        hasLengthAssessment: Boolean(normalizeString(rawAnalysis?.length_assessment)),
        hasDetectedCondition: Boolean(normalizeString(rawAnalysis?.detected_condition)),
        recommendationCount: normalizeRecommendationsV2(rawAnalysis?.recommendations).length,
      });
      throw new Error('Google AI returned incomplete hair analysis fields.');
    }

    const analysis = normalizeAnalysisPayload(
      rawAnalysis,
      Array.from(providedViews),
      concernType,
      donationRequirementContext,
    );

    console.info('[analyze-hair-submission] google ai result ready', {
      concernType,
      hasAnalysis: Boolean(analysis),
      isHairDetected: analysis?.is_hair_detected ?? null,
      missingViews: Array.isArray(analysis?.missing_views) ? analysis.missing_views : [],
      decision: analysis?.decision || '',
      estimatedLength: analysis?.estimated_length ?? null,
      hasLengthAssessment: Boolean(analysis?.length_assessment),
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
