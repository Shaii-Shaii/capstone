import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';

export const useRoleRedirect = () => {
  const { user, profile, needsOnboarding, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Reconstruct the actual route path for cleaner comparison (e.g. "", "auth/access")
    const currentPath = segments.join('/');

    // 1. Define explicitly which routes unauthenticated users are allowed to see
    const isPublicAuthRoute = 
      currentPath === '' || // app/index.jsx -> Landing
      currentPath.startsWith('auth/') || // access, forgot-password, reset-password, verify-email
      currentPath === 'patient/login' ||
      currentPath === 'patient/signup' ||
      currentPath === 'donor/login' ||
      currentPath === 'donor/signup';

    // 2. Guard unauthenticated users
    if (!user) {
      if (!isPublicAuthRoute) {
        router.replace('/');
      }
      return;
    }

    // 3. Guard authenticated users
    if (user && profile) {
      const role = String(profile.role || '').trim().toLowerCase();
      const isRootRoute = currentPath === '';

      if (role === 'tentative') {
        if (!isRootRoute) {
          router.replace('/');
        }
        return;
      }

      if (needsOnboarding) {
        if (!isRootRoute) {
          router.replace('/');
        }
        return;
      }

      // Rule A: If logged in, block access to public auth routes and auto-redirect to correct home
      if (isPublicAuthRoute) {
        if (role === 'patient') {
          router.replace('/patient/home');
        } else if (role === 'donor') {
          router.replace('/donor/home');
        }
        return;
      }

      // Rule B: Prevent cross-role access to protected spaces
      const isTryingToAccessPatientArea = currentPath.startsWith('patient/');
      const isTryingToAccessDonorArea = currentPath.startsWith('donor/');

      if (role === 'patient' && isTryingToAccessDonorArea) {
        router.replace('/patient/home');
      } else if (role === 'donor' && isTryingToAccessPatientArea) {
        router.replace('/donor/home');
      }
    }
  }, [user, profile, needsOnboarding, isLoading, segments, router]);
};
