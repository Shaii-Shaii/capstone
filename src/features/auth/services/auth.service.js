import * as AuthAPI from '../api/auth.api';
import { getProfile } from '../../profile/services/profile.service';
import { ensureProfileInfrastructure, fetchSystemUserByAuthUserId } from '../../profile/api/profile.api';
import { authMessages } from '../../../constants/auth';
import * as Linking from 'expo-linking';
import { isPasswordReuse, reusedPasswordMessage } from '../../../utils/passwordRules';
import { logAppError, logAppEvent, writeAuditLog } from '../../../utils/appErrors';
import { loginThemeFallback } from '../../../design-system/theme';

const isEmailConfirmed = (user) => Boolean(user?.email_confirmed_at || user?.confirmed_at);
const loginErrorCodes = {
  emailNotConfirmed: 'EMAIL_NOT_CONFIRMED',
  accountDetailsMissing: 'ACCOUNT_DETAILS_MISSING',
  accountInactive: 'ACCOUNT_INACTIVE',
  accessNotStarted: 'ACCESS_NOT_STARTED',
  accessExpired: 'ACCESS_EXPIRED',
  network: 'NETWORK_ERROR',
  accountLoadFailed: 'ACCOUNT_LOAD_FAILED',
  unexpected: 'UNEXPECTED_ERROR',
};

const normalizeVisualValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const toTimestamp = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const isNetworkErrorMessage = (message) => {
  const normalized = String(message || '').trim().toLowerCase();
  return (
    normalized.includes('network request failed')
    || normalized.includes('failed to fetch')
    || normalized.includes('fetch failed')
    || normalized.includes('networkerror')
    || normalized.includes('timeout')
    || normalized.includes('timed out')
    || normalized.includes('internet')
    || normalized.includes('offline')
    || normalized.includes('connection')
  );
};

const buildUserFacingLoginError = (message, code = loginErrorCodes.unexpected) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const getFriendlyAuthError = (error) => {
  const msg = String(error?.message || '').trim();
  const normalized = msg.toLowerCase();

  if (normalized.includes('invalid login credentials') || normalized.includes('invalid credentials')) {
    return buildUserFacingLoginError('Incorrect email or password.');
  }
  if (normalized.includes('email not confirmed')) {
    return buildUserFacingLoginError('Please verify your email address before logging in.', loginErrorCodes.emailNotConfirmed);
  }
  if (isNetworkErrorMessage(normalized)) {
    return buildUserFacingLoginError('We could not connect right now. Please check your internet and try again.', loginErrorCodes.network);
  }

  return buildUserFacingLoginError('Something went wrong. Please try again.');
};

const validateSystemUserAccount = (systemUser) => {
  if (!systemUser?.user_id) {
    return buildUserFacingLoginError('We could not find your account details.', loginErrorCodes.accountDetailsMissing);
  }

  if (systemUser.is_active === false) {
    return buildUserFacingLoginError('Your account is currently inactive.', loginErrorCodes.accountInactive);
  }

  const now = Date.now();
  const accessStart = toTimestamp(systemUser.access_start);
  const accessEnd = toTimestamp(systemUser.access_end);

  if (accessStart && accessStart > now) {
    return buildUserFacingLoginError('Your account access has not started yet.', loginErrorCodes.accessNotStarted);
  }

  if (accessEnd && accessEnd < now) {
    return buildUserFacingLoginError('Your account access has already expired.', loginErrorCodes.accessExpired);
  }

  return null;
};

const resolveRoleMismatchError = (actualRole) => (
  buildUserFacingLoginError(`This account is registered as a ${actualRole}. Please continue through the ${actualRole} login.`)
);

const resolveVisualTheme = ({ uiSettings = {}, preset = {} } = {}) => {
  const fallback = loginThemeFallback;
  const resolved = {
    brandName: normalizeVisualValue(uiSettings.brand_name) || fallback.brandName,
    brandTagline: normalizeVisualValue(uiSettings.brand_tagline) || fallback.brandTagline,
    logoIcon: normalizeVisualValue(uiSettings.logo_icon) || fallback.logoIcon,
    loginBackgroundPhoto: normalizeVisualValue(uiSettings.login_background_photo) || fallback.loginBackgroundPhoto,
    primaryColor: normalizeVisualValue(uiSettings.primary_color) || normalizeVisualValue(preset.primary_color) || fallback.primaryColor,
    secondaryColor: normalizeVisualValue(uiSettings.secondary_color) || normalizeVisualValue(preset.secondary_color) || fallback.secondaryColor,
    tertiaryColor: normalizeVisualValue(uiSettings.tertiary_color) || normalizeVisualValue(preset.tertiary_color) || fallback.tertiaryColor,
    backgroundColor: normalizeVisualValue(uiSettings.background_color) || normalizeVisualValue(preset.background_color) || fallback.backgroundColor,
    primaryTextColor: normalizeVisualValue(uiSettings.primary_text_color) || normalizeVisualValue(preset.primary_text_color) || fallback.primaryTextColor,
    secondaryTextColor: normalizeVisualValue(uiSettings.secondary_text_color) || normalizeVisualValue(preset.secondary_text_color) || fallback.secondaryTextColor,
    tertiaryTextColor: normalizeVisualValue(uiSettings.tertiary_text_color) || normalizeVisualValue(preset.tertiary_text_color) || fallback.tertiaryTextColor,
    fontFamily: normalizeVisualValue(uiSettings.font_family) || normalizeVisualValue(preset.font_family) || fallback.fontFamily,
    secondaryFontFamily: normalizeVisualValue(uiSettings.secondary_font_family) || normalizeVisualValue(preset.secondary_font_family) || fallback.secondaryFontFamily,
  };

  return resolved;
};

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
  if (isNetworkErrorMessage(msg)) {
    return new Error('We could not connect right now. Please check your internet and try again.');
  }
  return new Error('Something went wrong. Please try again.');
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
    if (error) throw getFriendlyAuthError(error);

    if (!isEmailConfirmed(authData.user)) {
      await AuthAPI.logoutUser();
      const unconfirmedError = buildUserFacingLoginError('Please verify your email address before logging in.', loginErrorCodes.emailNotConfirmed);
      throw unconfirmedError;
    }

    logAppEvent('auth.login.account_lookup_started', 'Fetching public.users record after auth.', {
      authUserId: authData.user?.id || null,
      email,
      expectedRole: expectedRole || null,
    });

    const systemUserResult = await fetchSystemUserByAuthUserId(authData.user.id);
    if (systemUserResult.error) {
      await AuthAPI.logoutUser();
      const accountLoadError = buildUserFacingLoginError('Something went wrong while loading your account.', loginErrorCodes.accountLoadFailed);
      logAppError('auth.login.account_lookup_failed', systemUserResult.error, {
        authUserId: authData.user?.id || null,
        email,
        table: 'users',
        filter: { auth_user_id: authData.user?.id || null },
      });
      throw accountLoadError;
    }

    const systemUser = systemUserResult.data || null;
    const accountStateError = validateSystemUserAccount(systemUser);
    if (accountStateError) {
      await AuthAPI.logoutUser();
      throw accountStateError;
    }

    const actualRole = systemUser?.role || null;
    if (!actualRole) {
      await AuthAPI.logoutUser();
      throw buildUserFacingLoginError('We could not find your account details.', loginErrorCodes.accountDetailsMissing);
    }

    if (expectedRole && actualRole && actualRole !== expectedRole) {
      await AuthAPI.logoutUser();
      throw resolveRoleMismatchError(actualRole);
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
      databaseUserId: systemUser?.user_id || null,
      role: actualRole,
    });

    return {
      user: authData.user,
      session: authData.session,
      profile: systemUser,
      role: actualRole,
      error: null,
    };
  } catch (error) {
    logAppError('auth.login', error, {
      email,
      expectedRole: expectedRole || null,
      errorCode: error?.code || null,
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

    // When email confirmation is required, Supabase can create the auth user without
    // returning an active session yet. In that case, defer public table setup until
    // OTP verification/login so signup does not fail before the account is confirmed.
    if (data?.user?.id && data?.session) {
      const ensureSystemUserResult = await ensureProfileInfrastructure({
        authUserId: data.user.id,
        email: data.user.email || email,
        role: additionalData.role || null,
      });

      if (ensureSystemUserResult.error) {
        throw new Error(ensureSystemUserResult.error.message || authMessages.roleNotFound);
      }
    }

    if (data?.user?.id && !data?.session) {
      logAppEvent('auth.signup', 'Signup created auth user and is waiting for email verification before DB sync.', {
        authUserId: data.user.id,
        role: additionalData.role || null,
      });
    }

    await writeAuditLog({
      authUserId: data.user?.id,
      userEmail: data.user?.email || email,
      action: 'auth.signup',
      description: data?.session
        ? `Signup created for ${additionalData.role || 'account'} account.`
        : `Signup created and is waiting for email verification for ${additionalData.role || 'account'} account.`,
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

export const getResolvedLoginTheme = async () => {
  try {
    logAppEvent('auth.theme', 'Resolving login theme from database settings.', {
      tables: ['UI_Settings', 'Theme_Presets'],
    });

    const [uiSettingsResult, defaultPresetResult] = await Promise.all([
      AuthAPI.fetchUiSettings(),
      AuthAPI.fetchDefaultThemePreset(),
    ]);

    if (uiSettingsResult.error) {
      logAppError('auth.theme.ui_settings_failed', uiSettingsResult.error, {
        table: 'UI_Settings',
      });
    }

    if (defaultPresetResult.error) {
      logAppError('auth.theme.theme_preset_failed', defaultPresetResult.error, {
        table: 'Theme_Presets',
        filter: { Is_Default: true, Is_Deleted: false },
      });
    }

    const branding = resolveVisualTheme({
      uiSettings: uiSettingsResult.data || {},
      preset: defaultPresetResult.data || {},
    });

    logAppEvent('auth.theme', 'Resolved login theme for auth screens.', {
      hasUiSettings: Boolean(uiSettingsResult.data),
      hasDefaultPreset: Boolean(defaultPresetResult.data),
      brandName: branding.brandName,
      hasLogoIcon: Boolean(branding.logoIcon),
      hasLoginBackgroundPhoto: Boolean(branding.loginBackgroundPhoto),
    });

    return {
      data: branding,
      error: null,
    };
  } catch (error) {
    logAppError('auth.theme', error, {
      tables: ['UI_Settings', 'Theme_Presets'],
    });

    return {
      data: loginThemeFallback,
      error,
    };
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
