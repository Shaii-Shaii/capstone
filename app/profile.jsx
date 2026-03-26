import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Image, Alert, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { DashboardLayout } from '../src/components/layout/DashboardLayout';
import { DashboardHeader } from '../src/components/ui/DashboardHeader';
import { AppCard } from '../src/components/ui/AppCard';
import { AppInput } from '../src/components/ui/AppInput';
import { PasswordInput } from '../src/components/ui/PasswordInput';
import { AppButton } from '../src/components/ui/AppButton';
import { AppTextLink } from '../src/components/ui/AppTextLink';
import { AppIcon } from '../src/components/ui/AppIcon';
import { StatusBanner } from '../src/components/ui/StatusBanner';
import { DashboardSectionHeader } from '../src/components/ui/DashboardSectionHeader';
import { useProfileActions } from '../src/hooks/useProfileActions';
import { theme } from '../src/design-system/theme';
import { getPasswordStrengthMessage } from '../src/utils/passwordRules';
import {
  passwordFieldConfig,
  profileActionConfig,
  profileDisplayFields,
  profileFieldConfig,
  roleLabelMap,
} from '../src/constants/profile';
import { changePasswordSchema, profileUpdateSchema } from '../src/features/profile/profile.schema';
import { donorDashboardNavItems, patientDashboardNavItems } from '../src/constants/dashboard';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

export default function ProfileScreen() {
  const router = useRouter();
  const {
    user,
    profile,
    defaultValues,
    isSavingProfile,
    isChangingPassword,
    isUploadingAvatar,
    saveSharedProfile,
    uploadAvatar,
    changePassword,
  } = useProfileActions();

  const [mode, setMode] = useState('view');
  const [feedback, setFeedback] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
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

  useEffect(() => {
    profileForm.reset(defaultValues);
  }, [defaultValues, profileForm]);

  useEffect(() => () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
  }, []);

  const role = profile?.role || 'patient';
  const navItems = role === 'donor' ? donorDashboardNavItems : patientDashboardNavItems;
  const roleLabel = roleLabelMap[role] || 'Member';
  const firstName = profile?.first_name || 'Hair for Hope';
  const lastName = profile?.last_name || 'Member';
  const fullName = `${firstName} ${lastName}`.trim();
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim() || 'SS';
  const displayRows = useMemo(() => (
    profileDisplayFields
      .map((field) => ({ ...field, value: profile?.[field.key] }))
      .filter((field) => field.value)
  ), [profile]);
  const watchedNewPassword = passwordForm.watch('newPassword');
  const passwordStrengthMessage = getPasswordStrengthMessage(watchedNewPassword);
  const passwordStrengthVariant = watchedNewPassword
    ? passwordStrengthMessage === 'Strong password'
      ? 'success'
      : 'info'
    : 'info';
  const isPopupVisible = mode !== 'view';
  const setFloatingFeedback = (type, title, message) => {
    setFeedback({ type, title, message });
  };

  const handleNavPress = async (item) => {
    if (item.route === '/profile') return;
    if (item.isPlaceholder) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert('Coming Soon', `${item.label} will be added in the next update.`);
      return;
    }
    router.replace(item.route);
  };

  const handleActionPress = async (item) => {
    await Haptics.selectionAsync();
    setFeedback(null);
    setMode(item.key === 'edit' ? 'edit' : 'password');
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

  const handlePhotoPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await uploadAvatar();
    if (result.canceled) return;

    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setImageFailed(false);
      setFloatingFeedback('success', 'Photo Updated', 'Your profile photo is now visible across your account.');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFloatingFeedback('error', 'Photo Update Failed', result.error || 'Unable to update your profile photo.');
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

  return (
    <>
      <DashboardLayout
        navItems={navItems}
        activeNavKey="profile"
        navVariant={role === 'donor' ? 'donor' : 'patient'}
        onNavPress={handleNavPress}
        header={(
          <DashboardHeader
            title="My Profile"
            subtitle={user?.email || 'No email found'}
            summary="Review your account details, update your contact information, and manage your security settings."
            avatarInitials={avatarInitials}
            avatarUri={profile?.avatar_url}
            variant={role === 'donor' ? 'donor' : 'patient'}
            statusChips={[roleLabel, profile?.is_profile_completed ? 'Profile ready' : 'Profile in progress']}
          />
        )}
      >
        <AppCard variant={role === 'donor' ? 'donorTint' : 'patientTint'} radius="xl" padding="lg">
          <View style={styles.profileTopRow}>
            <View style={styles.avatarSection}>
              {profile?.avatar_url && !imageFailed ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImage}
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{avatarInitials.toUpperCase().slice(0, 2)}</Text>
                </View>
              )}
              <AppButton
                title="Change Photo"
                variant="outline"
                size="md"
                fullWidth={false}
                loading={isUploadingAvatar}
                leading={<AppIcon name="camera" state="muted" />}
                onPress={handlePhotoPress}
                style={styles.photoButton}
              />
            </View>

            <View style={styles.identitySection}>
              <View style={styles.roleBadge}>
                <AppIcon name="role" state="active" size="sm" />
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
              <Text style={styles.nameText}>{fullName}</Text>
              <View style={styles.infoRow}>
                <AppIcon name="email" state="muted" size="sm" />
                <Text style={styles.infoText}>{user?.email || 'No email found'}</Text>
              </View>
              {displayRows.map((row) => (
                <View key={row.key} style={styles.infoRow}>
                  <AppIcon name={row.icon} state="muted" size="sm" />
                  <Text style={styles.infoText}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </AppCard>

        <AppCard variant="elevated" radius="xl" padding="lg">
          <DashboardSectionHeader
            title="Account Actions"
            description="Choose what you want to manage next."
            style={styles.sectionHeader}
          />

          <View style={styles.actionList}>
            {profileActionConfig.map((item) => (
              <ActionRow key={item.key} item={item} onPress={handleActionPress} />
            ))}
          </View>
        </AppCard>

        <Modal transparent visible={isPopupVisible} animationType="fade" onRequestClose={() => setMode('view')}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={() => setMode('view')} />

              <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {mode === 'edit' ? (
                    <>
                      <DashboardSectionHeader
                        title="Edit Profile"
                        description="Update the shared information stored in your account profile."
                        style={styles.sectionHeader}
                      />

                      {profileFieldConfig.map((field) => (
                        <Controller
                          key={field.formKey}
                          control={profileForm.control}
                          name={field.formKey}
                          render={({ field: controllerField, fieldState }) => (
                            <AppInput
                              label={field.label}
                              placeholder={field.placeholder}
                              keyboardType={field.keyboardType}
                              variant="filled"
                              helperText={field.helperText}
                              value={controllerField.value}
                              onChangeText={controllerField.onChange}
                              onBlur={controllerField.onBlur}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                      ))}

                      <View style={styles.formActions}>
                        <AppButton
                          title="Save Changes"
                          size="lg"
                          loading={isSavingProfile}
                          success={saveSuccess}
                          onPress={profileForm.handleSubmit(
                            submitProfile,
                            () => setFloatingFeedback('error', 'Check Your Details', 'Please correct the highlighted profile fields before saving.')
                          )}
                          leading={<AppIcon name="save" state="inverse" />}
                        />
                        <AppTextLink title="Close" variant="muted" onPress={() => setMode('view')} />
                      </View>
                    </>
                  ) : null}

                  {mode === 'password' ? (
                    <>
                      <DashboardSectionHeader
                        title="Change Password"
                        description="Set a new password for your current signed-in account without leaving your profile flow."
                        style={styles.sectionHeader}
                      />

                      <View style={styles.passwordMeterCard}>
                        <View style={styles.passwordMeterHeader}>
                          <AppIcon
                            name={passwordStrengthVariant === 'success' ? 'success' : 'shield'}
                            state={passwordStrengthVariant === 'success' ? 'success' : 'muted'}
                            size="sm"
                          />
                          <Text style={styles.passwordMeterTitle}>Password strength</Text>
                        </View>
                        <Text style={styles.passwordMeterMessage}>
                          {watchedNewPassword
                            ? passwordStrengthMessage
                            : 'Use at least 8 characters with uppercase, lowercase, a number, and a special character.'}
                        </Text>
                      </View>

                      {passwordFieldConfig.map((field) => (
                        <Controller
                          key={field.key}
                          control={passwordForm.control}
                          name={field.key}
                          render={({ field: controllerField, fieldState }) => (
                            <PasswordInput
                              label={field.label}
                              placeholder={field.placeholder}
                              variant="filled"
                              helperText={field.helperText}
                              value={controllerField.value}
                              onChangeText={controllerField.onChange}
                              onBlur={controllerField.onBlur}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                      ))}

                      <View style={styles.formActions}>
                        <AppButton
                          title="Update Password"
                          size="lg"
                          loading={isChangingPassword}
                          success={passwordSuccess}
                          onPress={passwordForm.handleSubmit(
                            submitPassword,
                            () => setFloatingFeedback('error', 'Password Not Ready', 'Please resolve the highlighted password fields before continuing.')
                          )}
                          leading={<AppIcon name="changePassword" state="inverse" />}
                        />
                        <AppTextLink title="Close" variant="muted" onPress={() => setMode('view')} />
                      </View>
                    </>
                  ) : null}
                </ScrollView>
              </AppCard>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </DashboardLayout>

      <StatusBanner
        presentation="floating"
        visible={Boolean(feedback?.message)}
        variant={feedback?.type || 'info'}
        title={feedback?.title}
        message={feedback?.message}
        onDismiss={() => setFeedback(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  profileTopRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatarImage: {
    width: 92,
    height: 92,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  avatarFallbackText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textInverse,
  },
  photoButton: {
    minWidth: 128,
  },
  identitySection: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  roleBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  nameText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    color: theme.colors.textPrimary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  sectionHeader: {
    marginBottom: theme.spacing.lg,
  },
  actionList: {
    gap: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  actionIconWrapDanger: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  actionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  actionTitleDanger: {
    color: theme.colors.textError,
  },
  actionDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  formActions: {
    marginTop: theme.spacing.md,
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  passwordMeterCard: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  passwordMeterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  passwordMeterTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  passwordMeterMessage: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  modalCard: {
    maxHeight: '82%',
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
  },
  modalScroll: {
    maxHeight: '100%',
  },
  modalScrollContent: {
    paddingBottom: theme.spacing.xs,
  },
  modalKeyboardWrap: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
});
