// Shared rules for password validation across the app
export const passwordRules = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/,
};

export const getPasswordStrengthMessage = (password) => {
  if (!password) return '';
  if (password.length < passwordRules.minLength) return 'Password must be at least 8 characters';
  if (!passwordRules.hasUppercase.test(password)) return 'Must contain at least one uppercase letter';
  if (!passwordRules.hasLowercase.test(password)) return 'Must contain at least one lowercase letter';
  if (!passwordRules.hasNumber.test(password)) return 'Must contain at least one number';
  if (!passwordRules.hasSpecialChar.test(password)) return 'Must contain at least one special character';
  return 'Strong password';
};
