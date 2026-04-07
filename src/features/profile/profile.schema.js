import { z } from 'zod';
import { nameField, passwordField, phoneField } from '../auth/validators/auth.schema';

export const optionalTextField = z.string().max(80, 'Too long').optional().or(z.literal(''));
export const optionalDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().or(z.literal(''));

export const profileUpdateSchema = z.object({
  firstName: nameField,
  middleName: optionalTextField,
  lastName: nameField,
  suffix: optionalTextField,
  birthdate: optionalDateField,
  gender: optionalTextField,
  phone: phoneField,
  street: optionalTextField,
  barangay: optionalTextField,
  region: optionalTextField,
  city: optionalTextField,
  province: optionalTextField,
  country: optionalTextField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional().or(z.literal('')),
  newPassword: passwordField,
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
