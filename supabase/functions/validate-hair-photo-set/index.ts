import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse, resolveOpenRouterHairVisionModel } from '../_shared/ai-vision.ts';
import {
  createHairPhotoVerificationToken,
  verifyHairPhotoVerificationToken,
} from '../_shared/hair-photo-verification.ts';
import { compareFacesWithCompreFace, isCompreFaceConfigured } from '../_shared/compreface-comparison.ts';

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
                enum: ['back_hair', 'left_back_side', 'right_back_side', 'scalp_root', 'unclear'],
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
  'back hair': 'Back Hair',
  back_hair: 'Back Hair',
  'left back/side hair': 'Left Back/Side Hair',
  side_profile: 'Left Back/Side Hair',
  'right back/side hair': 'Right Back/Side Hair',
  right_side_profile: 'Right Back/Side Hair',
  'scalp / root area': 'Scalp / Root Area',
  hair_scalp: 'Scalp / Root Area',
  'front view photo': 'Front View Photo',
  front_view: 'Front View Photo',
  'full hair length photo': 'Front View Photo',
  'side profile photo': 'Side Profile Photo',
  'side view photo': 'Side Profile Photo',
  'left side photo': 'Side Profile Photo',
  'right side photo': 'Side Profile Photo',
  'hair ends close-up': 'Hair Ends Close-Up',
  'hair ends close up': 'Hair Ends Close-Up',
  'hair ends': 'Hair Ends Close-Up',
  hair_ends_close_up: 'Hair Ends Close-Up',
  'back hair photo': 'Back Hair Photo',
  'back view photo': 'Back Hair Photo',
  side_view: 'Side Profile Photo',
  'hair scalp': 'Hair Scalp',
  'photo of the scalp': 'Hair Scalp',
  'scalp photo': 'Hair Scalp',
  'scalp view': 'Hair Scalp',
};

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeViewLabel = (value: unknown) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('left back') || normalized === 'side_profile') return 'Left Back/Side Hair';
  if (normalized.includes('right back') || normalized === 'right_side_profile') return 'Right Back/Side Hair';
  if (normalized.includes('scalp') || normalized.includes('root area') || normalized.includes('crown')) return 'Scalp / Root Area';
  if (normalized === 'back hair' || normalized === 'back_hair' || normalized.includes('back hair photo')) return 'Back Hair';
  if (normalized.includes('back hair') || normalized.includes('back view') || normalized === 'back' || normalized.includes('back')) {
    return 'Back Hair Photo';
  }
  if (normalized.includes('hair ends') || normalized.includes('ends close')) {
    return 'Hair Ends Close-Up';
  }
  if (normalized.includes('hair scalp') || normalized.includes('scalp') || normalized.includes('crown')) {
    return 'Hair Scalp';
  }
  if (normalized.includes('front view') || normalized === 'front' || normalized.includes('front')) {
    return 'Front View Photo';
  }
  if (normalized.includes('right side') || normalized.includes('right_side')) {
    return 'Right Side Photo';
  }
  if (normalized.includes('side profile') || normalized.includes('side view') || normalized.includes('left side') || normalized.includes('right side') || normalized.includes('side')) {
    return 'Side Profile Photo';
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

const requiredValidationViewLabels = ['Back Hair', 'Left Back/Side Hair', 'Right Back/Side Hair', 'Scalp / Root Area'];
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

const faceVisibleViewLabels: string[] = [];
const hairOnlyViewLabels = [...requiredValidationViewLabels];
const expectedPoseByViewLabel: Record<string, string> = {
  'Back Hair': 'back_hair',
  'Left Back/Side Hair': 'left_back_side',
  'Right Back/Side Hair': 'right_back_side',
  'Scalp / Root Area': 'scalp_root',
  'Front View Photo': 'front',
  'Side Profile Photo': 'left_profile',
  'Right Side Photo': 'right_profile',
  'Hair Scalp': 'scalp',
  'Hair Ends Close-Up': 'hair_ends',
  'Back Hair Photo': 'back_hair',
};

const friendlyPoseByViewLabel: Record<string, string> = {
  'Back Hair': 'full back-hair view',
  'Left Back/Side Hair': 'left back/side hair view',
  'Right Back/Side Hair': 'right back/side hair view',
  'Scalp / Root Area': 'scalp and root view',
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

const runCompreFaceComparison = async (
  validationImages: Array<{ label: string; image?: HairValidationImage }>,
) => {
  if (!isCompreFaceConfigured()) {
    return {
      status: 'not_configured',
      required: false,
      failed_views: [] as string[],
      comparisons: [] as Array<Record<string, unknown>>,
      message: '',
    };
  }

  const imagesByLabel = new Map(
    validationImages
      .filter(({ image }) => Boolean(image?.dataUrl))
      .map(({ label, image }) => [label, image as HairValidationImage]),
  );
  const pairs = [
    ['Front View Photo', 'Side Profile Photo'],
    ['Front View Photo', 'Right Side Photo'],
    ['Side Profile Photo', 'Right Side Photo'],
  ] as const;

  try {
    const comparisons = await Promise.all(pairs.map(async ([sourceLabel, targetLabel]) => {
      const source = imagesByLabel.get(sourceLabel);
      const target = imagesByLabel.get(targetLabel);
      if (!source?.dataUrl || !target?.dataUrl) {
        return {
          source_view: sourceLabel,
          target_view: targetLabel,
          status: 'unclear',
          similarity: null,
          reason: 'A face-visible view is missing.',
        };
      }
      const result = await compareFacesWithCompreFace({
        sourceDataUrl: source.dataUrl,
        targetDataUrl: target.dataUrl,
      });
      return {
        source_view: sourceLabel,
        target_view: targetLabel,
        ...result,
      };
    }));
    const statusFor = (left: string, right: string) => comparisons.find((comparison) => (
      (comparison.source_view === left && comparison.target_view === right)
      || (comparison.source_view === right && comparison.target_view === left)
    ))?.status;
    const frontLeft = statusFor('Front View Photo', 'Side Profile Photo');
    const frontRight = statusFor('Front View Photo', 'Right Side Photo');
    const leftRight = statusFor('Side Profile Photo', 'Right Side Photo');
    const failedViews = new Set<string>();

    if (frontLeft === 'mismatch' && frontRight === 'match' && leftRight === 'mismatch') {
      failedViews.add('Side Profile Photo');
    } else if (frontLeft === 'mismatch' && frontRight === 'mismatch' && leftRight === 'match') {
      failedViews.add('Front View Photo');
    } else if (frontLeft === 'match' && frontRight === 'mismatch' && leftRight === 'mismatch') {
      failedViews.add('Right Side Photo');
    }

    if (failedViews.size) {
      return {
        status: 'mismatch',
        required: true,
        failed_views: [...failedViews],
        comparisons,
        message: 'One face-visible photo does not match the other captured views.',
      };
    }

    if (comparisons.every((comparison) => comparison.status === 'match')) {
      return {
        status: 'verified',
        required: true,
        failed_views: [] as string[],
        comparisons,
        message: 'Face-visible photos match within this capture session.',
      };
    }

    return {
      status: 'unclear',
      required: true,
      failed_views: faceVisibleViewLabels,
      comparisons,
      message: 'We could not confidently match all face-visible photos. Please retake the highlighted views.',
    };
  } catch (error) {
    console.error('[validate-hair-photo-set] CompreFace comparison unavailable', {
      message: error instanceof Error ? error.message : String(error || ''),
    });
    return {
      status: 'unavailable',
      required: true,
      failed_views: [] as string[],
      comparisons: [] as Array<Record<string, unknown>>,
      message: 'Face matching is temporarily unavailable. Please try the photo check again.',
    };
  }
};

const instructions = [
  'You validate hair-screening photos before a separate hair analysis step.',
  'Return JSON only.',
  'Do not identify or name the person. Compare only whether face-visible photos appear to show the same subject in this one photo set. Do not infer age, ethnicity, or other sensitive traits.',
  'Only decide whether the submitted photo set is acceptable for hair analysis.',
  '',
  'Rules:',
  '1. There must be exactly one visible subject in front and side views.',
  '2. Front View Photo must be face-forward and show the current hair clearly. Set observed_pose="front" and pose_correct=true only when the face is substantially centered rather than turned to either side.',
  '3. Side Profile Photo is the LEFT-SIDE capture slot. It must show a clear left-side head turn/profile with the hair length visible. Set observed_pose="left_profile" and pose_correct=true only for the requested left side.',
  '3A. Right Side Photo is the RIGHT-SIDE capture slot. It must show a clear right-side head turn/profile with the hair length visible. Set observed_pose="right_profile" and pose_correct=true only for the requested right side.',
  '3B. The two side photos must show opposite head directions. Reject the exact incorrect slot when both side images show the same direction, a front-facing pose, the wrong requested side, or too little turn to establish the side.',
  '3C. Do not accept a horizontally mirrored duplicate as the opposite side. Compare hair parting, accessories, background details, and image content for signs that one side image was copied or mirrored.',
  '4. Hair Scalp must show the scalp/crown/top part clearly with the hair parted enough to assess visible scalp coverage, density, flakes, oiliness, or buildup. It must not be a random hair photo or a watermarked stock-like image.',
  '5. Back Hair Photo, Right Side Photo, and Hair Ends Close-Up are optional supporting views for older clients. When present, they must visually match the same current hair using hair color, texture, density, length, ends, and shoulder/clothing cues when visible.',
  '6. Compare Front View Photo, Side Profile Photo, and Right Side Photo pair by pair. If two views clearly match and one differs from both, mark only that outlier as same_subject_status="mismatch". Do not blame Hair Scalp for a mismatch between face-visible views.',
  '6A. All provided views must visually match as one submission using current hair color, texture, density, hairline/parting when visible, clothing/shoulder area when visible, back-side fullness, and overall framing. Do not require the face to be visible in Hair Scalp, Hair Ends Close-Up, or Back Hair Photo.',
  '6B. For Hair Scalp, Hair Ends Close-Up, and Back Hair Photo, same_subject_status means whether the visible current hair is consistent with the front and side views. Use match only when the visible hair cues are compatible, mismatch when they clearly conflict or show unrelated hair, and unclear when there is not enough usable hair to compare.',
  '6C. A different room, background, camera distance, lighting, or clothing alone is not proof of a different subject. Base a mismatch on the visible face for face views or multiple incompatible current-hair cues for hair-only views.',
  '6D. Treat a photo of another screen, printed photo, stock image, gallery screenshot, or image containing a separate unrelated person as a mismatch and set view_correct=false for that exact view.',
  '7. For Hair Scalp, accept a top/crown/part-line image even when the face is cropped or the subject is looking down. Compare it to front/side only by current hair cues, not facial identity.',
  '8. Accept normal pose changes between front, side, and back views. Do not reject only because the face angle, cheek shape, lighting, or framing changes between required views.',
  '9. Reject mixed submissions only when the hair clearly belongs to a different person or different current hair, such as obviously different color/texture/density or an unrelated stock/model image.',
  '10. Reject if there is a visible watermark, stock-photo text, unrelated background model image, or obvious downloaded/reference image.',
  '11. Check every view for every visible accessory: glasses, sunglasses, caps, hats, headbands, clips, pins, hair ties, scrunchies, scarves, hoods, headphones, masks, face shields, hands, towels, or fabric. Every visible head, face, or hair accessory is disallowed, even when it does not block hair length. Add each item to accessory_findings with blocks_required_hair=true.',
  '11A. Ordinary eyeglasses are not an exception. Set blocks_required_hair=true, accessories_detected=true, is_acceptable=false, and fail the affected view whenever glasses or another accessory is visible.',
  '11B. Hair tied or folded upward with a claw clip, hair clip, pin, tie, scrunchie, bun, or ponytail is not usable for donation-length analysis because the natural hanging ends are hidden. Set blocks_required_hair=true, accessories_detected=true, is_acceptable=false, and fail every affected length view.',
  '12. Screen conservatively for possible wigs, hairpieces, toppers, or extensions. Look only for visible evidence such as a lace edge, wig cap, lifted or unnaturally uniform hairline, exposed wefts/tracks, tape or bonded extension points, abrupt unmatched density/texture, or attachment seams. Do not flag natural hair merely because it is dense, styled, straightened, curled, or colored.',
  '13. Set hair_authenticity_status="possible_wig_or_extensions" only when visible evidence is reasonably clear. Use "unclear" when the roots, hairline, or attachment areas cannot be assessed. Use "likely_natural" when the visible views are consistent and no artificial-hair attachment signs are seen.',
  '14. Set accessories_detected=true whenever at least one accessory is visible. Describe the items in accessory_notes and add their affected view labels to failed_views.',
  '15. A blocking accessory or possible wig/extensions must make is_acceptable=false so the user can retake without obstructions or receive manual verification.',
  '',
  'Always return all schema fields and one per_view_checks entry for every supplied image using its exact canonical label.',
  'For each supplied image, return observed_pose and pose_correct. The required mapping is Front View Photo=front, Side Profile Photo=left_profile, Right Side Photo=right_profile, Hair Scalp=scalp, Hair Ends Close-Up=hair_ends, and Back Hair Photo=back_hair.',
  'For every supplied view, same_subject_status must be match, mismatch, or unclear. Never use not_applicable when an image was supplied.',
  'Use confidence from 0 to 1 for each per-view consistency decision. Do not report match below 0.60 confidence; use unclear and set view_correct=false instead.',
  'Set view_correct=false for a wrong angle, unrelated image, blocking accessory, unclear required hair area, or subject mismatch. Keep notes short and specific.',
  'Put concise visible findings such as "glasses visible but hairline clear", "headband blocks hairline", or "possible lace edge" in appearance_flags.',
  'Set visual_screening_completed=true after checking all supplied images against the accessory and hair-authenticity rules.',
  'If any rule fails, set is_acceptable=false, give one concise user-facing reason, and list failed view labels.',
].join('\n');

const hairFocusedValidationInstructions = [
  'You validate four donor Hair Check photos before a separate visible hair analysis.',
  'Return JSON only and never identify the person or infer sensitive traits.',
  'The required views are Back Hair, Left Back/Side Hair, Right Back/Side Hair, and Scalp / Root Area.',
  'A face is optional in every view. Do not require, compare, recognize, or match faces.',
  'Check usability only: the requested hair area must be present, sharp enough, bright enough, not overexposed, and not replaced by an unrelated or stock image.',
  'Back Hair must show loose hair from roots through the lowest visible ends.',
  'Left Back/Side Hair and Right Back/Side Hair must show the corresponding opposite back/side angles with roots, length, and ends visible.',
  'Scalp / Root Area must show a clear crown, part line, or root area. The face may be fully cropped.',
  'Compare only non-identifying current-hair cues across views: color, texture, length, density, parting, and length. Different rooms or lighting alone are not a mismatch.',
  'Do not reject a natural hair type, color, texture, density, visible concern, or possible donation ineligibility. Those belong to the later analysis.',
  'Accessories only block a view when they cover the required roots, shaft, length, ends, or scalp area. Eyeglasses and ordinary clothing are not blockers.',
  'Hair may be moved gently for the scalp view. For length views, reject a bun, ponytail, clip, covering, or pose that hides the natural hanging length or ends.',
  'Use observed_pose exactly as follows: Back Hair=back_hair, Left Back/Side Hair=left_back_side, Right Back/Side Hair=right_back_side, Scalp / Root Area=scalp_root.',
  'Return one per_view_checks item for every supplied image. Mark only the affected view failed so the donor retakes only that photo.',
  'Use same_subject_status=match when current-hair cues are compatible, mismatch only for clear conflicts/unrelated images, and unclear when the photo is unusable.',
  'Set visual_screening_completed=true only after all four views were inspected. Keep all notes concise and actionable.',
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
        observed_pose: label === 'Back Hair'
          ? 'back_hair'
          : label === 'Left Back/Side Hair'
            ? 'left_back_side'
            : label === 'Right Back/Side Hair'
              ? 'right_back_side'
              : 'scalp_root',
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
          reason: 'All four individually validated photos are ready for combined hair analysis.',
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
          message: 'Face matching is not used for hair-focused captures.',
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
      message: 'Face matching is not used for hair-focused captures.',
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
          note: 'This face-visible photo does not match the other captured views.',
        };
      }
      if (faceComparison.status === 'verified' && faceVisibleViewLabels.includes(check.view_label)) {
        return { ...check, same_subject_status: 'match' };
      }
      return check;
    });
    const suppliedHairOnlyViewLabels = hairOnlyViewLabels.filter((viewLabel) => suppliedLabels.includes(viewLabel));
    const supportingHairViewsPassed = suppliedHairOnlyViewLabels.every((viewLabel) => (
      normalizedPerViewChecks.find((check) => check.view_label === viewLabel)?.same_subject_status === 'match'
    ));
    const sameSubjectVerified = supportingHairViewsPassed;
    const reportedFailedViews = Array.isArray(validationSource.failed_views)
      ? validationSource.failed_views.map(normalizeViewLabel).filter(Boolean)
      : [];
    const failedViewSet = new Set([
      ...reportedFailedViews,
      ...normalizedPerViewChecks.filter((check) => !check.view_correct).map((check) => check.view_label),
      ...normalizedPerViewChecks
        .filter((check) => check.same_subject_status !== 'match')
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
    const unclearConsistencyViews = normalizedPerViewChecks
      .filter((check) => !['match', 'mismatch'].includes(check.same_subject_status))
      .map((check) => check.view_label);
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
              ? 'One or more captured photos do not match the same current hair set. Please retake the highlighted views.'
              : unclearConsistencyViews.length
                ? 'We could not confirm that every captured photo belongs to the same current hair set. Please retake the highlighted views clearly.'
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
