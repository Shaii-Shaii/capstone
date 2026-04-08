import * as AuthAPI from '../api/auth.api';
import { getProfile } from '../../profile/services/profile.service';
import { ensureProfileInfrastructure } from '../../profile/api/profile.api';
import { authMessages } from '../../../constants/auth';
import * as Linking from 'expo-linking';
import { isPasswordReuse, reusedPasswordMessage } from '../../../utils/passwordRules';
import { logAppError, logAppEvent, writeAuditLog } from '../../../utils/appErrors';

const isEmailConfirmed = (user) => Boolean(user?.email_confirmed_at || user?.confirmed_at);

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
    logAppEvent('auth.login', 'Login attempt started.', {
      email,
      expectedRole: expectedRole || null,
    });

    const { data: authData, error } = await AuthAPI.loginWithEmail({ email, password });
    if (error) throw getFriendlyError(error);

    if (!isEmailConfirmed(authData.user)) {
      await AuthAPI.logoutUser();
      const unconfirmedError = new Error('Please verify your email address before logging in.');
      unconfirmedError.code = 'EMAIL_NOT_CONFIRMED';
      throw unconfirmedError;
    }
    
    // Fetch profile to verify role
    let actualRole = null;
    let profile = null;
    
    let { profile: fetchedProfile, error: profileError } = await getProfile(authData.user.id);
    if (profileError && String(profileError).toLowerCase().includes('not linked to an app user record')) {
      const ensureSystemUserResult = await ensureProfileInfrastructure({
        authUserId: authData.user.id,
        email: authData.user.email || email,
        role: authData.user?.user_metadata?.role || null,
      });

      if (ensureSystemUserResult.error) {
        throw new Error(ensureSystemUserResult.error.message || authMessages.roleNotFound);
      }

      const retryProfileResult = await getProfile(authData.user.id);
      fetchedProfile = retryProfileResult.profile;
      profileError = retryProfileResult.error;
    }

    if (!profileError && fetchedProfile) {
      profile = fetchedProfile;
      actualRole = fetchedProfile.role || null;
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

    await writeAuditLog({
      authUserId: authData.user?.id,
      userEmail: authData.user?.email || email,
      action: 'auth.login',
      description: `User logged in as ${actualRole}.`,
      resource: 'auth',
      status: 'success',
    });

    logAppEvent('auth.login', 'Login succeeded.', {
      authUserId: authData.user?.id || null,
      databaseUserId: profile?.user_id || null,
      role: actualRole,
    });

    return { user: authData.user, session: authData.session, profile, role: actualRole, error: null };
  } catch (error) {
    logAppError('auth.login', error, {
      email,
      expectedRole: expectedRole || null,
    });

    await writeAuditLog({
      userEmail: email,
      action: 'auth.login',
      description: error.message || 'Login failed.',
      resource: 'auth',
      status: 'failed',
    });
    return { user: null, session: null, profile: null, role: null, error: error.message, errorCode: error.code };
  }
};


export const register = async (email, password, additionalData = {}) => {
  try {
    logAppEvent('auth.signup', 'Signup attempt started.', {
      email,
      role: additionalData.role || null,
    });

    const metadata = {
      role: additionalData.role,
    };
    
    const { data, error } = await AuthAPI.registerWithEmail({ email, password, metadata });
    if (error) throw getFriendlyError(error);

    if (data?.user && !data?.session && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("This email is already registered. Please log in instead.");
    }

    if (data?.user?.id) {
      const ensureSystemUserResult = await ensureProfileInfrastructure({
        authUserId: data.user.id,
        email: data.user.email || email,
        role: additionalData.role || null,
      });

      if (ensureSystemUserResult.error) {
        throw new Error(ensureSystemUserResult.error.message || authMessages.roleNotFound);
      }
    }

    await writeAuditLog({
      authUserId: data.user?.id,
      userEmail: data.user?.email || email,
      action: 'auth.signup',
      description: `Signup created for ${additionalData.role || 'account'} account.`,
      resource: 'auth',
      status: 'success',
    });

    logAppEvent('auth.signup', 'Signup succeeded.', {
      authUserId: data.user?.id || null,
      role: additionalData.role || null,
    });

    return { user: data.user, session: data.session, error: null };

  } catch (error) {
    logAppError('auth.signup', error, {
      email,
      role: additionalData.role || null,
    });

    await writeAuditLog({
      userEmail: email,
      action: 'auth.signup',
      description: error.message || 'Signup failed.',
      resource: 'auth',
      status: 'failed',
    });
    return { user: null, session: null, error: error.message };
  }
};

export const verifyEmail = async (email, code) => {
  try {
    logAppEvent('auth.verify_email', 'OTP verification attempt started.', {
      email,
      codeLength: String(code || '').trim().length,
    });

    const { data, error } = await AuthAPI.verifyEmailOtp({ email, token: code });
    if (error) throw getFriendlyError(error);
    
    // After verification, check profile for routing
    let profile = null;
    if (data?.user) {
      const ensureSystemUserResult = await ensureProfileInfrastructure({
        authUserId: data.user.id,
        email: data.user.email || email,
        role: data.user.user_metadata?.role || null,
      });

      if (ensureSystemUserResult.error) {
        throw new Error(ensureSystemUserResult.error.message || authMessages.roleNotFound);
      }

      const { profile: fetchedProfile } = await getProfile(data.user.id);
      profile = fetchedProfile;
    }

    await writeAuditLog({
      authUserId: data?.user?.id,
      userEmail: data?.user?.email || email,
      action: 'auth.verify_email',
      description: 'Email verification completed.',
      resource: 'auth',
      status: 'success',
    });

    logAppEvent('auth.verify_email', 'OTP verification succeeded.', {
      authUserId: data?.user?.id || null,
      databaseUserId: profile?.user_id || null,
      role: profile?.role || null,
    });

    return {
      user: data?.user,
      session: data?.session,
      profile,
      role: profile?.role || null,
      error: null,
    };
  } catch (error) {
    logAppError('auth.verify_email', error, {
      email,
      codeLength: String(code || '').trim().length,
    });

    await writeAuditLog({
      userEmail: email,
      action: 'auth.verify_email',
      description: error.message || 'Email verification failed.',
      resource: 'auth',
      status: 'failed',
    });
    return { user: null, session: null, profile: null, role: null, error: error.message };
  }
};

export const resendVerifyEmail = async (email) => {
  try {
    const { error } = await AuthAPI.resendSignupOtp({ email });
    if (error) throw getFriendlyError(error);
    await writeAuditLog({
      userEmail: email,
      action: 'auth.resend_verification',
      description: 'Verification email resent.',
      resource: 'auth',
      status: 'success',
    });
    return { success: true, error: null };
  } catch (error) {
    await writeAuditLog({
      userEmail: email,
      action: 'auth.resend_verification',
      description: error.message || 'Resend verification failed.',
      resource: 'auth',
      status: 'failed',
    });
    return { success: false, error: error.message };
  }
};


export const logout = async () => {
  try {
    const sessionResult = await AuthAPI.getCurrentSession();
    const currentUser = sessionResult.data?.session?.user || null;
    const { error } = await AuthAPI.logoutUser();
    if (error) throw new Error(error.message);

    await writeAuditLog({
      authUserId: currentUser?.id,
      userEmail: currentUser?.email || '',
      action: 'auth.logout',
      description: 'User logged out.',
      resource: 'auth',
      status: 'success',
    });

    return { success: true, error: null };
  } catch (error) {
    await writeAuditLog({
      action: 'auth.logout',
      description: error.message || 'Logout failed.',
      resource: 'auth',
      status: 'failed',
    });
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

    const sessionResult = await AuthAPI.getCurrentSession();
    const currentUser = sessionResult.data?.session?.user || null;
    await writeAuditLog({
      authUserId: currentUser?.id,
      userEmail: currentUser?.email || '',
      action: 'auth.update_password',
      description: 'Password updated successfully.',
      resource: 'auth',
      status: 'success',
    });

    return { success: true, error: null };
  } catch (error) {
    await writeAuditLog({
      action: 'auth.update_password',
      description: error.message || 'Password update failed.',
      resource: 'auth',
      status: 'failed',
    });
    return { success: false, error: error.message };
  }
};
