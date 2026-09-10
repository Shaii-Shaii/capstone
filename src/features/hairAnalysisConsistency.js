export const HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD = 0.75;

const STRONG_NEGATIVE_EVIDENCE_THRESHOLD = 0.85;
const ADJACENT_CLASSIFICATION_THRESHOLD = 0.9;
const LENGTH_ABSOLUTE_TOLERANCE_INCHES = 1;
const LENGTH_RELATIVE_TOLERANCE = 0.15;
const CM_PER_INCH = 2.54;

const TEXTURE_ORDER = ['straight', 'wavy', 'curly', 'coily'];
const DENSITY_ORDER = ['light', 'medium', 'thick', 'dense'];
const UNDETERMINED_PATTERN = /^(?:unable to determine|cannot be determined|cannot determine|undetermined|unclear|unknown|not visible|not enough information|needs manual (?:hair )?review|n\/a|none)?$/i;

const readable = (value = '') => String(value ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (value = '') => readable(value).replace(/\b\w/g, (character) => character.toUpperCase());
const normalizedAnswerToken = (value = '') => readable(value).toLowerCase().replace(/\s+/g, '_');

const normalizeConfidence = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, normalized));
};

const isDetermined = (value) => Boolean(readable(value)) && !UNDETERMINED_PATTERN.test(readable(value));

const CATEGORY_CONFIG = {
  texture: {
    label: 'Hair texture',
    answerKeys: ['hairTexture', 'hair_texture'],
    relevantPhotoIndex: 0,
    relevantView: 'Back Hair',
  },
  visible_oiliness: {
    label: 'Visible oiliness',
    answerKeys: ['oilyAfterWash', 'oily_after_wash'],
    relevantPhotoIndex: 3,
    relevantView: 'Scalp / Root Area',
  },
  visible_flaking: {
    label: 'Visible scalp flaking',
    answerKeys: ['dandruffOrFlakes', 'dandruff_or_flakes'],
    relevantPhotoIndex: 3,
    relevantView: 'Scalp / Root Area',
  },
  visible_condition: {
    label: 'Visible hair condition',
    answerKeys: ['dryOrRough', 'dry_or_rough'],
    relevantPhotoIndex: 0,
    relevantView: 'Back Hair',
  },
  apparent_density: {
    label: 'Apparent density',
    answerKeys: ['hairDensity', 'hair_density', 'declaredDensity', 'declared_density'],
    relevantPhotoIndex: 3,
    relevantView: 'Scalp / Root Area',
  },
  color: {
    label: 'Visible hair color',
    answerKeys: ['hairColor', 'hair_color', 'declaredColor', 'declared_color'],
    relevantPhotoIndex: 0,
    relevantView: 'Back Hair',
  },
  length: {
    label: 'Visible hair length',
    answerKeys: ['hairLength', 'hair_length', 'declaredLength', 'declared_length'],
    relevantPhotoIndex: 0,
    relevantView: 'Back Hair',
  },
};

const CATEGORY_ALIASES = {
  texture: 'texture',
  hair_texture: 'texture',
  hairtexture: 'texture',
  oiliness: 'visible_oiliness',
  oily: 'visible_oiliness',
  visible_oiliness: 'visible_oiliness',
  oily_after_wash: 'visible_oiliness',
  flaking: 'visible_flaking',
  flakes: 'visible_flaking',
  dandruff: 'visible_flaking',
  visible_flaking: 'visible_flaking',
  dandruff_or_flakes: 'visible_flaking',
  condition: 'visible_condition',
  visible_condition: 'visible_condition',
  dry_or_rough: 'visible_condition',
  density: 'apparent_density',
  apparent_density: 'apparent_density',
  hair_density: 'apparent_density',
  color: 'color',
  hair_color: 'color',
  visible_color: 'color',
  length: 'length',
  hair_length: 'length',
  visible_length: 'length',
};

const normalizeCategory = (item = {}) => {
  const candidates = [item?.category, item?.answer_key, item?.id]
    .map((value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (CATEGORY_ALIASES[candidate]) return CATEGORY_ALIASES[candidate];
    const partialMatch = Object.keys(CATEGORY_ALIASES).find((alias) => candidate.includes(alias));
    if (partialMatch) return CATEGORY_ALIASES[partialMatch];
  }
  return '';
};

const getAnswer = (answers = {}, config = {}) => {
  for (const answerKey of config.answerKeys || []) {
    const value = answers?.[answerKey];
    if (value !== null && value !== undefined && readable(value)) return { answerKey, value };
  }
  return { answerKey: config.answerKeys?.[0] || '', value: '' };
};

const answerLabel = (answerKey, value) => {
  const normalized = normalizedAnswerToken(value);
  const labels = {
    hairTexture: { straight: 'Straight', wavy: 'Wavy', curly: 'Curly', coily: 'Coily' },
    hair_texture: { straight: 'Straight', wavy: 'Wavy', curly: 'Curly', coily: 'Coily' },
    oilyAfterWash: {
      no: 'No quick oiliness reported',
      sometimes: 'Sometimes becomes oily',
      yes: 'Quick oiliness reported',
    },
    oily_after_wash: {
      no: 'No quick oiliness reported',
      sometimes: 'Sometimes becomes oily',
      yes: 'Quick oiliness reported',
    },
    dandruffOrFlakes: {
      no: 'No visible flaking',
      a_little: 'A little visible flaking',
      a_lot: 'A lot of visible flaking',
    },
    dandruff_or_flakes: {
      no: 'No visible flaking',
      a_little: 'A little visible flaking',
      a_lot: 'A lot of visible flaking',
    },
    dryOrRough: {
      normal_balanced: 'Balanced appearance',
      dry: 'Dry appearance',
      rough: 'Rough appearance',
      oily: 'Oily appearance',
    },
    dry_or_rough: {
      normal_balanced: 'Balanced appearance',
      dry: 'Dry appearance',
      rough: 'Rough appearance',
      oily: 'Oily appearance',
    },
  };
  return labels[answerKey]?.[normalized] || titleCase(value) || 'Original answer';
};

const normalizeTexture = (value = '') => {
  const normalized = readable(value).toLowerCase();
  if (normalized.includes('straight')) return 'Straight';
  if (normalized.includes('wavy') || normalized.includes('wave')) return 'Wavy';
  if (normalized.includes('curly') || normalized.includes('curl')) return 'Curly';
  if (normalized.includes('coily') || normalized.includes('coil') || normalized.includes('kinky')) return 'Coily';
  if (normalized.includes('mixed')) return 'Mixed';
  return '';
};

const normalizeDensity = (value = '') => {
  const normalized = readable(value).toLowerCase();
  if (/\b(light|low|thin)\b/.test(normalized)) return 'Light';
  if (/\b(medium|average|moderate)\b/.test(normalized)) return 'Medium';
  if (/\b(thick|high|full)\b/.test(normalized)) return 'Thick';
  if (/\b(dense|very high|very full)\b/.test(normalized)) return 'Dense';
  return '';
};

const normalizeColor = (value = '') => {
  const normalized = readable(value).toLowerCase();
  if (/multiple|multi.?tone|mixed color/.test(normalized)) return 'Multiple Tones';
  if (/dyed|colored|colour/.test(normalized)) return 'Dyed';
  if (/light brown/.test(normalized)) return 'Light Brown';
  if (/dark brown/.test(normalized)) return 'Dark Brown';
  if (/\bblack\b/.test(normalized)) return 'Black';
  if (/\bbrown\b/.test(normalized)) return 'Brown';
  if (/\bblonde?\b/.test(normalized)) return 'Blonde';
  if (/\bauburn\b/.test(normalized)) return 'Auburn';
  if (/\bred\b/.test(normalized)) return 'Red';
  return '';
};

const parseLengthInches = (value, answerKey = '') => {
  const text = readable(value).toLowerCase();
  const numeric = Number.parseFloat(text.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const isCentimeters = /\bcm\b|centimeter/.test(text) || /(?:^|_)cm(?:$|_)/.test(answerKey.toLowerCase());
  return isCentimeters ? numeric / CM_PER_INCH : numeric;
};

const buildEvidenceText = (analysis = {}) => [
  analysis?.length_limit_reason,
  analysis?.summary,
  ...(Array.isArray(analysis?.per_view_notes)
    ? analysis.per_view_notes.map((item) => item?.notes)
    : []),
].map(readable).filter(Boolean).join(' ').toLowerCase();

const hasUnreliableColorEvidence = (analysis = {}) => (
  analysis?.lighting_acceptable === false
  || /poor lighting|low light|underexpos|overexpos|strong (?:color|colour) cast|uneven lighting|lighting (?:is )?(?:poor|unreliable)|color (?:is )?unclear/.test(buildEvidenceText(analysis))
);

const getReportedRows = (analysis = {}) => [
  ...(Array.isArray(analysis?.assessment_consistency) ? analysis.assessment_consistency : []),
  ...(Array.isArray(analysis?.self_assessment_conflicts) ? analysis.self_assessment_conflicts : []),
];

const getReportedRow = (category, analysis = {}) => (
  getReportedRows(analysis).find((item) => normalizeCategory(item) === category) || null
);

const getCategoryConfidence = (category, analysis = {}) => {
  const reported = getReportedRow(category, analysis);
  return normalizeConfidence(reported?.confidence) ?? normalizeConfidence(analysis?.confidence_score);
};

const result = (status, visualFinding, explanation = '', minimumConfidence = HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD) => ({
  status,
  visualFinding,
  explanation,
  minimumConfidence,
});

const evaluateTexture = ({ selfValue, analysis }) => {
  const selfTexture = normalizeTexture(selfValue);
  const visualTexture = normalizeTexture(analysis?.detected_texture || getReportedRow('texture', analysis)?.visual_finding);
  if (!selfTexture || !visualTexture || visualTexture === 'Mixed') {
    return result('unable_to_determine', 'Unable to determine', 'The current views do not show one clear hair pattern reliably enough to compare.');
  }
  if (selfTexture === visualTexture) return result('match', visualTexture);
  const selfIndex = TEXTURE_ORDER.indexOf(selfTexture.toLowerCase());
  const visualIndex = TEXTURE_ORDER.indexOf(visualTexture.toLowerCase());
  const distance = Math.abs(selfIndex - visualIndex);
  return result(
    'mismatch',
    visualTexture,
    `Your current photos appear more consistent with a ${visualTexture.toLowerCase()} hair pattern. Reference examples are used only for visible characteristics, not exact photo matching.`,
    distance === 1 ? ADJACENT_CLASSIFICATION_THRESHOLD : HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD,
  );
};

const evaluateOiliness = ({ selfValue, analysis }) => {
  const self = normalizedAnswerToken(selfValue);
  const reportedFinding = readable(getReportedRow('visible_oiliness', analysis)?.visual_finding).toLowerCase();
  const oiliness = Number(analysis?.oiliness_level);
  const visuallyOily = /visible oil|oily|greas|shiny root/.test(reportedFinding)
    && !/\b(no|not|without)\b/.test(reportedFinding);
  const visuallyNotOily = /no (?:obvious )?visible oil|not oily|without oil/.test(reportedFinding);
  const visualState = visuallyOily || (Number.isFinite(oiliness) && oiliness >= 7)
    ? 'oily'
    : visuallyNotOily || (Number.isFinite(oiliness) && oiliness <= 3)
      ? 'not_oily'
      : '';
  if (!visualState) {
    return result('unable_to_determine', 'Unable to determine', 'The current scalp/root view does not show oiliness clearly enough to compare.');
  }
  const visualFinding = visualState === 'oily' ? 'Visible oiliness near the roots' : 'No obvious visible oiliness';
  if (self === 'sometimes') return result('match', visualFinding);
  if ((self === 'no' && visualState === 'not_oily') || (self === 'yes' && visualState === 'oily')) {
    return result('match', visualFinding);
  }
  return result(
    'mismatch',
    visualFinding,
    visualState === 'oily'
      ? 'The scalp/root photo appears oilier than your answer. Hair appearance can change between washes, so please confirm what should be recorded.'
      : 'The current scalp/root photo does not show obvious oiliness, although oiliness may not always be visible in a photo.',
    visualState === 'not_oily' ? STRONG_NEGATIVE_EVIDENCE_THRESHOLD : HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD,
  );
};

const evaluateFlaking = ({ selfValue, analysis }) => {
  const self = normalizedAnswerToken(selfValue);
  const reportedFinding = readable(getReportedRow('visible_flaking', analysis)?.visual_finding).toLowerCase();
  const reportedAbsent = /no (?:visible )?(?:scalp )?flak|without flak|not detected/.test(reportedFinding);
  const reportedPresent = /flak|flake-like particle|visible particle|buildup/.test(reportedFinding) && !reportedAbsent;
  const hasBooleanFinding = typeof analysis?.dandruff_detected === 'boolean';
  const flakingDetected = reportedPresent || (!reportedAbsent && analysis?.dandruff_detected === true);
  if (!reportedPresent && !reportedAbsent && !hasBooleanFinding) {
    return result('unable_to_determine', 'Unable to determine', 'The scalp/root view does not show flaking clearly enough to compare.');
  }
  const severity = readable(analysis?.dandruff_severity).toLowerCase();
  const visualFinding = flakingDetected
    ? severity === 'heavy' ? 'Heavy visible scalp flaking' : severity === 'mild' ? 'Light visible scalp flaking' : 'Visible scalp flaking'
    : 'No visible scalp flaking detected';
  const selfReportsFlaking = self === 'a_little' || self === 'a_lot' || /visible|flak|yes/.test(self);
  if ((self === 'no' && !flakingDetected) || (selfReportsFlaking && flakingDetected)) return result('match', visualFinding);
  return result(
    'mismatch',
    visualFinding,
    flakingDetected
      ? 'The scalp/root photo contains visible flake-like particles that differ from your answer. This is a visual observation, not a diagnosis.'
      : 'Visible flaking is not clear in the current scalp/root photo. It can change over time, so please confirm your current answer.',
    flakingDetected ? HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD : STRONG_NEGATIVE_EVIDENCE_THRESHOLD,
  );
};

const evaluateCondition = ({ selfValue, analysis }) => {
  const self = normalizedAnswerToken(selfValue);
  const dryness = Number(analysis?.dryness_level);
  const damage = Number(analysis?.damage_level);
  const oiliness = Number(analysis?.oiliness_level);
  const reportedFinding = readable(getReportedRow('visible_condition', analysis)?.visual_finding);
  const condition = readable(analysis?.detected_condition || reportedFinding);
  const evidence = `${condition} ${(analysis?.visible_concerns || []).join(' ')}`.toLowerCase();
  const noConcern = analysis?.visible_condition_status === 'No Visible Concerns Detected'
    || /balanced|no (?:obvious )?visible concern|no visible (?:dry|rough|damage)/.test(evidence);
  const dryVisible = /dry|dull|dehydrat/.test(evidence) || (Number.isFinite(dryness) && dryness >= 7);
  const roughVisible = /rough|brittle|damage|breakage|fray/.test(evidence) || (Number.isFinite(damage) && damage >= 7);
  const oilyVisible = /oil|greas|shiny root/.test(evidence) || (Number.isFinite(oiliness) && oiliness >= 7);
  const visibleConcern = analysis?.visible_condition_status === 'Visible Concerns Detected' || dryVisible || roughVisible || oilyVisible;
  const visualFinding = condition && isDetermined(condition)
    ? condition
    : dryVisible ? 'Visible dryness' : roughVisible ? 'Visible roughness or damage' : oilyVisible ? 'Visible oiliness' : noConcern ? 'No obvious visible concern' : 'Unable to determine';

  if (self === 'normal_balanced') {
    if (visibleConcern) return result('mismatch', visualFinding, 'The full hair views show a meaningful visible difference from the balanced appearance you selected.');
    if (noConcern || (dryness <= 3 && damage <= 3 && oiliness <= 3)) return result('match', 'No obvious visible concern');
  }
  if (self === 'dry') {
    if (dryVisible) return result('match', visualFinding);
    if (roughVisible || oilyVisible) return result('mismatch', visualFinding, 'The current photos show a different visible condition from the dry appearance you selected.', ADJACENT_CLASSIFICATION_THRESHOLD);
    if (noConcern && dryness <= 3) return result('mismatch', visualFinding, 'Obvious dryness is not visible in the current full hair views, although feel and appearance can differ.', STRONG_NEGATIVE_EVIDENCE_THRESHOLD);
  }
  if (self === 'rough') {
    if (roughVisible) return result('match', visualFinding);
    if (dryVisible || oilyVisible) return result('mismatch', visualFinding, 'The current photos show a different visible condition from the rough appearance you selected.', ADJACENT_CLASSIFICATION_THRESHOLD);
    if (noConcern && damage <= 3 && dryness <= 3) return result('mismatch', visualFinding, 'Obvious roughness is not visible in the current full hair views, although feel and appearance can differ.', STRONG_NEGATIVE_EVIDENCE_THRESHOLD);
  }
  if (self === 'oily') {
    if (oilyVisible) return result('match', visualFinding);
    if (dryVisible || roughVisible) return result('mismatch', visualFinding, 'The current photos show a different visible condition from the oily appearance you selected.', ADJACENT_CLASSIFICATION_THRESHOLD);
    if (oiliness <= 3) return result('mismatch', visualFinding, 'Obvious oiliness is not visible in the current photos, although hair appearance can change between washes.', STRONG_NEGATIVE_EVIDENCE_THRESHOLD);
  }
  return result('unable_to_determine', 'Unable to determine', 'The current full hair views do not show this condition clearly enough to compare.');
};

const evaluateDensity = ({ selfValue, analysis }) => {
  const selfDensity = normalizeDensity(selfValue);
  const visualDensity = normalizeDensity(analysis?.detected_density || getReportedRow('apparent_density', analysis)?.visual_finding);
  if (!selfDensity || !visualDensity) return result('unable_to_determine', 'Unable to determine', 'Apparent density cannot be compared reliably from the current views.');
  if (selfDensity === visualDensity) return result('match', `${visualDensity} apparent density`);
  const distance = Math.abs(DENSITY_ORDER.indexOf(selfDensity.toLowerCase()) - DENSITY_ORDER.indexOf(visualDensity.toLowerCase()));
  return result(
    'mismatch',
    `${visualDensity} apparent density`,
    'The current scalp and full-hair views appear to show a different coverage level. This is apparent density from the photos, not a follicle measurement.',
    distance <= 1 ? ADJACENT_CLASSIFICATION_THRESHOLD : HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD,
  );
};

const evaluateColor = ({ selfValue, analysis }) => {
  const selfColor = normalizeColor(selfValue);
  const visualColor = normalizeColor(analysis?.detected_color || getReportedRow('color', analysis)?.visual_finding);
  if (!selfColor || !visualColor || hasUnreliableColorEvidence(analysis)) {
    return result('unable_to_determine', 'Unable to determine', 'Lighting or color visibility is not reliable enough for a hair-color comparison.');
  }
  if (selfColor === visualColor) return result('match', visualColor);
  return result('mismatch', visualColor, 'The visible hair color looks different in the current photos. Lighting can affect color, so please confirm the best current value.', ADJACENT_CLASSIFICATION_THRESHOLD);
};

const evaluateLength = ({ selfValue, answerKey, analysis }) => {
  const selfInches = parseLengthInches(selfValue, answerKey);
  const estimatedCm = Number(analysis?.estimated_length);
  const visualInches = Number.isFinite(estimatedCm) && estimatedCm > 0 ? estimatedCm / CM_PER_INCH : null;
  if (selfInches == null || visualInches == null || analysis?.length_measurable === false) {
    return result('unable_to_determine', 'Unable to determine', 'The current photos do not support a reliable visible-length comparison.');
  }
  const tolerance = Math.max(LENGTH_ABSOLUTE_TOLERANCE_INCHES, selfInches * LENGTH_RELATIVE_TOLERANCE);
  const visualFinding = `Approximately ${visualInches.toFixed(1)} inches`;
  if (Math.abs(selfInches - visualInches) <= tolerance) return result('match', visualFinding);
  return result('mismatch', visualFinding, 'The visible length estimate differs meaningfully from the supplied length. Small photo-estimation differences are treated as a match.', ADJACENT_CLASSIFICATION_THRESHOLD);
};

const EVALUATORS = {
  texture: evaluateTexture,
  visible_oiliness: evaluateOiliness,
  visible_flaking: evaluateFlaking,
  visible_condition: evaluateCondition,
  apparent_density: evaluateDensity,
  color: evaluateColor,
  length: evaluateLength,
};

export const buildHairAnalysisConsistencyResults = ({ answers = {}, analysis = {} } = {}) => (
  Object.entries(CATEGORY_CONFIG).map(([category, config]) => {
    const { answerKey, value: originalAnswer } = getAnswer(answers, config);
    if (!readable(originalAnswer)) return null;
    const reported = getReportedRow(category, analysis);
    const confidence = getCategoryConfidence(category, analysis);
    const evaluation = reported?.unable_to_determine === true
      ? result(
        'unable_to_determine',
        'Unable to determine',
        readable(reported?.explanation) || 'The photo evidence is not reliable enough to compare this answer.',
      )
      : EVALUATORS[category]({ selfValue: originalAnswer, answerKey, analysis });
    const hasEnoughConfidence = confidence != null && confidence >= evaluation.minimumConfidence;
    const finalStatus = evaluation.status === 'mismatch' && !hasEnoughConfidence
      ? 'unable_to_determine'
      : evaluation.status;

    return {
      id: category,
      category,
      categoryLabel: config.label,
      answerKey,
      relevantPhotoIndex: config.relevantPhotoIndex,
      relevantView: readable(reported?.relevant_view) || config.relevantView,
      originalAnswer,
      donorAnswer: answerLabel(answerKey, originalAnswer),
      visualFinding: finalStatus === 'unable_to_determine' ? 'Unable to determine' : evaluation.visualFinding,
      confidence,
      consistency: finalStatus,
      requiresConfirmation: finalStatus === 'mismatch',
      explanation: finalStatus === 'unable_to_determine'
        ? evaluation.explanation || 'The photo evidence is not reliable enough to compare this answer.'
        : evaluation.explanation,
    };
  }).filter(Boolean)
);

export const buildHairAnalysisConsistencyIssues = (input = {}) => (
  buildHairAnalysisConsistencyResults(input).filter((item) => item.requiresConfirmation)
);

export const buildConsistencyRecord = ({ answers = {}, analysis = {}, issues = [], resolutions = {} } = {}) => {
  const categoryResults = buildHairAnalysisConsistencyResults({ answers, analysis });
  const conflicts = issues.map((issue) => {
    const resolution = resolutions[issue.id] || 'not_reviewed';
    const keptOriginal = resolution === 'keep_original_answer';
    return {
      id: issue.id,
      category: issue.category,
      answer_key: issue.answerKey,
      original_self_assessment: issue.originalAnswer,
      original_self_assessment_label: issue.donorAnswer,
      ai_visual_finding: issue.visualFinding,
      visual_confidence: issue.confidence,
      consistency: 'mismatch',
      relevant_view: issue.relevantView,
      resolution,
      resolved_value: keptOriginal ? issue.donorAnswer : issue.visualFinding,
      resolution_source: keptOriginal ? 'self_reported' : 'ai_visual_finding',
    };
  });

  return {
    checked_at: new Date().toISOString(),
    confidence_threshold: HAIR_ANALYSIS_CONSISTENCY_CONFIDENCE_THRESHOLD,
    original_answers: { ...answers },
    category_results: categoryResults.map((item) => ({
      category: item.category,
      answer_key: item.answerKey,
      self_assessment: item.originalAnswer,
      ai_visual_finding: item.visualFinding,
      consistency: item.consistency,
      requires_confirmation: item.requiresConfirmation,
      confidence: item.confidence,
      relevant_view: item.relevantView,
    })),
    ai_visible_findings: {
      estimated_length: analysis?.estimated_length ?? null,
      detected_color: analysis?.detected_color || '',
      detected_texture: analysis?.detected_texture || '',
      detected_density: analysis?.detected_density || '',
      detected_condition: analysis?.detected_condition || '',
      visible_condition_status: analysis?.visible_condition_status || '',
      visible_concerns: Array.isArray(analysis?.visible_concerns) ? analysis.visible_concerns : [],
      oiliness_level: analysis?.oiliness_level ?? null,
      dryness_level: analysis?.dryness_level ?? null,
      damage_level: analysis?.damage_level ?? null,
      visible_flaking_detected: analysis?.dandruff_detected === true,
      assessment_consistency: Array.isArray(analysis?.assessment_consistency)
        ? analysis.assessment_consistency
        : [],
    },
    conflicts,
    user_confirmed_resolutions: conflicts.reduce((current, conflict) => ({
      ...current,
      [conflict.category]: conflict.resolution,
    }), {}),
    resolved_values: conflicts.reduce((current, conflict) => ({
      ...current,
      [conflict.category]: conflict.resolved_value,
    }), {}),
    result_policy: 'AI visual findings remain unchanged; donor confirmations are stored separately.',
  };
};
