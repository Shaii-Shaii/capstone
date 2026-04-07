import { z } from 'zod';
import { passwordField, phoneField } from '../auth/validators/auth.schema';
import { isPasswordReuse, reusedPasswordMessage } from '../../utils/passwordRules';

export const optionalTextField = z.string().max(80, 'Too long').optional().or(z.literal(''));

export const profileUpdateSchema = z.object({
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
}).refine((data) => !isPasswordReuse(data.currentPassword, data.newPassword), {
  message: reusedPasswordMessage,
  path: ['newPassword'],
});
