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
    },
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
  return await supabase.auth.updateUser({ password: newPassword });
};

export const verifyEmailOtp = async ({ email, token }) => {
  return await supabase.auth.verifyOtp({ email, token, type: 'signup' });
};

export const resendSignupOtp = async ({ email }) => {
  return await supabase.auth.resend({
    type: 'signup',
    email,
  });
};

const uiSettingsSelect = `
  brand_name:Brand_Name,
  brand_tagline:Brand_Tagline,
  logo_icon:Logo_Icon,
  login_background_photo:Login_Background_Photo,
  primary_color:Primary_Color,
  secondary_color:Secondary_Color,
  tertiary_color:Tertiary_Color,
  background_color:Background_Color,
  primary_text_color:Primary_Text_Color,
  secondary_text_color:Secondary_Text_Color,
  tertiary_text_color:Tertiary_Text_Color,
  font_family:Font_Family,
  secondary_font_family:Secondary_Font_Family
`;

const themePresetSelect = `
  primary_color:Primary_Color,
  secondary_color:Secondary_Color,
  tertiary_color:Tertiary_Color,
  background_color:Background_Color,
  primary_text_color:Primary_Text_Color,
  secondary_text_color:Secondary_Text_Color,
  tertiary_text_color:Tertiary_Text_Color,
  font_family:Font_Family,
  secondary_font_family:Secondary_Font_Family
`;

export const fetchUiSettings = async () => {
  return await supabase
    .from('UI_Settings')
    .select(uiSettingsSelect)
    .limit(1)
    .maybeSingle();
};

export const fetchDefaultThemePreset = async () => {
  return await supabase
    .from('Theme_Presets')
    .select(themePresetSelect)
    .eq('Is_Default', true)
    .eq('Is_Deleted', false)
    .limit(1)
    .maybeSingle();
};
