import * as AuthAPI from '../api/auth.api';
import { getProfile } from '../../profile/services/profile.service';
import { authMessages } from '../../../constants/auth';
import * as Linking from 'expo-linking';
import { isPasswordReuse, reusedPasswordMessage } from '../../../utils/passwordRules';

/**
 * Helper to translate raw Supabase errors into human-friendly strings
 */
const getFriendlyError = (error) => {
  const msg = error.message || '';
  if (msg.toLowerCase().includes('invalid login credentials')) {
    return new Error("Invalid email or password. Please try again.");
  }
  if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already exists')) {
    return new Error("This email is already registered. Please log in instead.");
  }
  if (msg.toLowerCase().includes('email not confirmed')) {
    // Specifically tag this error so the UI can prompt for verification
    const err = new Error("Please verify your email address before logging in.");
    err.code = 'EMAIL_NOT_CONFIRMED';
    return err;
  }
  if (msg.toLowerCase().includes('same password')) {
    return new Error(reusedPasswordMessage);
  }
  if (msg.toLowerCase().includes('new password should be different')) {
    return new Error(reusedPasswordMessage);
  }
  if (msg.toLowerCase().includes('weak password')) {
    return new Error('Your new password is too weak. Use uppercase, lowercase, numbers, and a special character.');
  }
  if (msg.toLowerCase().includes('reauthentication') || msg.toLowerCase().includes('re-authentication')) {
    return new Error('For security, please reauthenticate before changing your password.');
  }
  if (msg.toLowerCase().includes('auth session missing')) {
    return new Error('Your session is no longer active. Please log in again and retry the password change.');
  }
  return new Error(msg);
};


/**
 * Business logic layer for Auth
 * Handles errors, shapes responses, and triggers related processes
 */

export const login = async (email, password, expectedRole) => {
  try {
    const { data: authData, error } = await AuthAPI.loginWithEmail({ email, password });
    if (error) throw getFriendlyError(error);
    
    // Fetch profile to verify role
    let actualRole = authData.user?.user_metadata?.role;
    let profile = null;
    
    const { profile: fetchedProfile, error: profileError } = await getProfile(authData.user.id);
    if (!profileError && fetchedProfile) {
      profile = fetchedProfile;
      actualRole = fetchedProfile.role || actualRole;
    }

    if (!actualRole) {
      await AuthAPI.logoutUser();
      throw new Error(authMessages.roleNotFound);
    }

    if (expectedRole && actualRole && actualRole !== expectedRole) {
      // Force signout to block wrong-role access session persistence
      await AuthAPI.logoutUser();
      throw new Error(`This account is registered as a ${actualRole}. Please continue through the ${actualRole} login.`);
    }

    return { user: authData.user, session: authData.session, profile, role: actualRole, error: null };
  } catch (error) {
    return { user: null, session: null, profile: null, role: null, error: error.message, errorCode: error.code };
  }
};


export const register = async (email, password, additionalData = {}) => {
  try {
    const metadata = {
      role: additionalData.role,
      first_name: additionalData.firstName,
      last_name: additionalData.lastName,
      birthdate: additionalData.birthdate,
      phone: additionalData.phone,
      street: additionalData.street,
      barangay: additionalData.barangay,
      city: additionalData.city,
      province: additionalData.province,
      region: additionalData.region,
      country: additionalData.country,
      latitude: additionalData.latitude ? Number(additionalData.latitude) : null,
      longitude: additionalData.longitude ? Number(additionalData.longitude) : null,
    };
    
    const { data, error } = await AuthAPI.registerWithEmail({ email, password, metadata });
    if (error) throw getFriendlyError(error);

    if (data?.user && !data?.session && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("This email is already registered. Please log in instead.");
    }

    return { user: data.user, session: data.session, error: null };

  } catch (error) {
    return { user: null, session: null, error: error.message };
  }
};

export const verifyEmail = async (email, code) => {
  try {
    const { data, error } = await AuthAPI.verifyEmailOtp({ email, token: code });
    if (error) throw getFriendlyError(error);
    
    // After verification, check profile for routing
    let profile = null;
    if (data?.user) {
      const { profile: fetchedProfile } = await getProfile(data.user.id);
      profile = fetchedProfile;
    }

    return {
      user: data?.user,
      session: data?.session,
      profile,
      role: profile?.role || data?.user?.user_metadata?.role || null,
      error: null,
    };
  } catch (error) {
    return { user: null, session: null, profile: null, role: null, error: error.message };
  }
};

export const resendVerifyEmail = async (email) => {
  try {
    const { error } = await AuthAPI.resendSignupOtp({ email });
    if (error) throw getFriendlyError(error);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};


export const logout = async () => {
  try {
    const { error } = await AuthAPI.logoutUser();
    if (error) throw new Error(error.message);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const getCurrentSessionStatus = async () => {
  try {
    const { data, error } = await AuthAPI.getCurrentSession();
    if (error) throw getFriendlyError(error);
    return { session: data?.session || null, error: null };
  } catch (error) {
    return { session: null, error: error.message };
  }
};

export const sendPasswordReset = async (email) => {
  try {
    const redirectTo = Linking.createURL('/auth/reset-password');
    const { error } = await AuthAPI.sendPasswordResetEmail({ email, redirectTo });
    if (error) throw getFriendlyError(error);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const updatePassword = async (payload) => {
  try {
    const normalizedPayload = typeof payload === 'string'
      ? { newPassword: payload, currentPassword: '' }
      : (payload || {});
    const { newPassword, currentPassword } = normalizedPayload;

    if (isPasswordReuse(currentPassword, newPassword)) {
      throw new Error(reusedPasswordMessage);
    }

    const { error } = await AuthAPI.updateUserPassword({ newPassword });
    if (error) throw getFriendlyError(error);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
