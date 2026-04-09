import { z } from 'zod';
import { hairAnalyzerConcernTypes } from './hairSubmission.constants';

const buildChoiceSchema = (choices, message) => (
  z.string().trim().min(1, message).refine((value) => choices.includes(value), {
    message,
  })
);

const optionalChoice = z.string().trim().optional().or(z.literal(''));

const normalizeOptionalValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export const hairAnalyzerQuestionSchema = z.object({
  losingHair: buildChoiceSchema(['yes', 'no'], 'Please answer the hair-loss question.'),
  washFrequency: buildChoiceSchema(
    ['daily', 'every_2_3_days', 'once_a_week', 'other'],
    'Please choose how often you wash your hair.'
  ),
  washFrequencyOther: z.string().trim().max(80, 'Please keep the answer short').optional().or(z.literal('')),
  showerWarmth: z.number().int().min(1, 'Select a shower warmth level').max(10, 'Select a shower warmth level'),
  stressLevel: z.number().int().min(1, 'Select a stress level').max(10, 'Select a stress level'),
  familyHairLoss: buildChoiceSchema(['yes', 'no'], 'Please answer the family hair-loss question.'),
  hairLossDuration: optionalChoice,
  hairLossArea: optionalChoice,
  chemicallyTreated: optionalChoice,
  bleached: optionalChoice,
  colored: optionalChoice,
  rebonded: optionalChoice,
  hairCondition: optionalChoice,
  plannedDonationLength: optionalChoice,
}).superRefine((values, context) => {
  if (values.washFrequency === 'other' && !normalizeOptionalValue(values.washFrequencyOther)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['washFrequencyOther'],
      message: 'Please tell us how often you wash your hair.',
    });
  }

  if (values.losingHair === 'yes') {
    if (!normalizeOptionalValue(values.hairLossDuration)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hairLossDuration'],
        message: 'Please tell us how long you have noticed hair loss.',
      });
    }

    if (!normalizeOptionalValue(values.hairLossArea)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hairLossArea'],
        message: 'Please tell us where you notice it most.',
      });
    }
  }

  if (values.losingHair === 'no') {
    [
      ['chemicallyTreated', 'Please answer the chemical treatment question.'],
      ['bleached', 'Please answer the bleaching question.'],
      ['colored', 'Please answer the coloring question.'],
      ['rebonded', 'Please answer the rebonding question.'],
      ['hairCondition', 'Please describe your current hair condition.'],
      ['plannedDonationLength', 'Please choose the hair length you plan to donate.'],
    ].forEach(([field, message]) => {
      if (!normalizeOptionalValue(values[field])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message,
        });
      }
    });
  }
});

export const hairAnalyzerQuestionDefaultValues = {
  losingHair: '',
  washFrequency: '',
  washFrequencyOther: '',
  showerWarmth: 0,
  stressLevel: 0,
  familyHairLoss: '',
  hairLossDuration: '',
  hairLossArea: '',
  chemicallyTreated: '',
  bleached: '',
  colored: '',
  rebonded: '',
  hairCondition: '',
  plannedDonationLength: '',
};

export const resolveHairAnalyzerConcernType = (answers = {}) => (
  answers?.losingHair === 'yes'
    ? hairAnalyzerConcernTypes.hairLoss
    : hairAnalyzerConcernTypes.donationEligibility
);

export const normalizeHairAnalyzerAnswers = (answers = {}) => {
  const concernType = resolveHairAnalyzerConcernType(answers);

  return {
    concern_type: concernType,
    questionnaire_answers: {
      losing_hair: normalizeOptionalValue(answers?.losingHair),
      wash_frequency: normalizeOptionalValue(answers?.washFrequency),
      wash_frequency_other: normalizeOptionalValue(answers?.washFrequencyOther),
      shower_warmth: Number(answers?.showerWarmth) || null,
      stress_level: Number(answers?.stressLevel) || null,
      family_hair_loss: normalizeOptionalValue(answers?.familyHairLoss),
      hair_loss_duration: concernType === hairAnalyzerConcernTypes.hairLoss
        ? normalizeOptionalValue(answers?.hairLossDuration)
        : '',
      hair_loss_area: concernType === hairAnalyzerConcernTypes.hairLoss
        ? normalizeOptionalValue(answers?.hairLossArea)
        : '',
      chemically_treated: concernType === hairAnalyzerConcernTypes.donationEligibility
        ? normalizeOptionalValue(answers?.chemicallyTreated)
        : '',
      bleached: concernType === hairAnalyzerConcernTypes.donationEligibility
        ? normalizeOptionalValue(answers?.bleached)
        : '',
      colored: concernType === hairAnalyzerConcernTypes.donationEligibility
        ? normalizeOptionalValue(answers?.colored)
        : '',
      rebonded: concernType === hairAnalyzerConcernTypes.donationEligibility
        ? normalizeOptionalValue(answers?.rebonded)
        : '',
      hair_condition: concernType === hairAnalyzerConcernTypes.donationEligibility
        ? normalizeOptionalValue(answers?.hairCondition)
        : '',
      planned_donation_length: concernType === hairAnalyzerConcernTypes.donationEligibility
        ? normalizeOptionalValue(answers?.plannedDonationLength)
        : '',
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

export const buildHairReviewDefaultValues = (analysis) => ({
  declaredLength: analysis?.estimated_length != null ? String(analysis.estimated_length) : '',
  declaredTexture: analysis?.detected_texture || '',
  declaredDensity: analysis?.detected_density || '',
  declaredCondition: analysis?.detected_condition || '',
  detailNotes: analysis?.visible_damage_notes || '',
});
