import { z } from 'zod';
import { passwordRules } from '../../../utils/passwordRules';

export const calculateAgeFromBirthdate = (birthdate) => {
  if (!birthdate) return null;

  const parsedDate = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - parsedDate.getFullYear();
  const monthDifference = today.getMonth() - parsedDate.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < parsedDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

// Shared Field Rules
export const emailField = z.string().min(1, 'Email is required').email('Invalid email address');

export const passwordField = z.string()
  .min(passwordRules.minLength, `Password must be at least ${passwordRules.minLength} characters`)
  .regex(passwordRules.hasUppercase, 'Password must contain at least one uppercase letter')
  .regex(passwordRules.hasLowercase, 'Password must contain at least one lowercase letter')
  .regex(passwordRules.hasNumber, 'Password must contain at least one number')
  .regex(passwordRules.hasSpecialChar, 'Password must contain at least one special character')
  .refine((value) => !value.toLowerCase().includes('password'), {
    message: 'Password cannot contain the word "password"',
  });

export const nameField = z.string().min(2, 'Must be at least 2 characters').max(50, 'Max 50 characters allowed');
export const phoneField = z.string().min(10, 'Invalid phone number').max(15, 'Invalid phone number');
export const addressField = z.string().trim().min(2, 'This field is required').max(120, 'Max 120 characters allowed');
export const birthdateField = z.string()
  .trim()
  .min(1, 'Birthdate is required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')
  .refine((value) => calculateAgeFromBirthdate(value) !== null, {
    message: 'Enter a valid birthdate',
  })
  .refine((value) => (calculateAgeFromBirthdate(value) ?? 0) >= 18, {
    message: 'You must be at least 18 years old to sign up',
  });
export const coordinateField = z.string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => !value || !Number.isNaN(Number(value)), {
    message: 'Must be a valid coordinate',
  });
const optionalTextField = z.string().trim().max(120, 'Max 120 characters allowed').optional().or(z.literal(''));
const optionalLongTextField = z.string().trim().max(300, 'Max 300 characters allowed').optional().or(z.literal(''));
const optionalNameField = z.union([nameField, z.literal('')]).optional();
const patientAgeField = z.string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => !value || (/^\d+$/.test(value) && Number(value) > 0), {
    message: 'Enter a valid age',
  });

export const signupDefaultValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthdate: '',
  isPatient: '',
  patientFlowMode: '',
  linkedPatientCode: '',
  linkedPatientId: '',
  linkedPatientHospitalId: '',
  linkedPatientName: '',
  linkedPatientCondition: '',
  patientFirstName: '',
  patientMiddleName: '',
  patientLastName: '',
  patientSuffix: '',
  patientAge: '',
  patientGender: '',
  patientMedicalCondition: '',
  patientPicture: '',
  patientMedicalDocument: '',
  street: '',
  barangay: '',
  city: '',
  province: '',
  region: '',
  country: 'Philippines',
  latitude: '',
  longitude: '',
  profilePhoto: '',
  password: '',
  confirmPassword: '',
};

// Login Schemas
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'), // Login doesn't need strict validation checking
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  password: passwordField,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Shared Base Signup Schema
export const baseSignupSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  email: emailField,
  phone: phoneField,
  birthdate: birthdateField,
  isPatient: z.string().trim().min(1, 'Please answer whether you are a patient').refine((value) => ['yes', 'no'].includes(value), {
    message: 'Please answer whether you are a patient',
  }),
  patientFlowMode: z.string().trim().optional().or(z.literal('')),
  linkedPatientCode: optionalTextField,
  linkedPatientId: optionalTextField,
  linkedPatientHospitalId: optionalTextField,
  linkedPatientName: optionalLongTextField,
  linkedPatientCondition: optionalLongTextField,
  patientFirstName: optionalNameField,
  patientMiddleName: optionalTextField,
  patientLastName: optionalNameField,
  patientSuffix: optionalTextField,
  patientAge: patientAgeField,
  patientGender: optionalTextField,
  patientMedicalCondition: optionalLongTextField,
  patientPicture: z.string().optional().or(z.literal('')),
  patientMedicalDocument: z.string().optional().or(z.literal('')),
  street: addressField,
  barangay: addressField,
  city: addressField,
  province: addressField,
  region: addressField,
  country: addressField,
  latitude: coordinateField,
  longitude: coordinateField,
  profilePhoto: z.string().optional().or(z.literal('')),
  password: passwordField,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine((data) => (
  (Boolean(data.latitude) && Boolean(data.longitude)) ||
  (!data.latitude && !data.longitude)
), {
  message: 'Latitude and longitude should both be provided when coordinates are entered manually',
  path: ['longitude'],
}).superRefine((data, ctx) => {
  if (data.isPatient !== 'yes') {
    return;
  }

  if (!['linked', 'manual'].includes(data.patientFlowMode)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Complete the patient code popup or continue with manual patient details.',
      path: ['patientFlowMode'],
    });
  }

  if (data.patientFlowMode === 'linked' && !data.linkedPatientCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please confirm a valid hospital code first.',
      path: ['linkedPatientCode'],
    });
  }

  if (data.patientFlowMode === 'manual') {
    if (!data.patientFirstName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'First name is required',
        path: ['patientFirstName'],
      });
    }

    if (!data.patientLastName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Last name is required',
        path: ['patientLastName'],
      });
    }

    if (!data.patientGender) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Gender is required',
        path: ['patientGender'],
      });
    }

    if (!data.patientMedicalCondition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Medical condition is required',
        path: ['patientMedicalCondition'],
      });
    }
  }
});

// Role-Specific Signup Schemas (can add role-specific fields here later)
export const patientSignupSchema = baseSignupSchema; // Patients might need extra medical consent fields later
export const donorSignupSchema = baseSignupSchema; // Donors might need hair history fields later
export const unifiedSignupSchema = baseSignupSchema;

export const verifyEmailSchema = z.object({
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must only contain numbers'),
});
