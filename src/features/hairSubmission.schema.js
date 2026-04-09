import { z } from 'zod';

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
