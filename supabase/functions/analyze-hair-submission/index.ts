import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse } from '../_shared/openai.ts';

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

const expectedViews = ['Front View Photo', 'Back View Photo', 'Hair Ends Close-Up', 'Side View Photo'];

const instructions = [
  'You are analyzing donor hair photos for a hair donation mobile app.',
  'Return JSON only.',
  'Use the uploaded hair photos, the structured questionnaire answers, and any provided donation requirement context.',
  'This is AI-assisted screening guidance, not a medical diagnosis.',
  'Use safe wording such as "based on your answers and uploaded photos", "this screening suggests", and "this may indicate".',
  'First decide whether the uploaded images clearly show human hair intended for screening.',
  'If the images do not clearly show hair, set is_hair_detected to false, explain the issue in invalid_image_reason, and set decision to "Retake Photos".',
  'Review each uploaded image using its provided view label and use per_view_notes to explain whether that view is clearly usable.',
  'Use missing_views to list any expected views that are absent or unclear: Front View Photo, Back View Photo, Hair Ends Close-Up, Side View Photo.',
  'Describe only visible hair characteristics from the provided images and the structured questionnaire context.',
  'Do not diagnose medical conditions and do not invent details that are not visible or stated.',
  'If a field is uncertain, return an empty string or null instead of guessing.',
  'estimated_length must be a numeric length estimate when visible. Use the questionnaire length estimate as context, but prefer what is actually visible in the images.',
  'confidence_score must be a decimal between 0 and 1.',
  'detected_texture should use concise values like Straight, Wavy, Curly, Coily, or Mixed.',
  'detected_density should use concise values like Light, Medium, Thick, or Dense.',
  'detected_condition should use concise values like Healthy, Dry, Frizzy, Damaged, Chemically Treated, or Needs Better Photos.',
  'Treat this as donation pre-screening only. Use the screening_intent value to distinguish between an initial donation screening and an eligibility check.',
  'Consider the questionnaire answers, visible hair characteristics, and donation requirement context when setting the decision and recommendations.',
  'If donation requirement context is provided, use it to compare visible eligibility signals such as minimum hair length and whether chemically treated, colored, bleached, or rebonded hair is currently allowed.',
  'Set decision to one short screening status such as Eligible, Needs Review, Retake Photos, or Not Yet Eligible.',
  'Keep summary concise and actionable so the mobile app can show it directly. Always mention that final acceptance still requires manual review.',
  'Recommendations must be short, user-facing, and ordered by priority.',
].join(' ');

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const normalizeRecommendations = (source: unknown, decision: string, summary: string, concernType: string) => {
  const rows = Array.isArray(source)
    ? source
      .map((item, index) => {
        const title = normalizeString(item?.title) || `Recommendation ${index + 1}`;
        const recommendationText = normalizeString(item?.recommendation_text);
        const priority = Number(item?.priority_order);

        return {
          title,
          recommendation_text: recommendationText,
          priority_order: Number.isFinite(priority) && priority > 0 ? priority : index + 1,
        };
      })
      .filter((item) => item.recommendation_text)
      .sort((left, right) => left.priority_order - right.priority_order)
    : [];

  if (rows.length) return rows.slice(0, 3);

  if (decision === 'Retake Photos') {
    return [{
      title: 'Retake Photo Set',
      recommendation_text: summary || 'Please retake the required hair photos in brighter lighting and keep the hair centered in every view.',
      priority_order: 1,
    }];
  }

  return [{
    title: concernType === 'hair_loss' ? 'Review Hair-Loss Guidance' : 'Review Donation Screening',
    recommendation_text: summary || 'Review the screening result before continuing.',
    priority_order: 1,
  }];
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

const formatQuestionnaireAnswers = (answers: Record<string, unknown> = {}) => (
  Object.entries(answers)
    .map(([key, value]) => `${key}: ${value === '' || value === null || value === undefined ? 'not provided' : String(value)}`)
    .join('\n')
);

const normalizeAnalysisPayload = (
  analysis: Record<string, unknown>,
  providedViews: string[],
  concernType: string,
  requirementContext: DonationRequirementContext | null
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

  let decision = normalizeString(analysis?.decision);
  if (!decision) {
    if (!isHairDetected || missingViews.length) {
      decision = 'Retake Photos';
    } else if (
      concernType === 'donation_eligibility'
      && requirementContext?.minimum_hair_length != null
      && estimatedLength != null
      && estimatedLength < Number(requirementContext.minimum_hair_length)
    ) {
      decision = 'Not Yet Eligible';
    } else if (
      detectedCondition.toLowerCase().includes('damage')
      || detectedCondition.toLowerCase().includes('treated')
      || detectedCondition.toLowerCase().includes('frizz')
    ) {
      decision = 'Needs Review';
    } else {
      decision = 'Eligible';
    }
  }

  let summary = normalizeString(analysis?.summary);
  if (!summary) {
    summary = !isHairDetected
      ? (invalidImageReason || 'Based on your uploaded photos, the hair was not clear enough for screening.')
      : missingViews.length
        ? `Based on your uploaded photos, please retake these required views clearly: ${missingViews.join(', ')}.`
        : `Based on your answers and uploaded photos, this screening suggests ${detectedTexture || 'hair'} with ${detectedCondition || 'an unspecified condition'} for donation review. Final acceptance still requires manual review.`;
  }

  return {
    is_hair_detected: isHairDetected,
    invalid_image_reason: invalidImageReason,
    missing_views: missingViews,
    per_view_notes: normalizedViewNotes,
    estimated_length: estimatedLength,
    detected_texture: detectedTexture || (!isHairDetected ? '' : 'Unclear'),
    detected_density: detectedDensity || (!isHairDetected ? '' : 'Unclear'),
    detected_condition: detectedCondition || (!isHairDetected ? 'Needs Better Photos' : 'Needs Better Photos'),
    visible_damage_notes: visibleDamageNotes,
    confidence_score: confidenceScore,
    decision,
    summary,
    recommendations: normalizeRecommendations(analysis?.recommendations, decision, summary, concernType),
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

    if (!images.length) {
      return createJsonResponse({ error: 'Please upload at least one clear hair photo before analysis.' }, 400);
    }

    if (!normalizeString(questionnaireAnswers?.screening_intent)) {
      return createJsonResponse({ error: 'Please complete the guided donation questions before analysis.' }, 422);
    }

    if (!complianceContext?.acknowledged) {
      return createJsonResponse({ error: 'Please confirm the photo compliance checklist before analysis.' }, 422);
    }

    const validImages = images.filter((image) => typeof image?.dataUrl === 'string' && image.dataUrl.startsWith('data:'));
    const providedViews = new Set(
      validImages
        .map((image) => image.viewLabel || image.viewKey)
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
    });

    const userContent = [
      {
        type: 'input_text',
        text: [
          'Analyze these hair photos and return the requested JSON structure.',
          `concern_type: ${concernType}`,
          `screening_intent: ${normalizeString(questionnaireAnswers?.screening_intent) || 'not provided'}`,
          'Expected views: Front View Photo, Back View Photo, Hair Ends Close-Up, Side View Photo.',
          'Only treat the upload as valid if the images clearly show human hair.',
          'Use the actual photo content plus the structured answers and requirement context as the source of truth.',
          `photo_compliance_acknowledged: ${complianceContext?.acknowledged === true ? 'yes' : 'no'}`,
          'Questionnaire answers:',
          formatQuestionnaireAnswers(questionnaireAnswers),
          'Donation requirement context:',
          formatRequirementContext(donationRequirementContext),
          'Previous submission context:',
          formatSubmissionContext(submissionContext),
        ].join('\n'),
      },
      ...validImages.flatMap((image, index) => ([
        {
          type: 'input_text',
          text: `Image ${index + 1} view: ${image.viewLabel || image.viewKey || `Photo ${index + 1}`}.`,
        },
        {
          type: 'input_image',
          image_url: image.dataUrl,
          detail: 'low',
        },
      ])),
    ];

    if (userContent.length === 1) {
      return createJsonResponse({ error: 'No valid image payload was provided.' }, 400);
    }

    const result = await createStructuredResponse({
      instructions,
      schemaName: 'hair_analysis',
      schema: analysisSchema,
      maxOutputTokens: 1100,
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const analysis = normalizeAnalysisPayload(
      result?.analysis || {},
      Array.from(providedViews),
      concernType,
      donationRequirementContext
    );

    console.info('[analyze-hair-submission] openai result ready', {
      concernType,
      hasAnalysis: Boolean(analysis),
      isHairDetected: analysis?.is_hair_detected ?? null,
      missingViews: Array.isArray(analysis?.missing_views) ? analysis.missing_views : [],
      decision: analysis?.decision || '',
      recommendationCount: Array.isArray(analysis?.recommendations) ? analysis.recommendations.length : 0,
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    });

    return createJsonResponse({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[analyze-hair-submission]', error);
    const safeError = resolveSafeAnalysisError(error);

    return createJsonResponse({
      error: safeError.message,
    }, safeError.status);
  }
});
