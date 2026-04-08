import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const supabasePublishableKey = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
const isWeb = Platform.OS === 'web';
const canUseBrowserStorage = typeof window !== 'undefined';
const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);
const missingSupabaseConfigMessage = 'Supabase environment variables are not configured.';

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

const createSupabaseConfigError = () => new Error(missingSupabaseConfigMessage);

const createFallbackQueryBuilder = (resultFactory = () => ({
  data: null,
  error: createSupabaseConfigError(),
})) => {
  let proxy;

  const execute = () => Promise.resolve(resultFactory());

  const target = {
    then(onFulfilled, onRejected) {
      return execute().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return execute().catch(onRejected);
    },
    finally(onFinally) {
      return execute().finally(onFinally);
    },
  };

  proxy = new Proxy(target, {
    get(currentTarget, property) {
      if (property in currentTarget) {
        return currentTarget[property];
      }

      return (..._args) => proxy;
    },
  });

  return proxy;
};

const createFallbackChannel = () => ({
  on() {
    return this;
  },
  subscribe() {
    return this;
  },
  unsubscribe() {
    return undefined;
  },
});

const createFallbackStorageBucket = () => ({
  upload: async () => ({ data: null, error: createSupabaseConfigError() }),
  download: async () => ({ data: null, error: createSupabaseConfigError() }),
  remove: async () => ({ data: null, error: createSupabaseConfigError() }),
  list: async () => ({ data: [], error: createSupabaseConfigError() }),
  getPublicUrl: () => ({
    data: { publicUrl: '' },
    error: createSupabaseConfigError(),
  }),
});

const createFallbackSupabaseClient = () => ({
  auth: {
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: createSupabaseConfigError() }),
    signUp: async () => ({ data: { user: null, session: null }, error: createSupabaseConfigError() }),
    signOut: async () => ({ error: createSupabaseConfigError() }),
    getSession: async () => ({ data: { session: null }, error: createSupabaseConfigError() }),
    refreshSession: async () => ({ data: { session: null }, error: createSupabaseConfigError() }),
    resetPasswordForEmail: async () => ({ data: null, error: createSupabaseConfigError() }),
    updateUser: async () => ({ data: { user: null }, error: createSupabaseConfigError() }),
    verifyOtp: async () => ({ data: { user: null, session: null }, error: createSupabaseConfigError() }),
    resend: async () => ({ data: null, error: createSupabaseConfigError() }),
    getUser: async () => ({ data: { user: null }, error: createSupabaseConfigError() }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe() {
            return undefined;
          },
        },
      },
    }),
    startAutoRefresh() {
      return undefined;
    },
    stopAutoRefresh() {
      return undefined;
    },
  },
  functions: {
    invoke: async () => ({ data: null, error: createSupabaseConfigError() }),
  },
  storage: {
    from() {
      return createFallbackStorageBucket();
    },
  },
  channel() {
    return createFallbackChannel();
  },
  removeChannel() {
    return undefined;
  },
  from() {
    return createFallbackQueryBuilder();
  },
});

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: isWeb ? webStorage : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : createFallbackSupabaseClient();

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

export const ensureActiveSession = async () => {
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

if (!hasSupabaseConfig && typeof console !== 'undefined') {
  console.warn(missingSupabaseConfigMessage);
}

if (!isWeb && hasSupabaseConfig) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
