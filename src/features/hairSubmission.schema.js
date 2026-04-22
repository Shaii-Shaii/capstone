import { z } from 'zod';
import { hairAnalyzerConcernTypes } from './hairSubmission.constants';

const normalizeOptionalValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeOptionalArray = (value) => (
  Array.isArray(value)
    ? value.map((item) => normalizeOptionalValue(item)).filter(Boolean)
    : []
);

const yesNoChoices = ['yes', 'no'];
const questionnaireModeChoices = ['first_time', 'returning_follow_up'];
const screeningIntentChoices = ['initial_donation_screening', 'checking_eligibility_first'];
const washFrequencyChoices = ['daily', 'every_2_3_days', '1_2_times_weekly', 'less_often'];
const itchFrequencyChoices = ['never', 'sometimes', 'often'];
const dandruffChoices = ['no', 'a_little', 'a_lot'];
const quickOilinessChoices = ['no', 'sometimes', 'yes'];
const drynessChoices = ['no', 'sometimes', 'yes'];
const hairFallChoices = ['no', 'not_sure', 'yes'];
const heatUseChoices = ['never', 'sometimes', 'often'];
const recommendationFollowThroughChoices = ['yes_consistently', 'sometimes', 'not_yet'];
const hairProgressChoices = ['better', 'same', 'worse', 'not_sure'];
const followUpChangesChoices = [
  'less_dryness',
  'less_oiliness',
  'less_hair_fall',
  'less_dandruff',
  'softer_hair',
  'no_major_change',
  'got_worse',
];
const healthyNowChoices = ['yes', 'no', 'not_sure'];
const routineChangeFocusChoices = [
  'washing_routine',
  'hair_products',
  'reduced_heat_styling',
  'stopped_chemical_treatment',
  'started_scalp_care',
  'other',
];

export const hairAnalyzerQuestionSchema = z.object({
  questionnaireMode: z.string().trim().optional().default('first_time').refine((value) => (
    !value || questionnaireModeChoices.includes(value)
  ), {
    message: 'Questionnaire mode is invalid.',
  }),
  screeningIntent: z.string().trim().optional().default('checking_eligibility_first').refine((value) => (
    !value || screeningIntentChoices.includes(value)
  ), {
    message: 'Please choose the screening purpose.',
  }),
  washFrequency: z.string().trim().optional().default(''),
  scalpItch: z.string().trim().optional().default(''),
  dandruffOrFlakes: z.string().trim().optional().default(''),
  oilyAfterWash: z.string().trim().optional().default(''),
  dryOrRough: z.string().trim().optional().default(''),
  hairFall: z.string().trim().optional().default(''),
  chemicalProcessHistory: z.string().trim().optional().default(''),
  heatUse: z.string().trim().optional().default(''),
  followedPreviousAdvice: z.string().trim().optional().default(''),
  hairConditionProgress: z.string().trim().optional().default(''),
  noticedChanges: z.array(z.string().trim().refine((value) => followUpChangesChoices.includes(value), {
    message: 'Please choose a valid follow-up change.',
  })).optional().default([]),
  heatUseSinceLastCheck: z.string().trim().optional().default(''),
  chemicalTreatmentSinceLastCheck: z.string().trim().optional().default(''),
  routineChangedSinceLastCheck: z.string().trim().optional().default(''),
  routineChangeFocus: z.string().trim().optional().default(''),
  healthierNow: z.string().trim().optional().default(''),
}).superRefine((values, context) => {
  const isReturning = values.questionnaireMode === 'returning_follow_up';

  const requireChoice = (fieldName, choices, message) => {
    const value = normalizeOptionalValue(values[fieldName]);
    if (!value || !choices.includes(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [fieldName],
        message,
      });
    }
  };

  if (isReturning) {
    requireChoice('followedPreviousAdvice', recommendationFollowThroughChoices, 'Please answer whether you followed the previous advice.');
    requireChoice('hairConditionProgress', hairProgressChoices, 'Please answer how your hair feels since the last check.');
    if (!normalizeOptionalArray(values.noticedChanges).length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noticedChanges'],
        message: 'Please choose at least one change you noticed since the last check.',
      });
    }
    requireChoice('heatUseSinceLastCheck', heatUseChoices, 'Please answer the heat styling question.');
    requireChoice('chemicalTreatmentSinceLastCheck', yesNoChoices, 'Please answer the chemical treatment question.');
    requireChoice('routineChangedSinceLastCheck', yesNoChoices, 'Please answer whether your routine changed.');
    if (normalizeOptionalValue(values.routineChangedSinceLastCheck) === 'yes') {
      requireChoice('routineChangeFocus', routineChangeFocusChoices, 'Please choose what changed most in your routine.');
    }
    requireChoice('healthierNow', healthyNowChoices, 'Please answer whether your hair feels healthier now.');
    return;
  }

  requireChoice('washFrequency', washFrequencyChoices, 'Please choose how often you wash your hair.');
  requireChoice('scalpItch', itchFrequencyChoices, 'Please answer the scalp itch question.');
  requireChoice('dandruffOrFlakes', dandruffChoices, 'Please answer the dandruff question.');
  requireChoice('oilyAfterWash', quickOilinessChoices, 'Please answer the scalp oiliness question.');
  requireChoice('dryOrRough', drynessChoices, 'Please answer the dry or rough hair question.');
  requireChoice('hairFall', hairFallChoices, 'Please answer the hair fall question.');
  requireChoice('chemicalProcessHistory', yesNoChoices, 'Please answer the chemical treatment question.');
  requireChoice('heatUse', heatUseChoices, 'Please answer the heat use question.');
});

export const hairAnalyzerQuestionDefaultValues = {
  questionnaireMode: 'first_time',
  screeningIntent: 'checking_eligibility_first',
  washFrequency: '',
  scalpItch: '',
  dandruffOrFlakes: '',
  oilyAfterWash: '',
  dryOrRough: '',
  hairFall: '',
  chemicalProcessHistory: '',
  heatUse: '',
  followedPreviousAdvice: '',
  hairConditionProgress: '',
  noticedChanges: [],
  heatUseSinceLastCheck: '',
  chemicalTreatmentSinceLastCheck: '',
  routineChangedSinceLastCheck: '',
  routineChangeFocus: '',
  healthierNow: '',
};

export const hairAnalyzerComplianceSchema = z.object({
  acknowledged: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm the photo compliance checklist first.' }),
  }),
});

export const hairAnalyzerComplianceDefaultValues = {
  acknowledged: false,
};

export const resolveHairAnalyzerConcernType = () => (
  hairAnalyzerConcernTypes.donationEligibility
);

export const normalizeHairAnalyzerAnswers = (answers = {}) => {
  const questionnaireMode = normalizeOptionalValue(answers?.questionnaireMode) || 'first_time';
  const isReturning = questionnaireMode === 'returning_follow_up';
  const chemicalProcessHistory = normalizeOptionalValue(
    isReturning ? answers?.chemicalTreatmentSinceLastCheck : answers?.chemicalProcessHistory
  );
  const routineChangedSinceLastCheck = normalizeOptionalValue(answers?.routineChangedSinceLastCheck);

  return {
    concern_type: resolveHairAnalyzerConcernType(answers),
    questionnaire_answers: {
      questionnaire_mode: questionnaireMode,
      screening_intent: normalizeOptionalValue(answers?.screeningIntent) || 'checking_eligibility_first',
      wash_frequency: normalizeOptionalValue(answers?.washFrequency),
      scalp_itch: normalizeOptionalValue(answers?.scalpItch),
      dandruff_or_flakes: normalizeOptionalValue(answers?.dandruffOrFlakes),
      oily_after_wash: normalizeOptionalValue(answers?.oilyAfterWash),
      dry_or_rough: normalizeOptionalValue(answers?.dryOrRough),
      hair_fall: normalizeOptionalValue(answers?.hairFall),
      chemical_process_history: chemicalProcessHistory,
      heat_use_frequency: normalizeOptionalValue(answers?.heatUse),
      followed_previous_advice: normalizeOptionalValue(answers?.followedPreviousAdvice),
      hair_condition_progress: normalizeOptionalValue(answers?.hairConditionProgress),
      noticed_changes: normalizeOptionalArray(answers?.noticedChanges).join(', '),
      heat_use_since_last_check: normalizeOptionalValue(answers?.heatUseSinceLastCheck),
      chemical_treatment_since_last_check: normalizeOptionalValue(answers?.chemicalTreatmentSinceLastCheck),
      routine_changed_since_last_check: routineChangedSinceLastCheck,
      routine_change_focus: routineChangedSinceLastCheck === 'yes'
        ? normalizeOptionalValue(answers?.routineChangeFocus)
        : '',
      healthier_now: normalizeOptionalValue(answers?.healthierNow),
      has_treatment_history: chemicalProcessHistory === 'yes' ? 'yes' : 'no',
    },
  };
};

export const hairReviewSchema = z.object({
  declaredLength: z.string().trim().min(1, 'Detected length is required').refine((value) => !Number.isNaN(Number(value)), {
    message: 'Length must be a number',
  }),
  declaredColor: z.string().trim().optional().or(z.literal('')),
  declaredTexture: z.string().trim().min(2, 'Texture is required'),
  declaredDensity: z.string().trim().min(2, 'Density is required'),
  declaredCondition: z.string().trim().min(2, 'Condition is required'),
  detailNotes: z.string().trim().max(400, 'Notes are too long').optional().or(z.literal('')),
});

export const buildHairReviewDefaultValues = (analysis, answers = {}) => ({
  declaredLength: analysis?.estimated_length != null
    ? String(analysis.estimated_length)
    : '',
  declaredColor: analysis?.detected_color || '',
  declaredTexture: analysis?.detected_texture || '',
  declaredDensity: analysis?.detected_density || '',
  declaredCondition: analysis?.detected_condition || '',
  detailNotes: analysis?.visible_damage_notes || '',
});

export const hairResultCorrectionSchema = z.object({
  correctedLengthValue: z.string().trim().min(1, 'Hair length is required').refine((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }, {
    message: 'Length must be a valid number greater than zero',
  }),
  correctedLengthUnit: z.enum(['cm', 'in']),
  correctedTexture: z.string().trim().min(2, 'Texture is required'),
  correctedDensity: z.string().trim().min(2, 'Density is required'),
});

export const buildHairResultCorrectionDefaultValues = (analysis) => ({
  correctedLengthValue: analysis?.estimated_length != null
    ? String(Number(analysis.estimated_length).toFixed(1))
    : '',
  correctedLengthUnit: 'cm',
  correctedTexture: analysis?.detected_texture || '',
  correctedDensity: analysis?.detected_density || '',
});
