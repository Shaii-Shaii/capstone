import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase/client';
import { getCurrentAccountBundle, needsPostLoginOnboarding } from '../features/profile/services/profile.service';
import { ensureProfileInfrastructure } from '../features/profile/api/profile.api';

export const useAuthSession = () => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [hospitalProfile, setHospitalProfile] = useState(null);
  const [databaseUserId, setDatabaseUserId] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async (userId) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return null;

    const currentEmail = targetUserId === user?.id ? user?.email || '' : '';
    const currentRole = targetUserId === user?.id ? user?.user_metadata?.role || null : null;
    await ensureProfileInfrastructure({
      authUserId: targetUserId,
      email: currentEmail,
      role: currentRole,
    });

    const {
      profile: userProfile,
      patientProfile: nextPatientProfile,
      staffProfile: nextStaffProfile,
      hospitalProfile: nextHospitalProfile,
      databaseUserId: nextDatabaseUserId,
      onboardingCompleted,
    } = await getCurrentAccountBundle(targetUserId);
    setProfile(userProfile);
    setPatientProfile(nextPatientProfile);
    setStaffProfile(nextStaffProfile);
    setHospitalProfile(nextHospitalProfile);
    setDatabaseUserId(nextDatabaseUserId);
    setNeedsOnboarding(needsPostLoginOnboarding({
      profile: userProfile,
      patientProfile: nextPatientProfile,
      staffProfile: nextStaffProfile,
      onboardingCompleted,
    }));
    return userProfile;
  }, [user?.email, user?.id, user?.user_metadata?.role]);

  useEffect(() => {
    let mounted = true;

    async function handleSessionData(newSession) {
      if (!newSession?.user) {
        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setPatientProfile(null);
          setStaffProfile(null);
          setHospitalProfile(null);
          setDatabaseUserId(null);
          setNeedsOnboarding(false);
          setIsLoading(false);
        }
        return;
      }

      if (mounted) {
        setSession(newSession);
        setUser(newSession.user);
      }
      
      try {
        await ensureProfileInfrastructure({
          authUserId: newSession.user.id,
          email: newSession.user.email || '',
          role: newSession.user.user_metadata?.role || null,
        });

        const {
          profile: userProfile,
          patientProfile: nextPatientProfile,
          staffProfile: nextStaffProfile,
          hospitalProfile: nextHospitalProfile,
          databaseUserId: nextDatabaseUserId,
          onboardingCompleted,
        } = await getCurrentAccountBundle(newSession.user.id);
        if (mounted) {
          setProfile(userProfile);
          setPatientProfile(nextPatientProfile);
          setStaffProfile(nextStaffProfile);
          setHospitalProfile(nextHospitalProfile);
          setDatabaseUserId(nextDatabaseUserId);
          setNeedsOnboarding(needsPostLoginOnboarding({
            profile: userProfile,
            patientProfile: nextPatientProfile,
            staffProfile: nextStaffProfile,
            onboardingCompleted,
          }));
          setIsLoading(false);
        }
      } catch (_err) {
        if (mounted) {
          setProfile(null);
          setPatientProfile(null);
          setStaffProfile(null);
          setHospitalProfile(null);
          setDatabaseUserId(null);
          setNeedsOnboarding(false);
          setIsLoading(false);
        }
      }
    }

    // Initial load
    setIsLoading(true);
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        handleSessionData(session);
        return;
      }

      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data?.session) {
        handleSessionData(data.session);
        return;
      }

      if (!session?.refresh_token) {
        handleSessionData(session);
        return;
      }

      const retryResult = await supabase.auth.refreshSession({
        refresh_token: session.refresh_token,
      });

      handleSessionData(retryResult.error ? session : (retryResult.data?.session || session));
    });

    // Handle updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        handleSessionData(newSession);
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  return {
    user,
    session,
    profile,
    patientProfile,
    staffProfile,
    hospitalProfile,
    databaseUserId,
    needsOnboarding,
    isLoading,
    refreshProfile,
  };
};
