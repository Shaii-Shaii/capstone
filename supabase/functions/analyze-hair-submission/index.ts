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
        detected_color: {
          type: 'string',
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
        shine_level: {
          type: 'integer',
        },
        frizz_level: {
          type: 'integer',
        },
        dryness_level: {
          type: 'integer',
        },
        oiliness_level: {
          type: 'integer',
        },
        damage_level: {
          type: 'integer',
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
        'detected_color',
        'detected_texture',
        'detected_density',
        'detected_condition',
        'visible_damage_notes',
        'confidence_score',
        'shine_level',
        'frizz_level',
        'dryness_level',
        'oiliness_level',
        'damage_level',
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

const requiredViewDefinitions = [
  {
    key: 'front_view',
    label: 'Front View Photo',
    role: 'main root or hairline and overall fall view',
    analysisFocus: 'Use this view to inspect the hairline or root area, face-forward framing, overall visible color, scalp visibility, density, and whether the full hair fall is visible from top to bottom. Reject this view if the donor is turned sideways instead of facing forward.',
  },
  {
    key: 'side_profile',
    label: 'Side Profile Photo',
    role: 'side length and shaft structure view',
    analysisFocus: 'Use this view to inspect one clear side profile, visible root-to-end length from the side, fullness through the shaft, texture consistency, and whether the lowest visible ends can be seen relative to the root area. Reject this view if it is another front-facing image.',
  },
  {
    key: 'hair_ends_close_up',
    label: 'Hair Ends Close-Up',
    role: 'ends condition close-up view',
    analysisFocus: 'Use this close-up view to inspect split ends, dryness, fraying, sealing of the ends, and any visible damage concentrated at the lowest visible ends.',
  },
] as const;
const expectedViews = requiredViewDefinitions.map((view) => view.label);
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

  // Image-first analysis mandate
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
  // Smart capture quality and environment detection
  'SMART CAPTURE QUALITY DETECTION — check BEFORE analysis:',
  '- DARK ENVIRONMENT: If any photo is significantly underexposed, very dark, or has insufficient lighting to clearly see hair details, set is_hair_detected to false and invalid_image_reason to "The photo is too dark. Please move to a well-lit area, preferably near a window with natural light, and retake the photo."',
  '- NO PERSON DETECTED: If no human subject or person is visible in the photo (e.g., photo of a wall, floor, object, or empty room), set is_hair_detected to false and invalid_image_reason to "No person detected. Please position yourself in front of the camera with your hair clearly visible and retake the photo."',
  '- MULTIPLE SUBJECTS: If more than one person is clearly visible in the photo, set is_hair_detected to false and invalid_image_reason to "Multiple subjects detected. Only one person should be in the frame. Please retake with only you in the photo."',
  '- ACCESSORIES ON FACE OR HAIR: Carefully inspect every view for eyeglasses, sunglasses, masks, face shields, caps, hats, headbands, clips, pins, claw clips, hair ties, scrunchies, scarves, bonnets, headphones, hoods, hands, towels, or fabric on the face or covering/holding the hair. If any face or hair accessory is visible, set is_hair_detected to false and invalid_image_reason to "Accessories detected. Remove glasses, sunglasses, masks, caps, headbands, clips, pins, hair ties, scarves, headphones, and anything covering the face or hair, then retake the required view."',
  '- DISTRACTING BACKGROUND: If the background contains multiple other people, very cluttered objects, or items that make it hard to isolate the hair for analysis, set is_hair_detected to false and invalid_image_reason to "The background has too many distracting items. Please use a plain wall or uncluttered area and retake the photo."',
  '- BLURRY OR MOTION-BLURRED: If the photo is too blurry to distinguish hair details, set is_hair_detected to false and invalid_image_reason to "Photos not clear, please re-capture. Hold the camera steady and ensure good lighting."',
  '',
  'Your detected_condition, visible_damage_notes, summary, and recommendations MUST directly reflect these observations.',
  'If the questionnaire says "dry hair" but the photos show shiny, healthy hair, trust the photos and note the discrepancy.',
  'If the photos show visible split ends and dryness but the questionnaire says "no problems", trust the photos.',

  // Hair detection and validity
  'First confirm whether the images clearly show human hair intended for screening.',
  'If the images do not clearly show hair, set is_hair_detected to false and explain briefly in invalid_image_reason.',
  'Validate photo rules before analysis: one human subject only, front view is face-forward, side profile is actually turned to the side, hair ends close-up clearly shows uncovered ends, face and hair clearly visible, no glasses, no sunglasses, no masks, no face accessories, no obstructing hair accessories, no caps, no clips covering the hair, no heavy blur, and no distracting objects blocking the hair.',
  'If a photo is blurry or poorly lit enough to prevent reliable review, set is_hair_detected to false and invalid_image_reason to "Photos not clear, please re-capture."',
  'If more than one subject/person is visible in the screening photos, set is_hair_detected to false and invalid_image_reason to "Multiple subject detected, one subject is needed."',
  'If glasses, sunglasses, masks, face shields, clips, caps, hats, headbands, pins, hair ties, scarves, headphones, hoods, hands, towels, fabric, or accessories are visible on the face or obstruct the hairline, shaft, length, or ends, set is_hair_detected to false and invalid_image_reason to "Accessories detected. Remove glasses, sunglasses, masks, caps, headbands, clips, pins, hair ties, scarves, headphones, and anything covering the face or hair, then retake the required view."',
  `When image quality or visibility is too weak for a confident donation judgment, keep the final decision as "${IMPROVE_STATUS}" and explain the limitation honestly.`,

  // Per-view notes
  'For each provided photo view, write a detailed per_view_notes entry describing WHAT YOU SEE:',
  '- Front View: scalp condition, root oiliness/dryness, overall hair appearance, texture, density',
  '- Side Profile: confirm it is a side profile, then describe hair length visibility, shaft condition, shine or dullness, texture consistency',
  '- Hair Ends Close-Up: ends condition (split/healthy), dryness, damage, fraying',
  'Use missing_views only when a required view is genuinely absent or completely unusable.',

  // Length estimation
  'Estimate hair length in centimeters as a numeric value when the full hair fall from root to ends is visible. Use the Front View Photo and Side Profile Photo together. Return null only if both root and ends are blocked or cropped.',

  // Detected fields
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

  // visible_damage_notes
  'visible_damage_notes: describe EXACTLY what you observe in the photos:',
  '- If you see split ends, say "visible split ends observed in close-up view"',
  '- If you see oily scalp, say "scalp appears oily with visible shine at roots"',
  '- If you see dryness, say "hair shaft appears dull with lack of natural shine"',
  '- If you see healthy hair, say "hair appears healthy with good shine and sealed ends"',
  'Be specific and factual. This field should read like observation notes, not generic statements.',

  // Summary
  'summary: write 2–3 sentences that:',
  '1. Start with what you OBSERVE in the photos (e.g., "The uploaded photos show hair with visible shine and healthy-looking ends...")',
  '2. Mention specific visible characteristics (texture, scalp condition, ends condition, shine/dullness)',
  '3. Connect observations to the detected condition',
  '4. End with "Final screening requires manual review."',

  // Recommendations
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

  // Decision
  `decision: set to exactly one of: "${ELIGIBLE_STATUS}" or "${IMPROVE_STATUS}".`,
  'Base this on: (1) visible evidence from photos, (2) donation requirement context if provided, (3) observed hair condition.',
  `Use "${IMPROVE_STATUS}" when image quality prevents a confident visible-length or condition judgment.`,

  // donation_readiness_note
  `donation_readiness_note: When the estimated_length is ≥ ${MIN_DONATION_LENGTH_CM} cm AND the detected_condition is Healthy or otherwise suitable, write 1–2 specific, encouraging sentences about what the donor should do to prepare for donation (e.g., scheduling a haircut assessment, keeping hair healthy, contacting the organization). When the hair is not yet ready for donation, return an empty string.`,

  // history_assessment
  'history_assessment: if 2 or more prior hair-check entries are provided, compare current vs prior. Otherwise return empty string.',

  // Safety
  'Use safe wording: "this check suggests", "based on the visible photos", "the photos show", "observed in the images".',
  'Do not diagnose medical conditions. Do not invent characteristics not visible in the images.',
  'If a field cannot be determined from the photos, return an empty string or null.',
  'This is AI-assisted screening guidance only, not medical advice.',
].join('\n');

const analysisInstructions = [
  instructions,
  'You are an AI hair analysis assistant.',
  'Return valid JSON only.',
  'Return one JSON object only.',
  'Do not use markdown.',
  'Do not wrap the JSON in code fences.',
  'Do not add explanatory text before or after the JSON.',
  'Use only the current uploaded or captured hair photos as the main basis for the result. Use the questionnaire only as supporting context, not the main basis.',
  'Never reuse or copy prior saved results, prior recommendations, or generic template wording as the current result.',
  'History context, when present, is only for trend comparison and must never replace the current image observations.',
  'Treat each required image role separately and use the correct evidence from that view before deciding the final result.',
  'The Front View Photo and Side Profile Photo together are the only basis for visible root-to-end length assessment. The Hair Ends Close-Up is the main basis for ends condition and split-end evidence.',
  'For every provided required view, return one per_view_notes entry using the exact canonical label: Front View Photo, Side Profile Photo, or Hair Ends Close-Up.',
  'Each per_view_notes entry must describe actual visible evidence from that specific image, not generic statements.',
  'Analyze visible hair condition, visible hair assessment, visible hair color, visible hair length estimate, donation suitability, and improvement recommendations.',
  'Be practical, honest, and evidence-based. Do not invent certainty when the image evidence is weak.',
  'Analyze visible clues such as dryness, oiliness, flakes if visible, frizz, roughness, split or damaged ends, shine or dullness, density appearance, texture appearance, scalp visibility, visible color, and overall healthy or unhealthy appearance.',
  'Do not give generic repeated recommendations unless the visible evidence truly supports them.',
  'Do not let the final result mainly focus on retaking photos, improving lighting, or capture quality. Mention those only briefly when they materially limit confidence.',
  'Use per_view_notes for factual view-specific observations that describe what is actually visible.',
  'Use visible_damage_notes for a concise note about visible damage, or state that no obvious visible damage is seen when appropriate.',
  'detected_color: REQUIRED — always return a non-empty value. Inspect the photos and return the dominant visible hair color from: Black, Dark Brown, Brown, Light Brown, Blonde, Auburn, Red, Dyed (when visible color treatment is present), or Multiple Tones (when clearly mixed colors are visible). Return "Unclear" ONLY when the image is genuinely too dark or blurry to determine color. NEVER return an empty string for this field.',
  'Use detected_condition for the main visible condition. Prefer labels like Healthy, Dry, Oily, Damaged, Mixed Concerns, Frizzy, Dry and Damaged, Dry and Frizzy, or Chemically Treated.',
  'Estimate visible hair length only. Visible hair length means the visible length from the hairline or root area to the lowest clearly visible hair end.',
  'Use the front and side views together to assess visible root-to-end length.',
  'Use length_assessment to explain how the visible root-to-end length was judged from the current images and to state any visibility limits honestly. Mention both the root or hairline area and the visible ends.',
  'Do not invent fake precision when the hair is curled, tied, blocked, cropped, blurry, or lacks reliable scale. Return null when a numeric estimate is not reasonably supported.',
  `Donation suitability must respect the 14-inch rule. Fourteen inches is ${MIN_DONATION_LENGTH_CM} cm.`,
  `Set decision to exactly one of: "${ELIGIBLE_STATUS}" or "${IMPROVE_STATUS}".`,
  `Use "${ELIGIBLE_STATUS}" only when the visible hair length appears at least ${MIN_DONATION_LENGTH_CM} cm, the visible condition appears suitable for donation, and the evidence is clear enough for that judgment.`,
  `Use "${IMPROVE_STATUS}" when the visible length appears below ${MIN_DONATION_LENGTH_CM} cm, the visible condition is not suitable, or the evidence is too limited for confident eligibility.`,
  'If the hair looks healthy but too short for donation, still return "Improve hair condition" and tailor recommendations toward healthy growth, length retention, reduced breakage, and maintaining current hair health.',
  'Questionnaire answers should support interpretation for wash frequency, itch, flakes, oiliness, dryness, hair fall, chemical history, and heat use, but they must not replace the photo evidence.',
  'confidence_score must reflect image clarity, visibility of ends and full length, texture and scalp detail, consistency across views, and consistency with the questionnaire.',
  'Return shine_level, frizz_level, dryness_level, oiliness_level, and damage_level as integers from 1 to 10. These MUST reflect your actual photo observations and MUST be logically consistent with your summary, visible_damage_notes, and detected_condition.',
  'SHINE (positive metric): 1=hair is completely dull and matte, 4-5=moderate shine, 7-9=clearly shiny and lustrous, 10=extremely glossy. If you describe the hair as shiny, healthy, or lustrous anywhere in your response, shine_level MUST be ≥ 6. Do NOT return 1 for shiny-looking hair.',
  'FRIZZ (concern): 1=absolutely no frizz visible at all, 4-5=moderate frizz, 8-10=severe frizz. Use 1 ONLY when zero frizz is visible in any view.',
  'DRYNESS (concern): 1=hair appears well-moisturized with no dryness, 4-5=moderate dryness, 8-10=severely dry and brittle. Use 1 ONLY when hair shows no dryness signs.',
  'OILINESS (concern): 1=scalp and hair are clean and balanced with no oiliness, 4-5=moderate oiliness, 8-10=very greasy. Use 1 ONLY when no oiliness is observed.',
  'DAMAGE (concern): 1=no visible damage, split ends, or breakage whatsoever, 4-5=moderate damage, 8-10=severe damage throughout. Use 1 ONLY when ZERO damage signs exist.',
  'CRITICAL CONSISTENCY RULE: Your numeric levels MUST match your written observations. If your summary says "shiny", shine_level ≥ 6. If your visible_damage_notes say "no visible damage", damage_level ≤ 2. Returning 1 for shine on healthy shiny hair is an error. Returning 1 for all levels on any observed hair is almost always wrong — calibrate each level independently based on what you see.',
  'summary must be concise, human-friendly, and combine image-based observations, questionnaire context, and the final combined assessment.',
  'history_assessment should mention whether the current result appears better, similar, or worse than recent saved checks only when history is provided, while staying grounded in the current images.',
  'recommendations must focus on improving hair condition, maintaining healthy hair, supporting longer healthier growth if the hair is too short, and reducing visible damage.',
  'Return exactly 3 recommendations when hair is visible enough to analyze.',
  'Recommendations should be specific to the observed condition, such as reducing heat exposure, improving scalp care, adjusting wash routine, improving moisture care, trimming damaged ends when appropriate, and avoiding harsh chemical processing.',
  'If the visible hair is too short for donation, include guidance about length retention, healthy growth habits, or reducing breakage. If the hair is dry, recommendations must address dryness. If the hair appears healthy, recommendations must focus on maintenance rather than damage repair.',
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

const normalizeConfidence = (value: unknown) => {
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  if (parsed > 1 && parsed <= 100) return Math.max(0, Math.min(1, parsed / 100));
  return Math.max(0, Math.min(1, parsed));
};

const normalizeLevel10 = (value: unknown, fallback = 1) => {
  const parsed = normalizeNumber(value);
  if (parsed === null) return fallback;
  return Math.max(1, Math.min(10, Math.round(parsed)));
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

const normalizePerViewNotes = (source: unknown) => {
  const rows = Array.isArray(source)
    ? source
      .map((item) => ({
        view: normalizeViewLabel(item?.view),
        clearly_visible: item?.clearly_visible !== false,
        notes: normalizeString(item?.notes),
      }))
      .filter((item) => item.view)
    : [];
  const deduped = new Map<string, { view: string; clearly_visible: boolean; notes: string }>();

  rows.forEach((item) => {
    const existing = deduped.get(item.view);
    if (!existing || item.notes.length > existing.notes.length) {
      deduped.set(item.view, item);
    }
  });

  return Array.from(deduped.values());
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

const buildRequiredViewRoleText = () => (
  requiredViewDefinitions
    .map((view) => `- ${view.label} (${view.key}): ${view.analysisFocus}`)
    .join('\n')
);

const formatProvidedImageRoles = (images: HairImage[] = []) => (
  images
    .map((image, index) => {
      const canonicalLabel = normalizeViewLabel(image.viewLabel || image.viewKey);
      const matchingView = requiredViewDefinitions.find((view) => view.label === canonicalLabel);
      return `${index + 1}. ${canonicalLabel || image.viewLabel || image.viewKey || `Photo ${index + 1}`} -> ${matchingView?.role || 'additional photo view'}`;
    })
    .join('\n')
);

const hasMeaningfulViewEvidence = ({
  isHairDetected,
  providedViews,
  perViewNotes,
}: {
  isHairDetected: boolean;
  providedViews: string[];
  perViewNotes: { view: string; clearly_visible: boolean; notes: string }[];
}) => {
  if (!isHairDetected) return true;

  const evidenceViews = new Set(
    perViewNotes
      .filter((item) => item.notes.length >= 12)
      .map((item) => normalizeViewLabel(item.view))
      .filter(Boolean),
  );

  return providedViews.every((view) => evidenceViews.has(view));
};

const hasRootToEndLengthRationale = (value: string) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;

  const mentionsRootArea = normalized.includes('root') || normalized.includes('hairline');
  const mentionsEnds = normalized.includes('end');
  return mentionsRootArea && mentionsEnds;
};

const buildRecommendationKeywordChecks = ({
  detectedCondition,
  visibleDamageNotes,
  estimatedLength,
  minimumDonationLengthCm,
}: {
  detectedCondition: string;
  visibleDamageNotes: string;
  estimatedLength: number | null;
  minimumDonationLengthCm: number;
}) => {
  const normalizedCondition = detectedCondition.toLowerCase();
  const normalizedDamageNotes = visibleDamageNotes.toLowerCase();
  const checks: string[][] = [];

  if (estimatedLength != null && estimatedLength < minimumDonationLengthCm) {
    checks.push(['length', 'growth', 'retain', 'retention', 'breakage', 'longer', 'grow']);
  }

  if (normalizedCondition.includes('dry')) {
    checks.push(['dry', 'moist', 'hydr', 'condition']);
  }

  if (normalizedCondition.includes('frizz')) {
    checks.push(['frizz', 'smooth', 'humidity', 'serum']);
  }

  if (
    normalizedCondition.includes('damage')
    || normalizedDamageNotes.includes('split')
    || normalizedDamageNotes.includes('fray')
    || normalizedDamageNotes.includes('breakage')
  ) {
    checks.push(['trim', 'split', 'damage', 'repair', 'protein', 'heat', 'breakage']);
  }

  if (normalizedCondition.includes('oily')) {
    checks.push(['oil', 'oily', 'scalp', 'shampoo', 'wash', 'buildup']);
  }

  if (normalizedCondition.includes('healthy') && !(estimatedLength != null && estimatedLength < minimumDonationLengthCm)) {
    checks.push(['maintain', 'maintenance', 'protect', 'preserve', 'continue']);
  }

  if (normalizedCondition.includes('treated')) {
    checks.push(['chemical', 'color-safe', 'protein', 'moisture', 'recover']);
  }

  return checks;
};

const recommendationsAlignWithFindings = ({
  recommendations,
  detectedCondition,
  visibleDamageNotes,
  estimatedLength,
  minimumDonationLengthCm,
}: {
  recommendations: { title: string; recommendation_text: string; priority_order: number }[];
  detectedCondition: string;
  visibleDamageNotes: string;
  estimatedLength: number | null;
  minimumDonationLengthCm: number;
}) => {
  if (!recommendations.length) return false;

  const combinedText = recommendations
    .map((item) => `${item.title} ${item.recommendation_text}`.toLowerCase())
    .join(' ');

  const keywordChecks = buildRecommendationKeywordChecks({
    detectedCondition,
    visibleDamageNotes,
    estimatedLength,
    minimumDonationLengthCm,
  });

  return keywordChecks.every((keywords) => keywords.some((keyword) => combinedText.includes(keyword)));
};

const buildLengthAssessment = ({
  estimatedLength,
  providedViews,
  missingViews,
  isHairDetected,
  perViewNotes,
}: {
  estimatedLength: number | null;
  providedViews: string[];
  missingViews: string[];
  isHairDetected: boolean;
  perViewNotes: { view: string; clearly_visible: boolean; notes: string }[];
}) => {
  if (!isHairDetected) {
    return 'The current images do not clearly show hair, so a visible root-to-end length assessment could not be completed.';
  }

  if (missingViews.length) {
    return `The current images do not show all required views clearly enough to assess visible hair length from the hairline/root area to the hair ends. Missing or unclear views: ${missingViews.join(', ')}.`;
  }

  const relevantNotes = perViewNotes
    .filter((item) => item.notes)
    .slice(0, 2)
    .map((item) => `${item.view}: ${item.notes}`)
    .join(' ');

  if (estimatedLength != null) {
    return [
      `Based on the current uploaded views, the visible hair from the hairline/root area down to the lowest clearly visible ends appears to be about ${estimatedLength.toFixed(1)} cm.`,
      'This estimate is limited to the portion of hair that is clearly visible in the current photos.',
      relevantNotes,
    ].filter(Boolean).join(' ');
  }

  return [
    'The current photos do not show both the hairline/root area and the lowest visible hair ends clearly enough for a reliable numeric root-to-end length estimate.',
    relevantNotes,
  ].filter(Boolean).join(' ');
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
  return Object.keys(analysis).length === 0;
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

  if (
    technicalMessage.includes('api key is not configured')
    || technicalMessage.includes('not configured in edge function secrets')
  ) {
    return {
      status: 500,
      message: 'Hair analysis is not configured on the server right now.',
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
  const normalizedViewNotes = normalizePerViewNotes(analysis?.per_view_notes);
  const estimatedLength = normalizeNumber(analysis?.estimated_length);
  const detectedColor = normalizeString(analysis?.detected_color);
  const detectedTexture = normalizeString(analysis?.detected_texture);
  const detectedDensity = normalizeString(analysis?.detected_density);
  const detectedCondition = normalizeString(analysis?.detected_condition);
  const invalidImageReason = normalizeString(analysis?.invalid_image_reason);
  const visibleDamageNotes = normalizeString(analysis?.visible_damage_notes);
  const confidenceScore = normalizeConfidence(analysis?.confidence_score);
  const rawShineLevel = normalizeLevel10(analysis?.shine_level, detectedCondition.toLowerCase().includes('healthy') ? 7 : 5);
  const rawFrizzLevel = normalizeLevel10(analysis?.frizz_level, detectedCondition.toLowerCase().includes('frizz') ? 8 : 3);
  const rawDrynessLevel = normalizeLevel10(analysis?.dryness_level, detectedCondition.toLowerCase().includes('dry') ? 8 : 3);
  const rawOilinessLevel = normalizeLevel10(analysis?.oiliness_level, detectedCondition.toLowerCase().includes('oily') ? 8 : 2);
  const rawDamageLevel = normalizeLevel10(analysis?.damage_level, detectedCondition.toLowerCase().includes('damage') ? 8 : 3);

  // Correct level values that contradict the AI's own text observations
  const combinedText = [
    normalizeString(analysis?.summary),
    normalizeString(analysis?.visible_damage_notes),
  ].join(' ').toLowerCase();
  const conditionLower = detectedCondition.toLowerCase();

  // Shine: if the AI describes the hair as shiny or healthy but returned a very low shine, correct it
  const aiDescribesShiny = combinedText.includes('shin') || conditionLower.includes('healthy');
  const shineLevel = (rawShineLevel < 5 && aiDescribesShiny) ? Math.max(rawShineLevel, 7) : rawShineLevel;

  // Damage: if the AI explicitly says no visible damage but returned a high damage level, correct it
  const aiDescribesNoDamage = combinedText.includes('no visible damage') || combinedText.includes('no damage') || (conditionLower.includes('healthy') && !combinedText.includes('split') && !combinedText.includes('fray') && !combinedText.includes('breakage'));
  const damageLevel = (rawDamageLevel > 4 && aiDescribesNoDamage) ? Math.min(rawDamageLevel, 2) : rawDamageLevel;

  const frizzLevel = rawFrizzLevel;
  const drynessLevel = rawDrynessLevel;
  const oilinessLevel = rawOilinessLevel;
  const inferredMissingViews = expectedViews.filter((view) => !providedViews.includes(view));
  const missingViews = [...new Set([...inferredMissingViews, ...normalizedMissingViews])];
  const minimumDonationLengthCm = Math.max(
    MIN_DONATION_LENGTH_CM,
    requirementContext?.minimum_hair_length != null ? Number(requirementContext.minimum_hair_length) : 0,
  );
  const lengthAssessment = normalizeString(analysis?.length_assessment);
  const donationReadinessNote = normalizeString(analysis?.donation_readiness_note);
  const historyAssessment = normalizeString(analysis?.history_assessment) || inferHistoryAssessment(
    historyContext,
    detectedCondition,
    estimatedLength,
  );
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
    detected_color: detectedColor || (!isHairDetected ? '' : 'Unclear'),
    detected_texture: detectedTexture || (!isHairDetected ? '' : 'Unclear'),
    detected_density: detectedDensity || (!isHairDetected ? '' : 'Unclear'),
    detected_condition: detectedCondition || (!isHairDetected ? 'Low-confidence image review' : 'Mixed Concerns'),
    visible_damage_notes: visibleDamageNotes,
    confidence_score: confidenceScore,
    shine_level: shineLevel,
    frizz_level: frizzLevel,
    dryness_level: drynessLevel,
    oiliness_level: oilinessLevel,
    damage_level: damageLevel,
    decision,
    summary,
    length_assessment: lengthAssessment || buildLengthAssessment({
      estimatedLength,
      providedViews,
      missingViews,
      isHairDetected,
      perViewNotes: normalizedViewNotes,
    }),
    donation_readiness_note: donationReadinessNote,
    history_assessment: historyAssessment,
    recommendations: normalizedRecommendations,
  };
};

// Extract base64 data from a data URL (strips the "data:mime/type;base64," prefix)
const extractBase64Data = (dataUrl: string): string => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

// Extract MIME type from a data URL
const extractMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] || 'image/jpeg';
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

    const model = Deno.env.get('GOOGLE_AI_HAIR_ANALYSIS_MODEL') || Deno.env.get('GOOGLE_AI_MODEL') || 'gemini-2.5-flash';

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
      hasGoogleAiApiKey: Boolean(Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')),
      model,
    });

    // Build text context
    const textContent = [
      '=== HAIR ANALYSIS REQUEST ===',
      `concern_type: ${concernType}`,
      `screening_intent: ${normalizeString(questionnaireAnswers?.screening_intent) || 'not provided'}`,
      `photo_compliance_acknowledged: ${complianceContext?.acknowledged === true ? 'yes' : 'no'}`,
      '',
      '=== REQUIRED IMAGE ROLES ===',
      buildRequiredViewRoleText(),
      '',
      '=== CURRENT PROVIDED IMAGES ===',
      formatProvidedImageRoles(validImages),
      '',
      '=== STEP 1: INSPECT EACH UPLOADED PHOTO ===',
      'Before generating any output, carefully look at each photo for the following:',
      '- Environment: Is it well-lit? Is it dark/underexposed? Is there a person visible?',
      '- Background: Is there only one person? Are there distracting items behind the subject?',
      '- Required angle: Is the Front View face-forward? Is the Side Profile actually a side profile? Does the Hair Ends Close-Up show the uncovered ends?',
      '- Accessories: Are glasses, sunglasses, masks, face shields, caps, hats, headbands, clips, pins, hair ties, scrunchies, scarves, headphones, hoods, hands, towels, or fabric visible on the face or blocking the hairline, shaft, length, or ends?',
      '- Scalp condition, roots, hair shaft shine or dullness, texture, density, ends condition',
      '- Score levels: shine, frizz, dryness, oiliness, damage from 1-10',
      'Use per_view_notes to record what you observe in each view.',
      '',
      '=== STEP 2: STRUCTURED QUESTIONNAIRE CONTEXT (supporting only) ===',
      'Use questionnaire answers as supporting context - not the primary basis for the result.',
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
      'The current result must come from the current uploaded photos only.',
      'Return one per_view_notes entry for every required current image.',
      `Visible length must be at least ${MIN_DONATION_LENGTH_CM} cm for donation eligibility.`,
      `Use "${ELIGIBLE_STATUS}" only when visible condition is suitable and length appears to meet the 14-inch rule.`,
      `Use "${IMPROVE_STATUS}" when length is too short, condition needs work, or confidence is too low.`,
    ].join('\n');

    // Build Gemini content parts (text + images interleaved)
    const geminiParts: Record<string, unknown>[] = [
      { text: textContent },
    ];

    validImages.forEach((image, index) => {
      geminiParts.push({
        text: `Image ${index + 1}: ${image.viewLabel || image.viewKey || `Photo ${index + 1}`} - examine this photo carefully for the correct required angle, environment quality (lighting, dark areas), subject detection, background, glasses or other face accessories, obstructing hair accessories or objects, scalp condition, hair shine or dullness, texture, density, and ends condition.`,
      });
      geminiParts.push({
        inlineData: {
          mimeType: extractMimeType(image.dataUrl || ''),
          data: extractBase64Data(image.dataUrl || ''),
        },
      });
    });

    const contents = [{ role: 'user', parts: geminiParts }];

    if (geminiParts.length <= 1) {
      return createJsonResponse({ error: 'No valid image payload was provided.' }, 400);
    }

    console.info('[analyze-hair-submission] gemini request prepared', {
      model,
      textPartCount: geminiParts.filter((p) => 'text' in p).length,
      imagePartCount: geminiParts.filter((p) => 'inlineData' in p).length,
      hasQuestionnaireAnswers: Boolean(Object.keys(questionnaireAnswers).length),
      historyEntryCount: Array.isArray(historyContext?.entries) ? historyContext.entries.length : 0,
    });

    const providerResult = await createStructuredResponse({
      model,
      systemInstruction: analysisInstructions,
      responseJsonSchema: analysisSchema,
      maxOutputTokens: 2800,
      temperature: 0.2,
      includeDiagnostics: true,
      contents,
    }) as { parsed: Record<string, unknown>; diagnostics: Record<string, unknown> };

    const result = providerResult?.parsed || {};
    const diagnostics = providerResult?.diagnostics || {
      provider: 'gemini',
      provider_request_attempted: true,
      provider_response_status: null,
      provider_parse_success: false,
      provider_model: model,
    };

    console.info('[analyze-hair-submission] gemini response parsed successfully', {
      model: diagnostics.provider_model,
      responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
      hasAnalysisEnvelope: Boolean(result?.analysis),
      providerResponseStatus: diagnostics.provider_response_status,
      providerParseSuccess: diagnostics.provider_parse_success,
    });

    const rawAnalysisSource = result?.analysis && typeof result.analysis === 'object'
      ? result.analysis
      : result;
    const rawAnalysis = (
      rawAnalysisSource && typeof rawAnalysisSource === 'object' ? rawAnalysisSource : {}
    ) as Record<string, unknown>;

    if (hasIncompleteCriticalAnalysisFields(rawAnalysis)) {
      console.warn('[analyze-hair-submission] incomplete analysis detected', {
        concernType,
        responseKeys: result && typeof result === 'object' ? Object.keys(result) : [],
        usedTopLevelAnalysis: !Boolean(result?.analysis),
        hasSummary: Boolean(normalizeString(rawAnalysis?.summary)),
        hasDetectedColor: Boolean(normalizeString(rawAnalysis?.detected_color)),
        hasLengthAssessment: Boolean(normalizeString(rawAnalysis?.length_assessment)),
        hasDetectedCondition: Boolean(normalizeString(rawAnalysis?.detected_condition)),
        recommendationCount: normalizeRecommendationsV2(rawAnalysis?.recommendations).length,
      });
      const incompleteError = Object.assign(
        new Error('AI returned an incomplete analysis for the current images. Please try the hair analysis again.'),
        { diagnostics },
      );
      throw incompleteError;
    }

    const analysis = normalizeAnalysisPayload(
      rawAnalysis,
      Array.from(providedViews),
      concernType,
      donationRequirementContext,
      questionnaireAnswers,
      historyContext,
    );

    console.info('[analyze-hair-submission] gemini result ready', {
      concernType,
      hasAnalysis: Boolean(analysis),
      isHairDetected: analysis?.is_hair_detected ?? null,
      missingViews: Array.isArray(analysis?.missing_views) ? analysis.missing_views : [],
      decision: analysis?.decision || '',
      detectedColor: analysis?.detected_color || '',
      hasLengthAssessment: Boolean(analysis?.length_assessment),
      recommendationCount: Array.isArray(analysis?.recommendations) ? analysis.recommendations.length : 0,
    });

    return createJsonResponse({
      success: true,
      provider: 'gemini',
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
