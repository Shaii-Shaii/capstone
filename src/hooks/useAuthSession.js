import { useState, useEffect, useCallback } from 'react';
import { ensureActiveSession, supabase } from '../api/supabase/client';
import { getCurrentAccountBundle, needsPostLoginOnboarding } from '../features/profile/services/profile.service';

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
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    let subscription = null;

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

    async function bootstrapAuthSession() {
      setIsLoading(true);

      let activeSession = null;
      try {
        const activeSessionResult = await ensureActiveSession();
        activeSession = activeSessionResult?.session || null;
      } catch (_error) {
        activeSession = null;
      }

      await handleSessionData(activeSession);

      if (!mounted) return;

      const authStateResult = supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          handleSessionData(newSession);
        }
      );

      subscription = authStateResult?.data?.subscription || null;
    }

    bootstrapAuthSession();

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
