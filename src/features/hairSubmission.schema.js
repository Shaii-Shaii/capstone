import { z } from 'zod';
import { hairAnalyzerConcernTypes } from './hairSubmission.constants';

const buildChoiceSchema = (choices, message) => (
  z.string().trim().min(1, message).refine((value) => choices.includes(value), {
    message,
  })
);

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
const screeningIntentChoices = ['initial_donation_screening', 'checking_eligibility_first'];
const treatmentChoices = ['rebonded', 'permed', 'relaxed', 'keratin_treated', 'hair_botox', 'others', 'none'];
const colorStatusChoices = ['no', 'colored', 'bleached', 'both'];
const hairConditionChoices = ['healthy', 'slightly_dry', 'dry', 'damaged'];
const washFrequencyWeeklyChoices = ['1_2_times', '3_4_times', '5_6_times', 'daily'];
const heatStylingChoices = ['never', 'rarely', 'sometimes', 'often'];

export const hairAnalyzerQuestionSchema = z.object({
  screeningIntent: buildChoiceSchema(screeningIntentChoices, 'Please choose the screening purpose.'),
  estimatedHairLengthInches: z.string().trim().min(1, 'Please enter your estimated hair length.').refine((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }, {
    message: 'Please enter a valid hair length in inches.',
  }),
  chemicalTreatments: z.array(z.string()).min(1, 'Please choose at least one treatment option.').refine((values) => (
    values.every((item) => treatmentChoices.includes(item))
  ), {
    message: 'Please use the available treatment options only.',
  }),
  treatmentTiming: z.string().trim().optional().or(z.literal('')),
  colorStatus: buildChoiceSchema(colorStatusChoices, 'Please choose whether your hair was colored or bleached.'),
  colorTiming: z.string().trim().optional().or(z.literal('')),
  hairCondition: buildChoiceSchema(hairConditionChoices, 'Please describe your current hair condition.'),
  splitEnds: buildChoiceSchema(yesNoChoices, 'Please answer the split ends question.'),
  shedding: buildChoiceSchema(yesNoChoices, 'Please answer the shedding question.'),
  washFrequencyWeekly: buildChoiceSchema(washFrequencyWeeklyChoices, 'Please choose how often you wash your hair in a week.'),
  heatStylingFrequency: buildChoiceSchema(heatStylingChoices, 'Please choose how often you use heat styling tools.'),
}).superRefine((values, context) => {
  const normalizedTreatments = normalizeOptionalArray(values.chemicalTreatments);
  const hasTreatmentHistory = normalizedTreatments.some((item) => item !== 'none');

  if (normalizedTreatments.includes('none') && normalizedTreatments.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chemicalTreatments'],
      message: 'Choose either "None" or the treatment types that apply.',
    });
  }

  if (hasTreatmentHistory && !normalizeOptionalValue(values.treatmentTiming)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['treatmentTiming'],
      message: 'Please tell us when the treatment was done.',
    });
  }

  if (values.colorStatus !== 'no' && !normalizeOptionalValue(values.colorTiming)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['colorTiming'],
      message: 'Please tell us when the hair was last colored or bleached.',
    });
  }
});

export const hairAnalyzerQuestionDefaultValues = {
  screeningIntent: '',
  estimatedHairLengthInches: '',
  chemicalTreatments: [],
  treatmentTiming: '',
  colorStatus: '',
  colorTiming: '',
  hairCondition: '',
  splitEnds: '',
  shedding: '',
  washFrequencyWeekly: '',
  heatStylingFrequency: '',
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
  const normalizedTreatments = normalizeOptionalArray(answers?.chemicalTreatments);
  const hasTreatmentHistory = normalizedTreatments.some((item) => item !== 'none');
  const estimatedHairLengthInches = Number(answers?.estimatedHairLengthInches);

  return {
    concern_type: resolveHairAnalyzerConcernType(answers),
    questionnaire_answers: {
      screening_intent: normalizeOptionalValue(answers?.screeningIntent),
      estimated_hair_length_inches: Number.isFinite(estimatedHairLengthInches) ? estimatedHairLengthInches : null,
      chemical_treatments: normalizedTreatments,
      has_treatment_history: hasTreatmentHistory ? 'yes' : 'no',
      treatment_timing: hasTreatmentHistory ? normalizeOptionalValue(answers?.treatmentTiming) : '',
      color_status: normalizeOptionalValue(answers?.colorStatus),
      color_timing: normalizeOptionalValue(answers?.colorStatus) !== 'no'
        ? normalizeOptionalValue(answers?.colorTiming)
        : '',
      hair_condition: normalizeOptionalValue(answers?.hairCondition),
      split_ends: normalizeOptionalValue(answers?.splitEnds),
      shedding: normalizeOptionalValue(answers?.shedding),
      wash_frequency_weekly: normalizeOptionalValue(answers?.washFrequencyWeekly),
      heat_styling_frequency: normalizeOptionalValue(answers?.heatStylingFrequency),
    },
  };
};

export const hairReviewSchema = z.object({
  declaredLength: z.string().trim().min(1, 'Confirmed length is required').refine((value) => !Number.isNaN(Number(value)), {
    message: 'Length must be a number',
  }),
  declaredTexture: z.string().trim().min(2, 'Texture is required'),
  declaredDensity: z.string().trim().min(2, 'Density is required'),
  declaredCondition: z.string().trim().min(2, 'Condition is required'),
  detailNotes: z.string().trim().max(400, 'Notes are too long').optional().or(z.literal('')),
});

export const buildHairReviewDefaultValues = (analysis, answers = {}) => ({
  declaredLength: analysis?.estimated_length != null
    ? String(analysis.estimated_length)
    : normalizeOptionalValue(answers?.estimatedHairLengthInches),
  declaredTexture: analysis?.detected_texture || '',
  declaredDensity: analysis?.detected_density || '',
  declaredCondition: analysis?.detected_condition || normalizeOptionalValue(answers?.hairCondition),
  detailNotes: analysis?.visible_damage_notes || '',
});
