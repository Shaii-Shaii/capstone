import { z } from 'zod';

export const wigRequestSchema = z.object({
  preferredColor: z.string().trim().max(60, 'Use 60 characters or less').optional().or(z.literal('')),
  preferredLength: z.string().trim().max(60, 'Use 60 characters or less').optional().or(z.literal('')),
  hairTexture: z.string().trim().max(60, 'Use 60 characters or less').optional().or(z.literal('')),
  capSize: z.string().trim().max(60, 'Use 60 characters or less').optional().or(z.literal('')),
  stylePreference: z.string().trim().max(80, 'Use 80 characters or less').optional().or(z.literal('')),
  specialNotes: z.string().trim().max(400, 'Use 400 characters or less').optional().or(z.literal('')),
  acceptedTerms: z.boolean().optional(),
});

export const wigRequestDefaultValues = {
  preferredColor: '',
  preferredLength: '',
  hairTexture: '',
  capSize: '',
  stylePreference: '',
  specialNotes: '',
  acceptedTerms: false,
};
