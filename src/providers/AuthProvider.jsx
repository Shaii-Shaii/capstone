import React, { createContext, useContext } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';

const AuthContext = createContext({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  refreshProfile: async () => null,
});

export const AuthProvider = ({ children }) => {
  const authState = useAuthSession();

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
