import { z } from 'zod';
import { birthdateField, nameField, passwordField, phoneField } from '../auth/validators/auth.schema';
import { isPasswordReuse, reusedPasswordMessage } from '../../utils/passwordRules';
import { guardianRelationshipOptions, profileGenderOptions } from '../../constants/profile';

export const optionalTextField = z.string().max(80, 'Too long').optional().or(z.literal(''));
const profileGenderValues = profileGenderOptions.map((option) => option.value);
const guardianRelationshipValues = guardianRelationshipOptions.map((option) => option.value);
const optionalDateField = z.string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Use YYYY-MM-DD format',
  })
  .refine((value) => {
    if (!value) return true;
    const selectedDate = new Date(`${value}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return !Number.isNaN(selectedDate.getTime()) && selectedDate <= today;
  }, {
    message: 'Date cannot be in the future',
  });

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
  first_name: nameField,
  middle_name: optionalTextField,
  last_name: nameField,
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
  medical_condition: z.string().trim().min(1, 'Medical condition is required').max(300, 'Too long'),
  date_of_diagnosis: optionalDateField,
  guardian: optionalTextField,
  guardian_relationship: z.enum(guardianRelationshipValues, {
    errorMap: () => ({ message: 'Guardian relationship is required' }),
  }),
  guardian_relationship_other: optionalTextField,
  guardian_contact_number: phoneField.optional().or(z.literal('')),
  patient_picture: z.union([z.string(), z.object({
    fileBody: z.any().optional(),
    contentType: z.string().optional(),
    fileName: z.string().optional(),
    previewUri: z.string().optional(),
  })]).optional().or(z.literal('')),
  medical_document: z.union([z.string(), z.object({
    fileBody: z.any().optional(),
    contentType: z.string().optional(),
    fileName: z.string().optional(),
    previewUri: z.string().optional(),
  })]).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.guardian_relationship === 'Other' && !String(data.guardian_relationship_other || '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please specify the relationship',
      path: ['guardian_relationship_other'],
    });
  }
});
