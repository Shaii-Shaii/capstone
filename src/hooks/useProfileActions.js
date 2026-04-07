import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../providers/AuthProvider';
import { useAuthActions } from '../features/auth/hooks/useAuthActions';
import { getProfileBundle, getVisibleRoleFields, saveAvatar, saveProfile } from '../features/profile/services/profile.service';

const IMAGE_MEDIA_TYPES = ['images'];

const formFromProfile = (profile) => ({
  firstName: profile?.first_name || '',
  middleName: profile?.middle_name || '',
  lastName: profile?.last_name || '',
  phone: profile?.phone || '',
  city: profile?.city || '',
  province: profile?.province || '',
});

export const useProfileActions = () => {
  const { user, profile, patientProfile, staffProfile, refreshProfile } = useAuth();
  const { logout, updatePassword, isLoading: isAuthLoading } = useAuthActions();
  const [roleProfile, setRoleProfile] = useState(null);
  const [visibleRoleFields, setVisibleRoleFields] = useState([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoadingRoleProfile, setIsLoadingRoleProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const defaultValues = useMemo(() => formFromProfile(profile), [profile]);

  const loadProfileBundle = useCallback(async () => {
    if (!user?.id || !profile?.role) return;
    setIsLoadingRoleProfile(true);
    const { roleProfile: fetchedRoleProfile } = await getProfileBundle(user.id, profile.role);
    setRoleProfile(fetchedRoleProfile);
    setVisibleRoleFields(getVisibleRoleFields(fetchedRoleProfile));
    setIsLoadingRoleProfile(false);
  }, [profile?.role, user?.id]);

  useEffect(() => {
    loadProfileBundle();
  }, [loadProfileBundle]);

  const saveSharedProfile = async (values) => {
    if (!user?.id) {
      return { success: false, error: 'Session not found.' };
    }

    setIsSavingProfile(true);
    const payload = {
      first_name: values.firstName,
      middle_name: values.middleName,
      last_name: values.lastName,
      phone: values.phone,
      city: values.city,
      province: values.province,
    };

    const result = await saveProfile(user.id, payload, profile?.role);
    setIsSavingProfile(false);

    if (result.error) {
      return { success: false, error: result.error };
    }

    await refreshProfile(user.id);
    await loadProfileBundle();
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
    roleProfile,
    visibleRoleFields,
    defaultValues,
    isSavingProfile,
    isLoadingRoleProfile,
    isUploadingAvatar,
    isChangingPassword: isAuthLoading,
    loadProfileBundle,
    saveSharedProfile,
    uploadAvatar,
    changePassword: (values) => updatePassword(values),
    logout,
  };
};
