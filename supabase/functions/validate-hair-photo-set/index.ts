import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse, resolveOpenRouterHairVisionModel } from '../_shared/ai-vision.ts';
import {
  createHairPhotoVerificationToken,
  verifyHairPhotoVerificationToken,
} from '../_shared/hair-photo-verification.ts';

const validationSchema = {
  type: 'object',
  properties: {
    validation: {
      type: 'object',
      properties: {
        is_acceptable: { type: 'boolean' },
        reason: { type: 'string' },
        failed_views: {
          type: 'array',
          items: { type: 'string' },
        },
        accessories_detected: { type: 'boolean' },
        accessory_notes: { type: 'string' },
        hair_authenticity_status: {
          type: 'string',
          enum: ['likely_natural', 'possible_wig_or_extensions', 'unclear'],
        },
        hair_authenticity_notes: { type: 'string' },
        appearance_flags: {
          type: 'array',
          items: { type: 'string' },
        },
        accessory_findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              view_label: { type: 'string' },
              accessory: { type: 'string' },
              blocks_required_hair: { type: 'boolean' },
              note: { type: 'string' },
            },
            required: ['view_label', 'accessory', 'blocks_required_hair', 'note'],
          },
        },
        per_view_checks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              view_label: { type: 'string' },
              view_correct: { type: 'boolean' },
              observed_pose: {
                type: 'string',
                enum: ['front', 'left_profile', 'right_profile', 'back_hair', 'scalp_root', 'unclear'],
              },
              pose_correct: { type: 'boolean' },
              same_subject_status: {
                type: 'string',
                enum: ['match', 'mismatch', 'unclear'],
              },
              confidence: { type: 'number' },
              note: { type: 'string' },
            },
            required: ['view_label', 'view_correct', 'observed_pose', 'pose_correct', 'same_subject_status', 'confidence', 'note'],
          },
        },
        visual_screening_completed: { type: 'boolean' },
      },
      required: [
        'is_acceptable',
        'reason',
        'failed_views',
        'accessories_detected',
        'accessory_notes',
        'hair_authenticity_status',
        'hair_authenticity_notes',
        'appearance_flags',
        'accessory_findings',
        'per_view_checks',
        'visual_screening_completed',
      ],
    },
  },
  required: ['validation'],
};

type HairValidationImage = {
  dataUrl?: string;
  viewKey?: string;
  viewLabel?: string;
};

const canonicalViewAliases: Record<string, string> = {
  'front hair / face view': 'Front Hair / Face View',
  'front view photo': 'Front Hair / Face View',
  front_view: 'Front Hair / Face View',
  'full hair length photo': 'Front Hair / Face View',
  'left side hair view': 'Left Side Hair View',
  'left back/side hair': 'Left Side Hair View',
  'side profile photo': 'Left Side Hair View',
  'side view photo': 'Left Side Hair View',
  'left side photo': 'Left Side Hair View',
  side_profile: 'Left Side Hair View',
  'right side hair view': 'Right Side Hair View',
  'right back/side hair': 'Right Side Hair View',
  'right side photo': 'Right Side Hair View',
  right_side_profile: 'Right Side Hair View',
  'back hair view': 'Back Hair View',
  'back hair': 'Back Hair View',
  'back hair photo': 'Back Hair View',
  'back view photo': 'Back Hair View',
  back_hair: 'Back Hair View',
  'scalp / root view': 'Scalp / Root View',
  'scalp / root area': 'Scalp / Root View',
  hair_scalp: 'Scalp / Root View',
  'hair ends close-up': 'Hair Ends Close-Up',
  'hair ends close up': 'Hair Ends Close-Up',
  'hair ends': 'Hair Ends Close-Up',
  hair_ends_close_up: 'Hair Ends Close-Up',
  side_view: 'Left Side Hair View',
  'hair scalp': 'Scalp / Root View',
  'photo of the scalp': 'Scalp / Root View',
  'scalp photo': 'Scalp / Root View',
  'scalp view': 'Scalp / Root View',
};

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeViewLabel = (value: unknown) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('front') || normalized === 'front_view') return 'Front Hair / Face View';
  if (normalized.includes('left') || normalized === 'side_profile') return 'Left Side Hair View';
  if (normalized.includes('right') || normalized === 'right_side_profile') return 'Right Side Hair View';
  if (normalized.includes('scalp') || normalized.includes('root') || normalized.includes('crown')) return 'Scalp / Root View';
  if (normalized.includes('back') || normalized === 'back_hair') return 'Back Hair View';
  if (normalized.includes('hair ends') || normalized.includes('ends close')) {
    return 'Hair Ends Close-Up';
  }
  return canonicalViewAliases[normalized] || normalizeString(value);
};

const extractBase64Data = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const extractMimeType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] || 'image/jpeg';
};

const resolveSafeValidationError = (error: unknown) => {
  const message = normalizeString(error instanceof Error ? error.message : String(error || ''));
  const normalized = message.toLowerCase();

  if (
    normalized.includes('quota exceeded')
    || normalized.includes('rate limit')
    || normalized.includes('resource exhausted')
    || normalized.includes('free tier')
    || normalized.includes('retry in')
  ) {
    return {
      status: 429,
      message: 'Photo validation is busy right now. Please wait a moment, then try again.',
      errorType: 'quota_exceeded',
    };
  }

  if (
    normalized.includes('api key is not configured')
    || normalized.includes('not configured in edge function secrets')
  ) {
    return {
      status: 500,
      message: 'Photo validation is not configured on the server.',
      errorType: 'configuration_error',
    };
  }

  return {
    status: 500,
    message: message || 'Photo validation could not be completed right now.',
    errorType: 'validation_failed',
  };
};

const selectCanonicalValidationImage = (
  images: HairValidationImage[] = [],
  canonicalLabel = '',
) => images.find((image) => normalizeViewLabel(image?.viewLabel || image?.viewKey) === canonicalLabel);

const requiredValidationViewLabels = [
  'Front Hair / Face View',
  'Left Side Hair View',
  'Right Side Hair View',
  'Back Hair View',
  'Scalp / Root View',
];
const optionalValidationViewLabels: string[] = [];

const buildCanonicalValidationImages = (images: HairValidationImage[] = []) => ([
  ...requiredValidationViewLabels.map((label) => ({
    label,
    image: selectCanonicalValidationImage(images, label),
    required: true,
  })),
  ...optionalValidationViewLabels
    .map((label) => ({
      label,
      image: selectCanonicalValidationImage(images, label),
      required: false,
    }))
    .filter(({ image }) => Boolean(image?.dataUrl)),
]);

const faceVisibleViewLabels = ['Front Hair / Face View', 'Left Side Hair View', 'Right Side Hair View'];
const expectedPoseByViewLabel: Record<string, string> = {
  'Front Hair / Face View': 'front',
  'Left Side Hair View': 'left_profile',
  'Right Side Hair View': 'right_profile',
  'Back Hair View': 'back_hair',
  'Scalp / Root View': 'scalp_root',
  'Front View Photo': 'front',
  'Side Profile Photo': 'left_profile',
  'Right Side Photo': 'right_profile',
  'Hair Scalp': 'scalp',
  'Hair Ends Close-Up': 'hair_ends',
  'Back Hair Photo': 'back_hair',
};

const friendlyPoseByViewLabel: Record<string, string> = {
  'Front Hair / Face View': 'front-facing hair and face view',
  'Left Side Hair View': 'left-side hair profile',
  'Right Side Hair View': 'right-side hair profile',
  'Back Hair View': 'full back-hair view',
  'Scalp / Root View': 'scalp and root view',
  'Front View Photo': 'front-facing view',
  'Side Profile Photo': 'left-side profile',
  'Right Side Photo': 'right-side profile',
  'Hair Scalp': 'scalp view',
  'Hair Ends Close-Up': 'hair-ends close-up',
  'Back Hair Photo': 'back-hair view',
};

const clampConfidence = (value: unknown) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(1, numericValue));
};

const normalizeAccessoryFindings = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const viewLabel = normalizeViewLabel(source.view_label);
    const accessory = normalizeString(source.accessory);
    if (!viewLabel || !accessory) return [];
    const blocksRequiredHair = source.blocks_required_hair === true;
    const key = `${viewLabel.toLowerCase()}|${accessory.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      view_label: viewLabel,
      accessory,
      blocks_required_hair: blocksRequiredHair,
      accepted: false,
      note: normalizeString(source.note) || `${accessory} must be removed for the guided hair photos.`,
    }];
  });
};

const normalizePerViewChecks = (value: unknown, suppliedLabels: string[]) => {
  const sourceChecks = Array.isArray(value) ? value : [];

  return suppliedLabels.map((viewLabel) => {
    const source = sourceChecks.find((item) => (
      item
      && typeof item === 'object'
      && normalizeViewLabel((item as Record<string, unknown>).view_label) === viewLabel
    )) as Record<string, unknown> | undefined;
    const reportedStatus = normalizeString(source?.same_subject_status).toLowerCase();
    const confidence = clampConfidence(source?.confidence);
    const normalizedStatus = ['match', 'mismatch', 'unclear', 'not_applicable'].includes(reportedStatus)
      ? reportedStatus
      : 'unclear';
    const sameSubjectStatus = normalizedStatus === 'match' && confidence < 0.6
      ? 'unclear'
      : normalizedStatus;
    const observedPose = normalizeString(source?.observed_pose).toLowerCase();
    const expectedPose = expectedPoseByViewLabel[viewLabel] || '';
    const poseCorrect = source?.pose_correct === true && observedPose === expectedPose;
    const viewCorrect = source?.view_correct === true && poseCorrect;

    return {
      view_label: viewLabel,
      view_correct: viewCorrect,
      observed_pose: observedPose || 'unclear',
      pose_correct: poseCorrect,
      same_subject_status: sameSubjectStatus,
      confidence,
      note: !poseCorrect
        ? `Retake this photo as a clear ${friendlyPoseByViewLabel[viewLabel] || 'required view'}.`
        : normalizeString(source?.note) || 'This view could not be verified clearly.',
    };
  });
};

const hairFocusedValidationInstructions = [
  'You validate five donor Hair Check photos before a separate visible hair analysis.',
  'Return JSON only. This is a Session Photo Consistency check, not biometric identity verification. Never identify the person or infer sensitive traits.',
  'The required views are Front Hair / Face View, Left Side Hair View, Right Side Hair View, Back Hair View, and Scalp / Root View.',
  'Front must contain one usable frontal person view with the face/head, front hairline, and front hair sufficiently visible.',
  'Left and Right Side must show the requested profile orientation and visible hair. Do not reject a side view merely because hair partly covers facial features.',
  'A face is not required in Back Hair or Scalp / Root. Use visible hair continuity for those views and use same_subject_status=unclear when evidence is insufficient.',
  'Check usability only: the requested hair area must be present, sharp enough, bright enough, not overexposed, and not replaced by an unrelated or stock image.',
  'Back Hair must show loose hair from roots through the lowest visible ends.',
  'Scalp / Root must show a clear crown, part line, or root area. The face may be fully cropped.',
  'Compare session continuity using front/profile appearance where visible plus Hair Pattern, color, length, density, hairline, parting, roots, and general hairstyle. Different angles, rooms, lighting, or apparent shape alone are not mismatches.',
  'Do not reject a natural Hair Pattern, color, density, visible concern, or possible donation ineligibility. Those belong to the later analysis.',
  'Accessories only block a view when they cover the required roots, shaft, length, ends, or scalp area. Eyeglasses and ordinary clothing are not blockers.',
  'Hair may be moved gently for the scalp view. For length views, reject a bun, ponytail, clip, covering, or pose that hides the natural hanging length or ends.',
  'Use observed_pose exactly as follows: Front Hair / Face View=front, Left Side Hair View=left_profile, Right Side Hair View=right_profile, Back Hair View=back_hair, Scalp / Root View=scalp_root.',
  'Return one per_view_checks item for every supplied image. Mark only the affected view failed so the donor retakes only that photo.',
  'Use same_subject_status=match when continuity cues are compatible, mismatch only for strong clear conflicts or unrelated images, and unclear when evidence is insufficient.',
  'Set visual_screening_completed=true only after all five views were inspected. Keep all notes concise and actionable.',
].join('\n');

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  try {
    const body = await request.json();
    const images = Array.isArray(body?.images) ? body.images.filter(Boolean) : [];
    const validationImages = buildCanonicalValidationImages(images);
    const individualVerificationTokens = Array.isArray(body?.photo_verification_tokens)
      ? body.photo_verification_tokens.map(normalizeString)
      : [];
    const missingValidationViews = validationImages
      .filter(({ image, required }) => required && !image?.dataUrl)
      .map(({ label }) => label);

    if (missingValidationViews.length) {
      return createJsonResponse({
        validation: {
          is_acceptable: false,
          reason: `Complete the ${missingValidationViews.join(', ')} photo${missingValidationViews.length > 1 ? 's' : ''} before analysis.`,
          failed_views: missingValidationViews,
          accessories_detected: false,
          accessory_notes: '',
          hair_authenticity_status: 'unclear',
          hair_authenticity_notes: 'Required views are missing.',
          appearance_flags: [],
          visual_screening_completed: false,
        },
      }, 200);
    }

    const hasCompleteIndividualVerification = individualVerificationTokens.length === validationImages.length
      && individualVerificationTokens.every(Boolean);
    if (hasCompleteIndividualVerification) {
      const individualChecks = await Promise.all(validationImages.map(({ image }, index) => (
        verifyHairPhotoVerificationToken({
          token: individualVerificationTokens[index],
          images: image ? [image] : [],
        })
      )));
      const failedReceiptIndexes = individualChecks
        .map((valid, index) => (valid ? -1 : index))
        .filter((index) => index >= 0);

      if (failedReceiptIndexes.length) {
        return createJsonResponse({
          validation: {
            is_acceptable: false,
            reason: 'One or more photos changed after validation. Please retake the highlighted view.',
            failed_views: failedReceiptIndexes.map((index) => validationImages[index]?.label || `Photo ${index + 1}`),
            accessories_detected: false,
            accessory_notes: '',
            accessory_findings: [],
            allowed_accessories: [],
            hair_authenticity_status: 'unclear',
            hair_authenticity_notes: 'Individual photo verification no longer matches the supplied image.',
            appearance_flags: [],
            per_view_checks: [],
            same_subject_verified: false,
            visual_screening_completed: false,
            retryable: false,
          },
          verification_token: null,
          diagnostics: { provider_request_attempted: false, validation_mode: 'signed_individual_receipts' },
        });
      }

      const perViewChecks = validationImages.map(({ label }) => ({
        view_label: label,
        view_correct: true,
        observed_pose: expectedPoseByViewLabel[label] || 'unclear',
        pose_correct: true,
        same_subject_status: 'match',
        confidence: 1,
        note: 'This image matches its signed individual photo-validation result.',
      }));
      const verificationToken = await createHairPhotoVerificationToken(images);

      console.info('[validate-hair-photo-set] signed individual validations accepted without another AI request', {
        imageCount: validationImages.length,
        providerRequestAttempted: false,
      });

      return createJsonResponse({
        validation: {
          is_acceptable: true,
          reason: 'All five individually validated photos are ready for combined Hair Analysis.',
          failed_views: [],
          accessories_detected: false,
          accessory_notes: '',
          accessory_findings: [],
          allowed_accessories: [],
          hair_authenticity_status: 'unclear',
          hair_authenticity_notes: 'Hair authenticity is evaluated conservatively during the combined visual analysis.',
          appearance_flags: [],
          per_view_checks: perViewChecks,
          same_subject_verified: true,
          different_faces_detected: false,
          face_mismatch_views: [],
          visual_screening_completed: true,
          retryable: false,
        },
        verification_token: verificationToken,
        face_comparison: {
          status: 'not_required',
          required: false,
          failed_views: [],
          comparisons: [],
          message: 'Session consistency is evaluated during the combined Hair Analysis without storing biometric templates.',
        },
        diagnostics: { provider_request_attempted: false, validation_mode: 'signed_individual_receipts' },
      });
    }

    const hasOpenRouterKey = Boolean(Deno.env.get('OPENROUTER_API_KEY'));
    const model = resolveOpenRouterHairVisionModel(
      Deno.env.get('OPENROUTER_HAIR_VALIDATION_MODEL'),
    );

    if (!hasOpenRouterKey) {
      return createJsonResponse({
        error: 'OpenRouter photo validation is not configured on the server.',
        errorType: 'configuration_error',
      }, 500);
    }

    const parts: Record<string, unknown>[] = [
      {
        text: [
          'Validate this exact photo set before hair analysis.',
          'Required views are provided in order and labels are included before each image.',
          'Return only the validation JSON.',
        ].join('\n'),
      },
    ];

    validationImages.forEach(({ label, image }, index: number) => {
      if (!image?.dataUrl) return;
      const dataUrl = normalizeString(image?.dataUrl);
      parts.push({ text: `Image ${index + 1}: ${label}` });
      parts.push({
        inlineData: {
          mimeType: extractMimeType(dataUrl),
          data: extractBase64Data(dataUrl),
        },
      });
    });

    const result = await createStructuredResponse({
        providerMode: 'openrouter-only',
        systemInstruction: hairFocusedValidationInstructions,
        responseJsonSchema: validationSchema,
        maxOutputTokens: 1800,
        model,
        temperature: 0,
        reasoningEffort: 'minimal',
        includeDiagnostics: true,
        contents: [{ role: 'user', parts }],
      });
    const faceComparison = {
      status: 'not_required', required: false, failed_views: [] as string[], comparisons: [],
      message: 'Session consistency is evaluated during the combined Hair Analysis without storing biometric templates.',
    };

    const parsed = result?.parsed && typeof result.parsed === 'object'
      ? result.parsed as Record<string, unknown>
      : {};
    const validationSource = parsed.validation && typeof parsed.validation === 'object'
      ? parsed.validation as Record<string, unknown>
      : parsed;
    const hasExplicitDecision = typeof validationSource?.is_acceptable === 'boolean';
    const reason = normalizeString(validationSource.reason);

    if (!hasExplicitDecision) {
      console.warn('[validate-hair-photo-set] AI response did not include a validation decision; blocking analysis', {
        model,
        parsedKeys: Object.keys(parsed),
        providerResponseStatus: result?.diagnostics?.provider_response_status ?? null,
        providerParseSuccess: result?.diagnostics?.provider_parse_success ?? null,
      });

      return createJsonResponse({
        validation: {
          is_acceptable: false,
          reason: 'We could not verify these photos right now. Please run the photo check again before analysis.',
          failed_views: [],
          accessories_detected: false,
          accessory_notes: '',
          accessory_findings: [],
          allowed_accessories: [],
          hair_authenticity_status: 'unclear',
          hair_authenticity_notes: 'Strict visual verification was unavailable.',
          appearance_flags: [],
          per_view_checks: [],
          same_subject_verified: false,
          visual_screening_completed: false,
          retryable: true,
        },
        face_comparison: faceComparison,
        diagnostics: result?.diagnostics || null,
        validation_warning: 'missing_validation_decision',
      });
    }

    const suppliedLabels = validationImages.map(({ label }) => label);
    const accessoryFindings = normalizeAccessoryFindings(validationSource.accessory_findings);
    const blockingAccessories = accessoryFindings.filter((finding) => finding.blocks_required_hair);
    const allowedAccessories = accessoryFindings.filter((finding) => finding.accepted);
    const accessoriesDetected = blockingAccessories.length > 0;
    const hasExplicitAccessoryDecision = typeof validationSource.accessories_detected === 'boolean';
    const hairAuthenticityStatus = [
      'likely_natural',
      'possible_wig_or_extensions',
      'unclear',
    ].includes(normalizeString(validationSource.hair_authenticity_status))
      ? normalizeString(validationSource.hair_authenticity_status)
      : 'unclear';
    const perViewChecks = normalizePerViewChecks(validationSource.per_view_checks, suppliedLabels);
    const faceComparisonFailedViews = new Set(faceComparison.failed_views.map(normalizeViewLabel).filter(Boolean));
    const normalizedPerViewChecks = perViewChecks.map((check) => {
      if (faceComparisonFailedViews.has(check.view_label)) {
        return {
          ...check,
          view_correct: false,
          same_subject_status: 'mismatch',
          note: 'This face-visible photo looks inconsistent with the other captured views.',
        };
      }
      if (faceComparison.status === 'verified' && faceVisibleViewLabels.includes(check.view_label)) {
        return { ...check, same_subject_status: 'match' };
      }
      return check;
    });
    const sameSubjectVerified = normalizedPerViewChecks.every((check) => (
      check.same_subject_status !== 'mismatch'
    ));
    const reportedFailedViews = Array.isArray(validationSource.failed_views)
      ? validationSource.failed_views.map(normalizeViewLabel).filter(Boolean)
      : [];
    const failedViewSet = new Set([
      ...reportedFailedViews,
      ...normalizedPerViewChecks.filter((check) => !check.view_correct).map((check) => check.view_label),
      ...normalizedPerViewChecks
        .filter((check) => check.same_subject_status === 'mismatch')
        .map((check) => check.view_label),
      ...blockingAccessories.map((finding) => finding.view_label),
      ...faceComparison.failed_views,
    ]);
    const mismatchedViews = normalizedPerViewChecks
      .filter((check) => check.same_subject_status === 'mismatch')
      .map((check) => check.view_label);
    const faceMismatchViews = [...new Set([
      ...mismatchedViews.filter((viewLabel) => faceVisibleViewLabels.includes(viewLabel)),
      ...faceComparison.failed_views.filter((viewLabel) => faceVisibleViewLabels.includes(viewLabel)),
    ])];
    const allViewsCorrect = normalizedPerViewChecks.length === suppliedLabels.length
      && normalizedPerViewChecks.every((check) => check.view_correct);
    const visualScreeningCompleted = validationSource.visual_screening_completed === true
      && normalizedPerViewChecks.length === suppliedLabels.length;
    const faceComparisonRetryable = false;
    const strictlyVerified = (
      visualScreeningCompleted
      && hasExplicitAccessoryDecision
      && !accessoriesDetected
      && allViewsCorrect
      && sameSubjectVerified
      && failedViewSet.size === 0
    );
    const normalizedReason = strictlyVerified
      ? allowedAccessories.length
        ? 'Your photos are verified. A visible accessory was accepted because it does not cover the hair needed for analysis.'
        : reason || 'Photo validation passed. The images are ready for AI hair analysis.'
      : faceComparison.status === 'mismatch' || faceComparison.status === 'unclear'
        ? faceComparison.message
        : faceComparisonRetryable
          ? faceComparison.message
          : !visualScreeningCompleted
        ? 'We could not finish checking these photos. Please run the photo check again before analysis.'
          : accessoriesDetected
            ? normalizeString(validationSource.accessory_notes) || 'An accessory covers part of the hair needed for analysis. Please remove it and retake the highlighted photo.'
            : mismatchedViews.length
              ? 'One or more captured photos look inconsistent with this Hair Analysis session. Please retake the highlighted views.'
              : reason || 'The photos do not look ready for analysis. Please retake the affected views.';
    const normalizedValidation = {
      is_acceptable: strictlyVerified,
      reason: normalizedReason,
      failed_views: [...failedViewSet],
      accessories_detected: accessoriesDetected,
      accessory_notes: normalizeString(validationSource.accessory_notes),
      accessory_findings: accessoryFindings,
      allowed_accessories: allowedAccessories,
      hair_authenticity_status: hairAuthenticityStatus,
      hair_authenticity_notes: normalizeString(validationSource.hair_authenticity_notes),
      appearance_flags: Array.isArray(validationSource.appearance_flags)
        ? validationSource.appearance_flags.map(normalizeString).filter(Boolean)
        : [],
      per_view_checks: normalizedPerViewChecks,
      same_subject_verified: sameSubjectVerified,
      different_faces_detected: faceMismatchViews.length > 0,
      face_mismatch_views: faceMismatchViews,
      visual_screening_completed: visualScreeningCompleted,
      retryable: faceComparisonRetryable || !visualScreeningCompleted,
    };
    const verificationToken = strictlyVerified
      ? await createHairPhotoVerificationToken(images)
      : null;

    return createJsonResponse({
      validation: normalizedValidation,
      verification_token: verificationToken,
      face_comparison: faceComparison,
      diagnostics: result?.diagnostics || null,
    });
  } catch (error) {
    console.error('[validate-hair-photo-set]', error);
    const safeError = resolveSafeValidationError(error);
    const diagnostics = (error as { diagnostics?: {
      provider?: string;
      provider_request_attempted?: boolean;
      provider_response_status?: number | null;
      provider_parse_success?: boolean;
      provider_error_type?: string;
      retry_after_seconds?: number | null;
    } })?.diagnostics;

    const effectiveErrorType = diagnostics?.provider_error_type || safeError.errorType;
    return createJsonResponse({
      error: safeError.message,
      errorType: effectiveErrorType,
      provider: diagnostics?.provider || 'gemini',
      provider_request_attempted: diagnostics?.provider_request_attempted ?? false,
      provider_response_status: diagnostics?.provider_response_status ?? null,
      provider_parse_success: diagnostics?.provider_parse_success ?? false,
      retry_after_seconds: diagnostics?.retry_after_seconds ?? null,
    }, safeError.status);
  }
});
