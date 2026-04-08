import { z } from 'zod';
import { birthdateField, nameField, passwordField, phoneField } from '../auth/validators/auth.schema';
import { isPasswordReuse, reusedPasswordMessage } from '../../utils/passwordRules';
import { profileGenderOptions } from '../../constants/profile';

export const optionalTextField = z.string().max(80, 'Too long').optional().or(z.literal(''));
const profileGenderValues = profileGenderOptions.map((option) => option.value);

export const profileUpdateSchema = z.object({
  firstName: nameField,
  middleName: optionalTextField,
  lastName: nameField,
  suffix: optionalTextField,
  birthdate: birthdateField,
  gender: z.enum(profileGenderValues, {
    errorMap: () => ({ message: 'Gender is required' }),
  }),
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

export const patientOnboardingSchema = z.object({
  medical_condition: z.string().trim().min(1, 'Medical condition is required').max(300, 'Too long'),
  date_of_diagnosis: z.string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: 'Use YYYY-MM-DD format',
    }),
  guardian: optionalTextField,
  guardian_contact_number: phoneField.optional().or(z.literal('')),
  patient_picture: z.string().optional().or(z.literal('')),
  medical_document: z.string().optional().or(z.literal('')),
});
