// Shared rules for password validation across the app
export const passwordRules = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/,
};

export const commonPasswordBlocklist = [
  'password',
  'password123',
  'password@123',
  'admin123',
  'qwerty123',
  'abc123',
  'welcome123',
  'letmein123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'iloveyou',
];

export const reusedPasswordMessage = 'Please choose a new password that is different from your current password.';

export const normalizePasswordComparable = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

export const isPasswordReuse = (currentPassword, nextPassword) => {
  if (!currentPassword || !nextPassword) return false;
  return String(currentPassword) === String(nextPassword);
};

export const isCommonPassword = (password) => {
  const normalizedPassword = normalizePasswordComparable(password);
  return commonPasswordBlocklist.some((blockedPassword) => normalizePasswordComparable(blockedPassword) === normalizedPassword);
};

export const getPasswordStrengthMessage = (password) => {
  if (!password) return '';
  if (password.length < passwordRules.minLength) return 'Password must be at least 8 characters';
  if (!passwordRules.hasUppercase.test(password)) return 'Must contain at least one uppercase letter';
  if (!passwordRules.hasLowercase.test(password)) return 'Must contain at least one lowercase letter';
  if (!passwordRules.hasNumber.test(password)) return 'Must contain at least one number';
  if (!passwordRules.hasSpecialChar.test(password)) return 'Must contain at least one special character';
  if (password.toLowerCase().includes('password')) return 'Cannot contain the word password';
  if (isCommonPassword(password)) return 'This password is too common. Choose a more unique password';
  return 'Strong password';
};
