import { z } from 'zod';

export const wigRequestSchema = z.object({
  preferredColor: z.string().trim().max(60, 'Use 60 characters or less').optional().or(z.literal('')),
  preferredLength: z.string().trim().max(60, 'Use 60 characters or less').optional().or(z.literal('')),
  notes: z.string().trim().max(400, 'Use 400 characters or less').optional().or(z.literal('')),
});

export const wigRequestDefaultValues = {
  preferredColor: '',
  preferredLength: '',
  notes: '',
};
