/// <reference path="../deno-globals.d.ts" />

import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import { createStructuredResponse, resolveOpenRouterHairVisionModel } from '../_shared/ai-vision.ts';
import { createHairPhotoVerificationToken } from '../_shared/hair-photo-verification.ts';

const accessoryCheckSchema = {
  type: 'object',
  properties: {
    check: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['no_accessory', 'accessory_detected', 'unclear'],
        },
        detected_accessories: {
          type: 'array',
          items: { type: 'string' },
        },
        confidence: { type: 'number' },
        reason: { type: 'string' },
        visual_screening_completed: { type: 'boolean' },
        hair_fully_visible: { type: 'boolean' },
        hair_loose_and_down: { type: 'boolean' },
        presentation_issues: {
          type: 'array',
          items: { type: 'string' },
        },
        view_correct: { type: 'boolean' },
        observed_pose: { type: 'string' },
        image_clear: { type: 'boolean' },
        lighting_acceptable: { type: 'boolean' },
      },
      required: [
        'status',
        'detected_accessories',
        'confidence',
        'reason',
        'visual_screening_completed',
        'hair_fully_visible',
        'hair_loose_and_down',
        'presentation_issues',
        'view_correct',
        'observed_pose',
        'image_clear',
        'lighting_acceptable',
      ],
    },
  },
  required: ['check'],
};

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeStringArray = (value: unknown) => (
  Array.isArray(value)
    ? [...new Set(value.map(normalizeString).filter(Boolean))]
    : []
);

const extractImageData = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
};

const instructions = [
  'You are a hair-visibility and photo-usability gate for one guided Hair Check frame.',
  'Return JSON only. Do not identify the person or infer sensitive traits.',
  '',
  'Set status="accessory_detected" only when an item blocks the hair area required for this view: roots, shaft, natural hanging length, ends, scalp, crown, or part line.',
  'Eyeglasses, earrings, face masks, and ordinary clothing are allowed when they do not cover required hair. A face is optional in every view.',
  'Caps, coverings, clips, ties, buns, ponytails, hands, or fabric are blockers only when they hide or change the required visible hair area.',
  'Report each visible item using a short familiar name in detected_accessories.',
  'Do not count room or background objects unless they obscure the required hair area.',
  'Do not count the person\'s hand as an accessory, but use status="unclear" if it blocks the hair or scalp needed for this view.',
  'A missing face is expected and must never cause a failure.',
  'Set hair_fully_visible=false when the hair area required by this view is cropped, covered, too dark, badly blurred, or hidden by the pose, hand, clothing, or another object.',
  'Set hair_loose_and_down=false if the hair is tied, pinned, clipped, braided into an updo, folded upward, placed in a bun or ponytail, or covered by a cap, hat, bonnet, scarf, or hood. For scalp and hair-ends close-ups, judge whether the visible hair is free of these restraints even if its full hanging length is outside the close-up.',
  'List short actionable problems such as "hair tied in ponytail", "cap covers hair", or "hair ends cropped" in presentation_issues.',
  'Use status="unclear" when blur, darkness, cropping, or obstruction prevents a reliable accessory decision.',
  'Use status="no_accessory" only after checking the entire visible head, face, and hair area.',
  'Set visual_screening_completed=true only when the decision is clear. Keep the reason to one short sentence.',
  'Also validate this individual requested view for the correct capture area, framing, angle, clarity, and usable lighting.',
  'Use view_correct=true only when the image actually shows the requested view named in the user prompt.',
  'Set image_clear=false for strong blur or motion blur. Set lighting_acceptable=false when the required hair area is too dark, washed out, or strongly backlit.',
  'observed_pose must briefly name the visible hair area, such as back_hair, left_back_side, right_back_side, scalp_root, or unclear.',
].join('\n');

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return createJsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const body = await request.json();
    const dataUrl = normalizeString(body?.image?.dataUrl);
    const image = extractImageData(dataUrl);
    const viewKey = normalizeString(body?.view?.key);
    const viewLabel = normalizeString(body?.view?.label) || 'Hair photo';

    if (!image || !image.mimeType.startsWith('image/') || !image.data) {
      return createJsonResponse({ error: 'A readable image is required.' }, 400);
    }

    if (image.data.length > 12_000_000) {
      return createJsonResponse({ error: 'The image is too large to check.' }, 413);
    }

    const hasOpenRouterKey = Boolean(Deno.env.get('OPENROUTER_API_KEY'));

    if (!hasOpenRouterKey) {
      return createJsonResponse({ error: 'OpenRouter accessory validation is not configured.' }, 500);
    }

    const model = resolveOpenRouterHairVisionModel(
      Deno.env.get('OPENROUTER_HAIR_VALIDATION_MODEL'),
    );

    const result = await createStructuredResponse({
      providerMode: 'openrouter-only',
      systemInstruction: instructions,
      responseJsonSchema: accessoryCheckSchema,
      maxOutputTokens: 1400,
      model,
      temperature: 0,
      reasoningEffort: 'minimal',
      includeDiagnostics: true,
      providerSort: 'latency',
      contents: [{
        role: 'user',
        parts: [
          { text: `Check this ${viewLabel} frame for visible accessories before it can be accepted.` },
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.data,
            },
          },
        ],
      }],
    });

    const parsed = result?.parsed && typeof result.parsed === 'object'
      ? result.parsed as Record<string, unknown>
      : {};
    const source = parsed.check && typeof parsed.check === 'object'
      ? parsed.check as Record<string, unknown>
      : parsed;
    const status = normalizeString(source.status).toLowerCase();
    const detectedAccessories = normalizeStringArray(source.detected_accessories);
    const presentationIssues = normalizeStringArray(source.presentation_issues);
    const hairFullyVisible = source.hair_fully_visible === true;
    const hairLooseAndDown = source.hair_loose_and_down === true;
    const accessoryDetected = status === 'accessory_detected' || detectedAccessories.length > 0;
    const presentationBlocked = !hairFullyVisible || !hairLooseAndDown || presentationIssues.length > 0;
    const visualScreeningCompleted = source.visual_screening_completed === true
      && ['no_accessory', 'accessory_detected'].includes(status);
    const viewCorrect = source.view_correct === true;
    const imageClear = source.image_clear === true;
    const lightingAcceptable = source.lighting_acceptable === true;
    const confidenceValue = Number(source.confidence);
    const confidence = Number.isFinite(confidenceValue)
      ? Math.min(1, Math.max(0, confidenceValue))
      : 0;

    const canCapture = visualScreeningCompleted
      && !accessoryDetected
      && !presentationBlocked
      && viewCorrect
      && imageClear
      && lightingAcceptable;
    const photoVerificationToken = canCapture
      ? await createHairPhotoVerificationToken([{ dataUrl, viewKey, viewLabel }])
      : null;

    return createJsonResponse({
      check: {
        accessory_detected: accessoryDetected,
        detected_accessories: detectedAccessories,
        confidence,
        reason: normalizeString(source.reason),
        visual_screening_completed: visualScreeningCompleted,
        hair_fully_visible: hairFullyVisible,
        hair_loose_and_down: hairLooseAndDown,
        presentation_issues: presentationIssues,
        view_correct: viewCorrect,
        observed_pose: normalizeString(source.observed_pose) || 'unclear',
        image_clear: imageClear,
        lighting_acceptable: lightingAcceptable,
        can_capture: canCapture,
      },
      photo_verification_token: photoVerificationToken,
      diagnostics: result?.diagnostics || null,
    });
  } catch (error) {
    console.error('[validate-hair-capture-accessories]', error);
    const diagnostics = (error as { diagnostics?: Record<string, unknown> })?.diagnostics || null;
    return createJsonResponse({
      error: 'The accessory check is temporarily unavailable.',
      diagnostics,
    }, 503);
  }
});
