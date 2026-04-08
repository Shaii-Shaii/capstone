import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthActions } from '../features/auth/hooks/useAuthActions';
import {
  authMessages,
  roleAuthConfig,
} from '../constants/auth';
import { savePendingSignupDraft, syncPendingSignupDraft } from '../features/auth/services/signupDraft.service';

export const useRoleAuthFlow = (role) => {
  const router = useRouter();
  const { login, register, logout, isLoading } = useAuthActions();
  const config = roleAuthConfig[role] || roleAuthConfig.access;
  const expectedRole = role === 'donor' || role === 'patient' ? role : undefined;

  const handleSignup = async (data) => {
    const selectedRole = 'tentative';

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await register(data.email, data.password, {
      role: selectedRole,
    });

    if (result.success) {
      await savePendingSignupDraft({
        email: data.email,
        role: selectedRole,
      });

      if (result.session && result.user?.id) {
        await syncPendingSignupDraft({
          userId: result.user.id,
          email: data.email,
          role: selectedRole,
        });

        await logout();
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/auth/verify-email?email=${encodeURIComponent(data.email)}&role=${selectedRole}`);
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
      const resolvedRole = result.role || result.profile?.role;

      if (!resolvedRole) {
        Alert.alert('Login Failed', authMessages.roleNotFound);
        return;
      }

      router.replace('/');
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    if (result.errorCode === 'EMAIL_NOT_CONFIRMED' || (result.error && result.error.includes('verify your email'))) {
      const verifyRole = expectedRole || result.role || result.profile?.role;

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
