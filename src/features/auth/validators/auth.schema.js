import { z } from 'zod';
import { passwordRules } from '../../../utils/passwordRules';

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
export const coordinateField = z.string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => !value || !Number.isNaN(Number(value)), {
    message: 'Must be a valid coordinate',
  });

export const signupDefaultValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
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
});

// Role-Specific Signup Schemas (can add role-specific fields here later)
export const patientSignupSchema = baseSignupSchema; // Patients might need extra medical consent fields later
export const donorSignupSchema = baseSignupSchema; // Donors might need hair history fields later

export const verifyEmailSchema = z.object({
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must only contain numbers'),
});
