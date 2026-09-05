import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';
import {
  DEFAULT_OPENROUTER_HAIR_VISION_MODEL,
  createStructuredResponse,
  resolveOpenRouterHairVisionModel,
} from '../_shared/ai-vision.ts';

const detectionSchema = {
  type: 'object',
  properties: {
    face: {
      type: 'object',
      properties: {
        is_detected: { type: 'boolean' },
        reason: { type: 'string' },
        bounds: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
        landmarks: {
          type: 'object',
          properties: {
            forehead: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            chin: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            nose: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            left_eye: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            right_eye: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            left_temple: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            right_temple: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            left_ear: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
            right_ear: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
          },
          required: ['forehead', 'chin', 'nose', 'left_eye', 'right_eye', 'left_temple', 'right_temple'],
        },
        roll_angle: { type: 'number' },
        yaw_angle: { type: 'number' },
      },
      required: ['is_detected', 'reason', 'bounds', 'landmarks', 'roll_angle', 'yaw_angle'],
    },
  },
  required: ['face'],
};

const normalizeString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const extractBase64Data = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const extractMimeType = (dataUrl: string) => {
  const match = /^data:([^;]+);base64,/i.exec(dataUrl);
  return match?.[1] || 'image/jpeg';
};

const clamp01 = (value: unknown, fallback = 0) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(1, Math.max(0, numericValue));
};

const normalizePoint = (point: Record<string, unknown> | undefined, fallback: { x: number; y: number }) => ({
  x: clamp01(point?.x, fallback.x),
  y: clamp01(point?.y, fallback.y),
});

const normalizeDetectedFaceFrame = ({
  face,
  imageWidth,
  imageHeight,
}: {
  face: Record<string, unknown>;
  imageWidth: number;
  imageHeight: number;
}) => {
  const bounds = face?.bounds as Record<string, unknown> | undefined;
  const x = clamp01(bounds?.x, 0.25);
  const y = clamp01(bounds?.y, 0.16);
  const width = Math.max(0.12, Math.min(0.9, Number(bounds?.width) || 0.5));
  const height = Math.max(0.16, Math.min(0.9, Number(bounds?.height) || 0.58));
  const landmarks = face?.landmarks as Record<string, Record<string, unknown>> | undefined;
  const toPixelPoint = (key: string, fallback: { x: number; y: number }) => {
    const point = normalizePoint(landmarks?.[key], fallback);
    return {
      x: point.x * imageWidth,
      y: point.y * imageHeight,
    };
  };

  return {
    source: 'ai_photo_detection',
    mediapipe: true,
    frameWidth: imageWidth,
    frameHeight: imageHeight,
    rollAngle: Number(face?.roll_angle || 0),
    yawAngle: Number(face?.yaw_angle || 0),
    bounds: {
      x: x * imageWidth,
      y: y * imageHeight,
      width: width * imageWidth,
      height: height * imageHeight,
    },
    landmarks: {
      FOREHEAD: toPixelPoint('forehead', { x: x + width / 2, y: y + height * 0.08 }),
      CHIN: toPixelPoint('chin', { x: x + width / 2, y: y + height * 0.96 }),
      NOSE: toPixelPoint('nose', { x: x + width / 2, y: y + height * 0.52 }),
      LEFT_EYE: toPixelPoint('left_eye', { x: x + width * 0.36, y: y + height * 0.38 }),
      RIGHT_EYE: toPixelPoint('right_eye', { x: x + width * 0.64, y: y + height * 0.38 }),
      LEFT_TEMPLE: toPixelPoint('left_temple', { x: x + width * 0.18, y: y + height * 0.4 }),
      RIGHT_TEMPLE: toPixelPoint('right_temple', { x: x + width * 0.82, y: y + height * 0.4 }),
      LEFT_EAR: toPixelPoint('left_ear', { x: x + width * 0.04, y: y + height * 0.52 }),
      RIGHT_EAR: toPixelPoint('right_ear', { x: x + width * 0.96, y: y + height * 0.52 }),
    },
  };
};

const instructions = [
  'Detect the visible head and face geometry for a virtual wig overlay.',
  'Return JSON only. Do not identify the person or infer sensitive traits.',
  'Use normalized coordinates from 0 to 1 relative to the full image width and height.',
  'The bounds should cover the face/head region used to align a wig, not the full body.',
  'Landmarks should be approximate if partially obscured, but must stay on the same visible person.',
  'left/right are from the viewer perspective in the image.',
].join('\n');

Deno.serve(async (request) => {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  try {
    const body = await request.json();
    const dataUrl = normalizeString(body?.image?.dataUrl || body?.dataUrl);
    const imageWidth = Math.max(1, Number(body?.image?.width || body?.width || 0));
    const imageHeight = Math.max(1, Number(body?.image?.height || body?.height || 0));

    if (!dataUrl.startsWith('data:')) {
      return createJsonResponse({ error: 'A base64 image is required for head detection.' }, 400);
    }

    const hasOpenRouter = Boolean((Deno.env.get('OPENROUTER_API_KEY') || '').trim());
    const model = hasOpenRouter
      ? resolveOpenRouterHairVisionModel(
          Deno.env.get('OPENROUTER_WIG_HEAD_DETECTION_MODEL')
          || Deno.env.get('OPENROUTER_HAIR_VISION_MODEL')
          || DEFAULT_OPENROUTER_HAIR_VISION_MODEL,
        )
      : Deno.env.get('GOOGLE_AI_WIG_HEAD_DETECTION_MODEL')
        || Deno.env.get('GOOGLE_AI_VISION_MODEL')
        || Deno.env.get('GOOGLE_AI_MODEL')
        || 'gemini-2.5-flash';

    const result = await createStructuredResponse({
      systemInstruction: instructions,
      responseJsonSchema: detectionSchema,
      maxOutputTokens: 800,
      temperature: 0,
      includeDiagnostics: true,
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Find the single visible face/head for wig placement.',
                'Return face bounds and landmarks as normalized coordinates relative to the full image.',
              ].join('\n'),
            },
            {
              inlineData: {
                mimeType: extractMimeType(dataUrl),
                data: extractBase64Data(dataUrl),
              },
            },
          ],
        },
      ],
    });

    const parsed = result?.parsed && typeof result.parsed === 'object'
      ? result.parsed as Record<string, unknown>
      : {};
    const face = parsed?.face && typeof parsed.face === 'object'
      ? parsed.face as Record<string, unknown>
      : {};

    if (face?.is_detected !== true) {
      return createJsonResponse({
        placement: null,
        reason: normalizeString(face?.reason) || 'No face was detected.',
        diagnostics: result?.diagnostics || null,
      });
    }

    return createJsonResponse({
      placement: {
        faceFrame: normalizeDetectedFaceFrame({ face, imageWidth, imageHeight }),
        stageLayout: {
          width: imageWidth,
          height: imageHeight,
        },
        wigCalibration: {
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        },
      },
      diagnostics: result?.diagnostics || null,
    });
  } catch (error) {
    // Detection metadata is optional for FLUX image editing. Return a valid
    // degraded result so a temporary vision-provider failure does not turn
    // the entire patient preview flow into an HTTP error.
    console.warn('[detect-wig-head-frame] continuing without placement metadata', {
      message: error instanceof Error ? error.message : 'Head detection failed.',
    });
    return createJsonResponse({
      placement: null,
      reason: 'Automatic head positioning is temporarily unavailable.',
      diagnostics: {
        degraded: true,
      },
    });
  }
});
