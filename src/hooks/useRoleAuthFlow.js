import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthActions } from '../features/auth/hooks/useAuthActions';
import {
  authMessages,
  getHomeRouteForRole,
  roleAuthConfig,
} from '../constants/auth';
import { savePendingSignupDraft, syncPendingSignupDraft } from '../features/auth/services/signupDraft.service';

export const useRoleAuthFlow = (role) => {
  const router = useRouter();
  const { login, register, logout, isLoading } = useAuthActions();
  const config = roleAuthConfig[role] || roleAuthConfig.access;
  const expectedRole = role === 'donor' || role === 'patient' ? role : undefined;

  const handleSignup = async (data) => {
    if (!expectedRole) {
      Alert.alert('Signup Unavailable', 'Please start from the landing page and choose donor or patient signup.');
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await register(data.email, data.password, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      street: data.street,
      barangay: data.barangay,
      city: data.city,
      province: data.province,
      region: data.region,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      profilePhoto: data.profilePhoto,
      role: expectedRole,
    });

    if (result.success) {
      await savePendingSignupDraft({
        ...data,
        role: expectedRole,
      });

      if (result.session && result.user?.id) {
        await syncPendingSignupDraft({
          userId: result.user.id,
          email: data.email,
          role: expectedRole,
        });

        await logout();
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/auth/verify-email?email=${encodeURIComponent(data.email)}&role=${expectedRole}`);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert('Signup Failed', result.error || authMessages.signupFailed);
  };

  const handleLogin = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(data.email, data.password, expectedRole);

    if (result.success || result.user) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const resolvedRole = result.role || result.profile?.role || result.user?.user_metadata?.role;

      if (!resolvedRole) {
        Alert.alert('Login Failed', authMessages.roleNotFound);
        return;
      }

      router.replace(getHomeRouteForRole(resolvedRole));
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    if (result.errorCode === 'EMAIL_NOT_CONFIRMED' || (result.error && result.error.includes('verify your email'))) {
      const verifyRole = expectedRole || result.role || result.profile?.role || result.user?.user_metadata?.role;

      Alert.alert(
        authMessages.verifyPromptTitle,
        authMessages.verifyPromptBody,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify Now',
            onPress: () => router.replace(`/auth/verify-email?email=${encodeURIComponent(data.email)}${verifyRole ? `&role=${verifyRole}` : ''}`),
          },
        ]
      );
      return;
    }

    Alert.alert('Login Failed', result.error || authMessages.loginFailed);
  };

  return {
    isLoading,
    config,
    handleSignup,
    handleLogin,
  };
};
