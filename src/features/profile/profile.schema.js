import { z } from 'zod';
import { birthdateField, coordinateField, nameField, passwordField, phoneField } from '../auth/validators/auth.schema';
import { isPasswordReuse, reusedPasswordMessage } from '../../utils/passwordRules';
import { profileGenderOptions } from '../../constants/profile';

const normalizeStringInput = (value) => {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
};
const normalizePhoneComparable = (value) => String(value || '').replace(/\D/g, '');

const requiredStringField = (schema) => z.preprocess(normalizeStringInput, schema);
const optionalStringField = (schema) => z.preprocess(normalizeStringInput, schema.optional().or(z.literal('')));

export const optionalTextField = optionalStringField(z.string().max(80, 'Too long'));
const profileGenderValues = profileGenderOptions.map((option) => option.value);
const requiredDateField = (requiredMessage) => requiredStringField(z.string()
  .trim()
  .min(1, requiredMessage)
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Use YYYY-MM-DD format',
  })
  .refine((value) => {
    const selectedDate = new Date(`${value}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return !Number.isNaN(selectedDate.getTime()) && selectedDate <= today;
  }, {
    message: 'Date cannot be in the future',
  }));

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
  first_name: requiredStringField(nameField),
  middle_name: optionalTextField,
  last_name: requiredStringField(nameField),
  suffix: optionalTextField,
  birthdate: requiredStringField(birthdateField),
  gender: z.enum(profileGenderValues, {
    errorMap: () => ({ message: 'Gender is required' }),
  }),
  contact_number: requiredStringField(phoneField),
  street: optionalTextField,
  barangay: optionalTextField,
  region: optionalTextField,
  city: optionalTextField,
  province: optionalTextField,
  country: optionalTextField,
  latitude: optionalStringField(coordinateField),
  longitude: optionalStringField(coordinateField),
  medical_condition: requiredStringField(z.string().trim().min(1, 'Medical condition is required').max(300, 'Too long')),
  date_of_diagnosis: requiredDateField('Date of diagnosis is required'),
  guardian: requiredStringField(z.string().trim().min(1, 'Guardian is required').max(80, 'Too long')),
  guardian_relationship: requiredStringField(
    z.string().trim().min(1, 'Guardian relationship is required').max(80, 'Too long')
  ),
  guardian_contact_number: requiredStringField(phoneField),
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
  const contactNumber = normalizePhoneComparable(data.contact_number);
  const guardianContactNumber = normalizePhoneComparable(data.guardian_contact_number);

  if (contactNumber && guardianContactNumber && contactNumber === guardianContactNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Guardian contact number must be different from your contact number',
      path: ['guardian_contact_number'],
    });
  }
});
