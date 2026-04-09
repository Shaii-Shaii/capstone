import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';
import { getResolvedSystemTheme } from '../features/auth/services/auth.service';
import { emptyResolvedTheme } from '../design-system/theme';

const AuthContext = createContext({
  user: null,
  session: null,
  profile: null,
  patientProfile: null,
  staffProfile: null,
  hospitalProfile: null,
  databaseUserId: null,
  needsOnboarding: false,
  isLoading: true,
  refreshProfile: async () => null,
  resolvedTheme: emptyResolvedTheme,
  refreshResolvedTheme: async () => emptyResolvedTheme,
});

export const AuthProvider = ({ children }) => {
  const authState = useAuthSession();
  const [resolvedTheme, setResolvedTheme] = useState(emptyResolvedTheme);

  const refreshResolvedTheme = async () => {
    const result = await getResolvedSystemTheme();
    if (result?.data) {
      setResolvedTheme(result.data);
      return result.data;
    }

    setResolvedTheme(emptyResolvedTheme);
    return emptyResolvedTheme;
  };

  useEffect(() => {
    refreshResolvedTheme();
  }, []);

  const contextValue = useMemo(() => ({
    ...authState,
    resolvedTheme,
    refreshResolvedTheme,
  }), [authState, resolvedTheme]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
