import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthActions } from '../features/auth/hooks/useAuthActions';
import { authMessages, roleAuthConfig } from '../constants/auth';

export const useRoleAuthFlow = (role) => {
  const router = useRouter();
  const { login, register, isLoading } = useAuthActions();
  const config = roleAuthConfig[role];

  const handleSignup = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await register(data.email, data.password, {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      role,
    });

    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.session) {
        router.replace(config.routes.home);
      } else {
        router.replace(`/auth/verify-email?email=${encodeURIComponent(data.email)}&role=${role}`);
      }
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert('Signup Failed', result.error || authMessages.signupFailed);
  };

  const handleLogin = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(data.email, data.password, role);

    if (result.success || result.user) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(config.routes.home);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    if (result.errorCode === 'EMAIL_NOT_CONFIRMED' || (result.error && result.error.includes('verify your email'))) {
      Alert.alert(
        authMessages.verifyPromptTitle,
        authMessages.verifyPromptBody,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify Now',
            onPress: () => router.replace(`/auth/verify-email?email=${encodeURIComponent(data.email)}&role=${role}`),
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
