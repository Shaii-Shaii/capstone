import { useState } from 'react';
import * as AuthService from '../services/auth.service';

/**
 * Screen-facing hooks for auth flows
 * Manages loading states, errors, and triggers services
 */

export const useAuthActions = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAuthAction = async (actionFunction, ...args) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await actionFunction(...args);
      if (result.error) {
        setError(result.error);
        return { success: false, error: result.error, errorCode: result.errorCode };
      }
      return { success: true, ...result };
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      return { success: false, error: err.message, errorCode: err.code };
    }
 finally {
      setIsLoading(false);
    }
  };

  const login = (email, password, expectedRole) => handleAuthAction(AuthService.login, email, password, expectedRole);
  
  const register = (email, password, additionalData) => handleAuthAction(AuthService.register, email, password, additionalData);
  
  const logout = () => handleAuthAction(AuthService.logout);
  
  const sendPasswordReset = (email) => handleAuthAction(AuthService.sendPasswordReset, email);
  
  const updatePassword = (payload) => handleAuthAction(AuthService.updatePassword, payload);

  return {
    isLoading,
    error,
    login,
    register,
    logout,
    sendPasswordReset,
    updatePassword,
    clearError: () => setError(null)
  };
};
