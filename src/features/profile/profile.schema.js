import { z } from 'zod';
import { nameField, passwordField, phoneField } from '../auth/validators/auth.schema';

export const optionalTextField = z.string().max(80, 'Too long').optional().or(z.literal(''));

export const profileUpdateSchema = z.object({
  firstName: nameField,
  middleName: optionalTextField,
  lastName: nameField,
  phone: phoneField,
  city: optionalTextField,
  province: optionalTextField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional().or(z.literal('')),
  newPassword: passwordField,
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
