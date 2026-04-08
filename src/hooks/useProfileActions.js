import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../providers/AuthProvider';
import { useAuthActions } from '../features/auth/hooks/useAuthActions';
import {
  buildProfileCompletionMeta,
  getProfileBundle,
  getVisibleRoleFields,
  hasProfileFormChanges,
  saveAvatar,
  saveProfile,
} from '../features/profile/services/profile.service';
import { logAppError, logAppEvent } from '../utils/appErrors';

const IMAGE_MEDIA_TYPES = ['images'];

const formFromProfile = (profile) => ({
  firstName: profile?.first_name || '',
  middleName: profile?.middle_name || '',
  lastName: profile?.last_name || '',
  suffix: profile?.suffix || '',
  birthdate: profile?.birthdate || '',
  gender: profile?.gender || '',
  phone: profile?.phone || '',
  street: profile?.street || '',
  barangay: profile?.barangay || '',
  region: profile?.region || '',
  city: profile?.city || '',
  province: profile?.province || '',
  country: profile?.country || '',
});

export const useProfileActions = () => {
  const { user, profile, patientProfile, staffProfile, hospitalProfile, refreshProfile } = useAuth();
  const { logout, updatePassword, isLoading: isAuthLoading } = useAuthActions();
  const [roleProfile, setRoleProfile] = useState(null);
  const [visibleRoleFields, setVisibleRoleFields] = useState([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoadingRoleProfile, setIsLoadingRoleProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const defaultValues = useMemo(() => formFromProfile(profile), [profile]);
  const profileCompletionMeta = useMemo(() => (
    buildProfileCompletionMeta({
      photo_path: profile?.photo_path || profile?.avatar_url || '',
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      birthdate: profile?.birthdate || '',
      gender: profile?.gender || '',
      contact_number: profile?.contact_number || profile?.phone || '',
      street: profile?.street || '',
      barangay: profile?.barangay || '',
      city: profile?.city || '',
      province: profile?.province || '',
      region: profile?.region || '',
      country: profile?.country || '',
    })
  ), [
    profile?.avatar_url,
    profile?.barangay,
    profile?.birthdate,
    profile?.city,
    profile?.contact_number,
    profile?.country,
    profile?.first_name,
    profile?.gender,
    profile?.last_name,
    profile?.phone,
    profile?.photo_path,
    profile?.province,
    profile?.region,
    profile?.street,
  ]);

  const getProfileCompletionMeta = useCallback((values = defaultValues) => (
    buildProfileCompletionMeta({
      photo_path: profile?.photo_path || profile?.avatar_url || '',
      first_name: values?.firstName,
      last_name: values?.lastName,
      birthdate: values?.birthdate,
      gender: values?.gender,
      contact_number: values?.phone,
      street: values?.street,
      barangay: values?.barangay,
      city: values?.city,
      province: values?.province,
      region: values?.region,
      country: values?.country,
    })
  ), [
    defaultValues,
    profile?.avatar_url,
    profile?.photo_path,
  ]);

  const hasUnsavedProfileChanges = useCallback((values = defaultValues) => (
    hasProfileFormChanges(defaultValues, values)
  ), [defaultValues]);

  const loadProfileBundle = useCallback(async () => {
    if (!user?.id || !profile?.role) return;
    setIsLoadingRoleProfile(true);
    logAppEvent('profile_completion.modal_fetch', 'Profile completion context fetch started.', {
      authUserId: user.id,
      role: profile.role,
    });

    try {
      const { roleProfile: fetchedRoleProfile, error } = await getProfileBundle(user.id, profile.role);

      if (error) {
        throw new Error(error);
      }

      setRoleProfile(fetchedRoleProfile);
      setVisibleRoleFields(getVisibleRoleFields(fetchedRoleProfile));

      logAppEvent('profile_completion.modal_fetch', 'Profile completion context fetch succeeded.', {
        authUserId: user.id,
        role: profile.role,
        hasRoleProfile: Boolean(fetchedRoleProfile),
      });
    } catch (error) {
      logAppError('profile_completion.modal_fetch', error, {
        authUserId: user?.id || null,
        role: profile?.role || null,
      });
      setRoleProfile(null);
      setVisibleRoleFields([]);
    } finally {
      setIsLoadingRoleProfile(false);
    }
  }, [profile?.role, user?.id]);

  useEffect(() => {
    loadProfileBundle();
  }, [loadProfileBundle]);

  const saveSharedProfile = async (values) => {
    if (!user?.id) {
      return { success: false, error: 'Session not found.' };
    }

    setIsSavingProfile(true);
    logAppEvent('profile_completion.save', 'Profile completion save started.', {
      authUserId: user.id,
      role: profile?.role || null,
    });

    const payload = {
      first_name: values.firstName,
      middle_name: values.middleName,
      last_name: values.lastName,
      suffix: values.suffix,
      birthdate: values.birthdate,
      gender: values.gender,
      phone: values.phone,
      street: values.street,
      barangay: values.barangay,
      region: values.region,
      city: values.city,
      province: values.province,
      country: values.country,
    };

    const result = await saveProfile(user.id, payload, profile?.role);
    setIsSavingProfile(false);

    if (result.error) {
      logAppError('profile_completion.save', new Error(result.error), {
        authUserId: user.id,
        role: profile?.role || null,
      });
      return { success: false, error: result.error };
    }

    await refreshProfile(user.id);
    await loadProfileBundle();

    logAppEvent('profile_completion.save', 'Profile completion save succeeded.', {
      authUserId: user.id,
      role: profile?.role || null,
    });

    return { success: true };
  };

  const uploadAvatar = async () => {
    try {
      if (!user?.id) {
        return { success: false, error: 'Session not found.' };
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return { success: false, error: 'Please allow photo library access to choose a profile image.' };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
        base64: true,
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }

      const asset = result.assets?.[0];
      if (!asset?.base64) {
        return { success: false, error: 'Unable to read the selected image.' };
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const avatarUrl = `data:${mimeType};base64,${asset.base64}`;

      setIsUploadingAvatar(true);
      const uploadResult = await saveAvatar(user.id, avatarUrl);
      setIsUploadingAvatar(false);

      if (uploadResult.error) {
        return { success: false, error: uploadResult.error };
      }

      await refreshProfile(user.id);
      await loadProfileBundle();
      return { success: true, avatarUrl };
    } catch (error) {
      setIsUploadingAvatar(false);
      return { success: false, error: error.message || 'Unable to update your photo.' };
    }
  };

  return {
    user,
    profile,
    patientProfile,
    staffProfile,
    hospitalProfile,
    roleProfile,
    visibleRoleFields,
    defaultValues,
    profileCompletionMeta,
    isSavingProfile,
    isLoadingRoleProfile,
    isUploadingAvatar,
    isChangingPassword: isAuthLoading,
    loadProfileBundle,
    getProfileCompletionMeta,
    hasUnsavedProfileChanges,
    saveSharedProfile,
    uploadAvatar,
    changePassword: (values) => updatePassword(values),
    logout,
  };
};
