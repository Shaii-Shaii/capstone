import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase/client';
import { getCurrentAccountBundle } from '../features/profile/services/profile.service';

export const useAuthSession = () => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [hospitalProfile, setHospitalProfile] = useState(null);
  const [databaseUserId, setDatabaseUserId] = useState(null);
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
    } = await getCurrentAccountBundle(targetUserId);
    setProfile(userProfile);
    setPatientProfile(nextPatientProfile);
    setStaffProfile(nextStaffProfile);
    setHospitalProfile(nextHospitalProfile);
    setDatabaseUserId(nextDatabaseUserId);
    return userProfile;
  }, [user?.id]);

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
        } = await getCurrentAccountBundle(newSession.user.id);
        if (mounted) {
          setProfile(userProfile);
          setPatientProfile(nextPatientProfile);
          setStaffProfile(nextStaffProfile);
          setHospitalProfile(nextHospitalProfile);
          setDatabaseUserId(nextDatabaseUserId);
          setIsLoading(false);
        }
      } catch (_err) {
        if (mounted) {
          setProfile(null);
          setPatientProfile(null);
          setStaffProfile(null);
          setHospitalProfile(null);
          setDatabaseUserId(null);
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
    isLoading,
    refreshProfile,
  };
};
