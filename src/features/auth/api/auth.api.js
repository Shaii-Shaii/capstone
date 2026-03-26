import { supabase } from '../../../api/supabase/client';

/**
 * Low-level Supabase Auth calls
 * No business logic should reside here
 */

export const loginWithEmail = async ({ email, password }) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

export const registerWithEmail = async ({ email, password, metadata }) => {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    }
  });
};

export const logoutUser = async () => {
  return await supabase.auth.signOut();
};

export const getCurrentSession = async () => {
  return await supabase.auth.getSession();
};

export const sendPasswordResetEmail = async ({ email, redirectTo }) => {
  return await supabase.auth.resetPasswordForEmail(email, { redirectTo });
};

export const updateUserPassword = async ({ newPassword }) => {
  // Update the user's password directly (requires an active authenticated session from the deep link)
  return await supabase.auth.updateUser({ password: newPassword });
};

export const verifyEmailOtp = async ({ email, token }) => {
  // type: 'signup' is correct for OTP-based email confirmation after signUp()
  // type: 'email' is only for magic-link (passwordless) OTPs — do not use here
  return await supabase.auth.verifyOtp({ email, token, type: 'signup' });
};

export const resendSignupOtp = async ({ email }) => {
  // No emailRedirectTo needed — this is OTP-based, not link-based
  return await supabase.auth.resend({
    type: 'signup',
    email,
  });
};

