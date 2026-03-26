import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase/client';
import { getProfile } from '../features/profile/services/profile.service';

export const useAuthSession = () => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async (userId) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return null;

    const { profile: userProfile } = await getProfile(targetUserId);
    setProfile(userProfile);
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
          setIsLoading(false);
        }
        return;
      }

      if (mounted) {
        setSession(newSession);
        setUser(newSession.user);
      }
      
      try {
        const { profile: userProfile } = await getProfile(newSession.user.id);
        if (mounted) {
          setProfile(userProfile);
          setIsLoading(false);
        }
      } catch (_err) {
        if (mounted) setIsLoading(false);
      }
    }

    // Initial load
    setIsLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionData(session);
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

  return { user, session, profile, isLoading, refreshProfile };
};
