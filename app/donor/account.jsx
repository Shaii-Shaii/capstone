import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../../src/components/ui/DashboardHeader';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppInput } from '../../src/components/ui/AppInput';
import { PasswordInput } from '../../src/components/ui/PasswordInput';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { DatePickerField } from '../../src/components/ui/DatePickerField';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { DashboardSectionHeader } from '../../src/components/ui/DashboardSectionHeader';
import { SignupAddressSection } from '../../src/components/auth/SignupAddressSection';
import { useProfileActions } from '../../src/hooks/useProfileActions';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { theme } from '../../src/design-system/theme';
import { getPasswordStrengthMessage } from '../../src/utils/passwordRules';
import { logAppEvent } from '../../src/utils/appErrors';
import { changePasswordSchema, profileUpdateSchema } from '../../src/features/profile/profile.schema';
import { donorDashboardNavItems } from '../../src/constants/dashboard';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PROFILE_MINIMUM_AGE = 18;
const MINIMUM_BIRTHDATE = new Date(1900, 0, 1);

const getMaximumBirthdate = () => {
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - PROFILE_MINIMUM_AGE);
  return maxDate;
};

function ActionRow({ item, onPress }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => onPress(item)}
      onPressIn={() => {
        scale.value = withSpring(0.985, theme.motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, theme.motion.spring);
      }}
      style={[styles.actionRow, animatedStyle]}
    >
      <View style={[styles.actionIconWrap, item.danger ? styles.actionIconWrapDanger : null]}>
        <AppIcon name={item.icon} state={item.danger ? 'danger' : 'active'} />
      </View>
      <View style={styles.actionTextWrap}>
        <Text style={[styles.actionTitle, item.danger ? styles.actionTitleDanger : null]}>{item.title}</Text>
        <Text style={styles.actionDescription}>{item.description}</Text>
      </View>
      <AppIcon name="chevronRight" state="muted" />
    </AnimatedPressable>
  );
}

export default function DonorAccountScreen() {
  const router = useRouter();
  const { height: viewportHeight } = useWindowDimensions();
  const {
    user,
    profile,
    defaultValues,
    profileCompletionMeta,
    isSavingProfile,
    isChangingPassword,
    getProfileCompletionMeta,
    hasUnsavedProfileChanges,
    saveSharedProfile,
    changePassword,
  } = useProfileActions();
  const { logout } = useAuthActions();

  const [mode, setMode] = useState('view');
  const [feedback, setFeedback] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const successTimerRef = useRef(null);

  const profileForm = useForm({
    resolver: zodResolver(profileUpdateSchema),
    mode: 'onBlur',
    defaultValues,
  });

  const passwordForm = useForm({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onBlur',
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const watchedProfileValues = useWatch({
    control: profileForm.control,
  });
  const profileErrors = profileForm.formState.errors;

  useEffect(() => {
    profileForm.reset(defaultValues);
  }, [defaultValues, profileForm]);

  useEffect(() => () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
  }, []);

  const watchedNewPassword = passwordForm.watch('newPassword');
  const passwordStrengthMessage = getPasswordStrengthMessage(watchedNewPassword);
  const passwordStrengthVariant = watchedNewPassword
    ? passwordStrengthMessage === 'Strong password'
      ? 'success'
      : 'info'
    : 'info';
  const isPopupVisible = mode !== 'view';
  const modalMaxHeight = Math.max(360, viewportHeight - theme.spacing.xl * 2);
  const activeModalHeight = mode === 'edit' ? modalMaxHeight : Math.min(420, modalMaxHeight);
  const liveProfileCompletionMeta = useCallback(
    (values) => getProfileCompletionMeta(values),
    [getProfileCompletionMeta],
  );
  const activeProfileCompletionMeta = watchedProfileValues
    ? liveProfileCompletionMeta(watchedProfileValues)
    : profileCompletionMeta;
  const hasDirtyProfileDraft = mode === 'edit' && hasUnsavedProfileChanges(watchedProfileValues);
  const editModalTitle = !activeProfileCompletionMeta.isComplete
    ? 'Complete Account Setup'
    : 'Edit Profile';
  const completionHint = activeProfileCompletionMeta.isComplete
    ? 'All core details are complete.'
    : `Missing: ${activeProfileCompletionMeta.missingFieldLabels.slice(0, 3).join(', ')}.`;

  const setFloatingFeedback = (type, title, message) => {
    setFeedback({ type, title, message });
  };

  const closeEditModal = useCallback(() => {
    profileForm.reset(defaultValues);
    setMode('view');
  }, [defaultValues, profileForm]);

  const handleDiscardProfileChanges = useCallback(() => {
    logAppEvent('profile_completion.discard', 'Unsaved profile changes were discarded.', {
      authUserId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      role: 'donor',
    });
    closeEditModal();
  }, [closeEditModal, profile?.user_id, user?.id]);

  const requestEditModalClose = useCallback(() => {
    if (!hasDirtyProfileDraft) {
      closeEditModal();
      return;
    }

    Alert.alert(
      'Discard changes?',
      'You have unsaved profile changes. Are you sure you want to close without saving?',
      [
        { text: 'Keep editing', onPress: () => {} },
        { text: 'Discard', onPress: handleDiscardProfileChanges, style: 'destructive' },
      ],
    );
  }, [hasDirtyProfileDraft, handleDiscardProfileChanges, closeEditModal]);

  const handleModalClose = useCallback(() => {
    if (mode === 'edit') {
      requestEditModalClose();
    } else {
      setMode('view');
    }
  }, [mode, requestEditModalClose]);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  const handleActionPress = (item) => {
    if (item.key === 'logout') {
      Alert.alert(
        'Logout?',
        'Are you sure you want to logout from your donor account?',
        [
          { text: 'Cancel', onPress: () => {} },
          {
            text: 'Logout',
            onPress: () => logout(),
            style: 'destructive',
          },
        ],
      );
      return;
    }

    if (item.key === 'edit') {
      setMode('edit');
      return;
    }

    if (item.key === 'password') {
      setMode('password');
    }
  };

  const submitProfile = async (values) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await saveSharedProfile(values);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaveSuccess(true);
      setFloatingFeedback('success', 'Profile Updated', 'Your account details were saved successfully.');
      setMode('view');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFloatingFeedback('error', 'Update Failed', result.error || 'Unable to update your profile.');
    }
  };

  const submitPassword = async (values) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await changePassword(values);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      passwordForm.reset();
      setPasswordSuccess(true);
      setFloatingFeedback('success', 'Password Changed', 'Your password was updated successfully.');
      setMode('view');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFloatingFeedback('error', 'Password Update Failed', result.error || 'Unable to change your password.');
    }
  };

  useEffect(() => {
    if (!saveSuccess && !passwordSuccess) return;
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      setSaveSuccess(false);
      setPasswordSuccess(false);
    }, 1400);
  }, [passwordSuccess, saveSuccess]);

  useEffect(() => {
    if (mode === 'edit') {
      profileForm.reset(defaultValues);
    }

    if (mode === 'password') {
      passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
  }, [defaultValues, mode, passwordForm, profileForm]);

  const accountActionItems = [
    {
      key: 'edit',
      icon: 'editProfile',
      title: 'Edit Profile',
      description: 'Update your donor details and information.',
    },
    {
      key: 'password',
      icon: 'settings',
      title: 'Change Password',
      description: 'Update your account password for security.',
    },
  ];

  return (
    <>
      <DashboardLayout
        navItems={donorDashboardNavItems}
        activeNavKey="profile"
        navVariant="donor"
        onNavPress={handleNavPress}
        header={(
          <DashboardHeader
            title="Account Settings"
            subtitle=""
            variant="donor"
            avatarInitials={profile?.first_name?.[0] && profile?.last_name?.[0] ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase() : 'DN'}
            avatarUri={profile?.avatar_url || profile?.photo_path || ''}
            showAvatar
          />
        )}
      >
        {feedback && (
          <StatusBanner
            variant={feedback.type}
            title={feedback.title}
            message={feedback.message}
            dismissible
            onDismiss={() => setFeedback(null)}
            style={styles.feedbackBanner}
          />
        )}

        <AppCard variant="elevated" radius="xl" padding="lg">
          <DashboardSectionHeader
            title="Account Management"
            description="Manage your profile, security, and preferences"
            style={styles.sectionHeader}
          />

          <View style={styles.actionList}>
            {accountActionItems.map((item) => (
              <ActionRow key={item.key} item={item} onPress={handleActionPress} />
            ))}
          </View>
        </AppCard>
      </DashboardLayout>

      <Modal transparent visible={isPopupVisible} animationType="fade" onRequestClose={handleModalClose}>
        <KeyboardAvoidingView
          style={styles.modalKeyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={handleModalClose} />

            <AppCard
              variant="elevated"
              radius="xl"
              padding="lg"
              style={[styles.modalCard, { height: activeModalHeight }]}
              contentStyle={styles.modalCardContent}
            >
              {mode === 'edit' ? (
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{editModalTitle}</Text>
                    <Text style={styles.modalHint}>{completionHint}</Text>
                  </View>

                  <ScrollView
                    style={styles.modalScrollView}
                    scrollEnabled
                    scrollEventThrottle={16}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    contentContainerStyle={styles.modalScrollContent}
                  >
                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <AppInput
                            label="First Name"
                            placeholder="Enter first name"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                            error={profileErrors?.firstName?.message}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="middleName"
                        render={({ field }) => (
                          <AppInput
                            label="Middle Name"
                            placeholder="Enter middle name (optional)"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <AppInput
                            label="Last Name"
                            placeholder="Enter last name"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                            error={profileErrors?.lastName?.message}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="suffix"
                        render={({ field }) => (
                          <AppInput
                            label="Suffix"
                            placeholder="Jr., Sr., III (optional)"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="birthdate"
                        render={({ field }) => (
                          <DatePickerField
                            label="Birthdate"
                            value={field.value ? new Date(field.value) : null}
                            onChange={(date) => field.onChange(date?.toISOString().split('T')[0] || '')}
                            minimumDate={MINIMUM_BIRTHDATE}
                            maximumDate={getMaximumBirthdate()}
                            error={profileErrors?.birthdate?.message}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="gender"
                        render={({ field }) => (
                          <AppInput
                            label="Gender"
                            placeholder="Select gender"
                            value={field.value || ''}
                            editable={false}
                            error={profileErrors?.gender?.message}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={profileForm.control}
                        name="phone"
                        render={({ field }) => (
                          <AppInput
                            label="Contact Number"
                            placeholder="Enter contact number"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                            error={profileErrors?.phone?.message}
                            keyboardType="phone-pad"
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <SignupAddressSection
                        control={profileForm.control}
                        errors={profileErrors}
                        twoColumnMinWidth={440}
                      />
                    </View>
                  </ScrollView>

                  <View style={styles.modalFooter}>
                    <AppButton
                      title="Cancel"
                      variant="outline"
                      size="md"
                      fullWidth
                      onPress={requestEditModalClose}
                      style={styles.modalButton}
                    />
                    <AppButton
                      title={isSavingProfile ? 'Saving...' : 'Save Changes'}
                      size="md"
                      fullWidth
                      loading={isSavingProfile}
                      onPress={profileForm.handleSubmit(submitProfile)}
                      style={styles.modalButton}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Change Password</Text>
                    <Text style={styles.modalHint}>Enter your current password and choose a new one.</Text>
                  </View>

                  <ScrollView
                    style={styles.modalScrollView}
                    scrollEnabled
                    scrollEventThrottle={16}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                    contentContainerStyle={styles.modalScrollContent}
                  >
                    <View style={styles.formField}>
                      <Controller
                        control={passwordForm.control}
                        name="currentPassword"
                        render={({ field }) => (
                          <PasswordInput
                            label="Current Password"
                            placeholder="Enter your current password"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                            error={passwordForm.formState.errors?.currentPassword?.message}
                          />
                        )}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={passwordForm.control}
                        name="newPassword"
                        render={({ field }) => (
                          <PasswordInput
                            label="New Password"
                            placeholder="Enter new password"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                            error={passwordForm.formState.errors?.newPassword?.message}
                          />
                        )}
                      />
                      {watchedNewPassword && (
                        <StatusBanner
                          variant={passwordStrengthVariant}
                          message={passwordStrengthMessage}
                          style={styles.strengthBanner}
                        />
                      )}
                    </View>

                    <View style={styles.formField}>
                      <Controller
                        control={passwordForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <PasswordInput
                            label="Confirm Password"
                            placeholder="Confirm your new password"
                            value={field.value || ''}
                            onChangeText={field.onChange}
                            error={passwordForm.formState.errors?.confirmPassword?.message}
                          />
                        )}
                      />
                    </View>
                  </ScrollView>

                  <View style={styles.modalFooter}>
                    <AppButton
                      title="Cancel"
                      variant="outline"
                      size="md"
                      fullWidth
                      onPress={() => setMode('view')}
                      style={styles.modalButton}
                    />
                    <AppButton
                      title={isChangingPassword ? 'Updating...' : 'Update Password'}
                      size="md"
                      fullWidth
                      loading={isChangingPassword}
                      onPress={passwordForm.handleSubmit(submitPassword)}
                      style={styles.modalButton}
                    />
                  </View>
                </View>
              )}
            </AppCard>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  feedbackBanner: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  actionList: {
    gap: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    gap: theme.spacing.md,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSecondary,
  },
  actionIconWrapDanger: {
    backgroundColor: theme.colors.errorSurface,
  },
  actionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  actionTitleDanger: {
    color: theme.colors.error,
  },
  actionDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.foregroundMuted,
  },

  modalKeyboardWrap: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    zIndex: 1,
    overflow: 'hidden',
  },
  modalCardContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  modalContent: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  modalHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderMuted,
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  modalHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.foregroundMuted,
  },
  modalScrollView: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  modalScrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
    flexGrow: 1,
  },
  formField: {
    gap: theme.spacing.xs,
  },
  strengthBanner: {
    marginTop: theme.spacing.xs,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
  },
  modalButton: {
    flex: 1,
  },
});
