import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const isWeb = Platform.OS === 'web';
const canUseBrowserStorage = typeof window !== 'undefined';

const webStorage = {
  async getItem(key) {
    if (!canUseBrowserStorage) return null;
    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (!canUseBrowserStorage) return;
    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (!canUseBrowserStorage) return;
    window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: isWeb ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

const parseStructuredErrorMessage = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';

  const normalized = value.trim();

  if (normalized.toLowerCase().includes('invalid jwt')) {
    return 'Invalid JWT';
  }

  if (!(normalized.startsWith('{') || normalized.startsWith('['))) {
    return '';
  }

  try {
    const payload = JSON.parse(normalized);
    return (
      (typeof payload?.message === 'string' && payload.message.trim())
      || (typeof payload?.error === 'string' && payload.error.trim())
      || ''
    );
  } catch (_error) {
    return '';
  }
};

const getFunctionErrorMessage = async (error) => {
  if (!error) return '';

  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
      }
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
      }
      if (typeof payload?.code === 'string' && payload.code.trim()) {
        return payload.code.trim();
      }
    } catch (_jsonError) {
      // Fall through to plain text parsing.
    }

    try {
      const text = await response.clone().text();
      const parsedTextMessage = parseStructuredErrorMessage(text);
      if (parsedTextMessage) {
        return parsedTextMessage;
      }
      if (text?.trim()) {
        return text.trim();
      }
    } catch (_textError) {
      // Ignore and use the fallback message.
    }
  }

  const parsedMessage = parseStructuredErrorMessage(error?.message);
  if (parsedMessage) {
    return parsedMessage;
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return '';
};

const isInvalidJwtFunctionError = async (error) => {
  const normalized = (await getFunctionErrorMessage(error)).toLowerCase();
  return normalized.includes('invalid jwt');
};

const tryRefreshAuthSession = async () => {
  const directRefreshResult = await supabase.auth.refreshSession();
  if (directRefreshResult?.data?.session && !directRefreshResult?.error) {
    return {
      session: directRefreshResult.data.session,
      error: null,
    };
  }

  const { data: sessionResult } = await supabase.auth.getSession();
  const currentSession = sessionResult?.session;
  if (!currentSession?.refresh_token) {
    return {
      session: null,
      error: directRefreshResult?.error || new Error('No refresh token available.'),
    };
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: currentSession.refresh_token,
  });

  return {
    session: data?.session || null,
    error,
  };
};

const withAccessToken = (options = {}, accessToken) => {
  if (!accessToken) return options;

  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  };
};

const getCurrentAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
};

const shouldRefreshSession = (session) => {
  const expiresAt = Number(session?.expires_at);
  if (!expiresAt) return false;

  const expiresAtMs = expiresAt * 1000;
  const now = Date.now();
  const refreshThresholdMs = 60 * 1000;

  return expiresAtMs - now <= refreshThresholdMs;
};

const ensureActiveSession = async () => {
  const { data } = await supabase.auth.getSession();
  const session = data?.session || null;

  if (!session) {
    return {
      session: null,
      error: new Error('No active session found.'),
    };
  }

  if (!shouldRefreshSession(session)) {
    return { session, error: null };
  }

  return await tryRefreshAuthSession();
};

export const invokeEdgeFunction = async (functionName, options = {}) => {
  const activeSessionResult = await ensureActiveSession();
  const initialAccessToken = activeSessionResult?.session?.access_token || await getCurrentAccessToken();
  let result = await supabase.functions.invoke(
    functionName,
    withAccessToken(options, initialAccessToken)
  );

  if (!result?.error || !(await isInvalidJwtFunctionError(result.error))) {
    return result;
  }

  const refreshResult = await tryRefreshAuthSession();
  if (!refreshResult?.session || refreshResult?.error) {
    return result;
  }

  result = await supabase.functions.invoke(
    functionName,
    withAccessToken(options, refreshResult.session.access_token)
  );
  return result;
};

if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
