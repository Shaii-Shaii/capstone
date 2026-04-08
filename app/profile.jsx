import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Alert, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
import { FormProgressStepper } from '../src/components/ui/FormProgressStepper';
import { StatusBanner } from '../src/components/ui/StatusBanner';
import { DashboardSectionHeader } from '../src/components/ui/DashboardSectionHeader';
import { useProfileActions } from '../src/hooks/useProfileActions';
import { useNotifications } from '../src/hooks/useNotifications';
import { theme } from '../src/design-system/theme';
import { getPasswordStrengthMessage } from '../src/utils/passwordRules';
import { logAppEvent } from '../src/utils/appErrors';
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
    patientProfile,
    staffProfile,
    hospitalProfile,
    defaultValues,
    profileCompletionMeta,
    isSavingProfile,
    isChangingPassword,
    isUploadingAvatar,
    getProfileCompletionMeta,
    hasUnsavedProfileChanges,
    saveSharedProfile,
    uploadAvatar,
    changePassword,
  } = useProfileActions();
  const { unreadCount } = useNotifications({ role: profile?.role, userId: user?.id, databaseUserId: profile?.user_id });

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

  useEffect(() => {
    profileForm.reset(defaultValues);
  }, [defaultValues, profileForm]);

  useEffect(() => () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
  }, []);

  const role = profile?.role || 'patient';
  const isPatient = role === 'patient';
  const hasOrganization = !isPatient && Boolean(staffProfile?.hospital_id);
  const navItems = role === 'donor' ? donorDashboardNavItems : patientDashboardNavItems;
  const roleLabel = roleLabelMap[role] || 'Member';
  const firstName = (profile?.first_name || '').trim();
  const middleName = (profile?.middle_name || '').trim();
  const lastName = (profile?.last_name || '').trim();
  const suffix = profile?.suffix || '';
  const avatarUri = profile?.avatar_url || profile?.photo_path || patientProfile?.patient_picture || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();
  const fullName = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');
  const displayRows = useMemo(() => (
    profileDisplayFields
      .map((field) => {
        if (field.key === 'phone') {
          return { ...field, value: profile?.contact_number || profile?.phone || '' };
        }
        return { ...field, value: profile?.[field.key] || '' };
      })
      .filter((field) => field.value)
  ), [profile]);
  const overviewRows = useMemo(() => (
    [
      fullName ? { key: 'full_name', label: 'Full name', value: fullName } : null,
      { key: 'email', label: 'Email', value: user?.email || 'Not available' },
      { key: 'role', label: 'Account type', value: roleLabel },
      ...displayRows,
      hospitalProfile?.hospital_name
        ? { key: 'hospital_name', label: 'Hospital name', value: hospitalProfile.hospital_name }
        : null,
      hospitalProfile?.contact_number
        ? { key: 'hospital_contact', label: 'Hospital contact', value: hospitalProfile.contact_number }
        : null,
      [hospitalProfile?.street, hospitalProfile?.barangay, hospitalProfile?.city, hospitalProfile?.region, hospitalProfile?.country]
        .filter(Boolean)
        .length
        ? {
            key: 'hospital_address',
            label: 'Hospital address',
            value: [hospitalProfile?.street, hospitalProfile?.barangay, hospitalProfile?.city, hospitalProfile?.region, hospitalProfile?.country]
              .filter(Boolean)
              .join(', '),
          }
        : null,
      patientProfile?.patient_id
        ? { key: 'patient_id', label: 'Patient ID', value: String(patientProfile.patient_id) }
        : null,
      patientProfile?.patient_code
        ? { key: 'patient_code', label: 'Patient code', value: patientProfile.patient_code }
        : null,
      patientProfile?.hospital_id
        ? { key: 'patient_hospital', label: 'Hospital ID', value: String(patientProfile.hospital_id) }
        : null,
      patientProfile?.medical_condition
        ? { key: 'medical_condition', label: 'Medical condition', value: patientProfile.medical_condition }
        : null,
      patientProfile?.date_of_diagnosis
        ? { key: 'date_of_diagnosis', label: 'Date of diagnosis', value: patientProfile.date_of_diagnosis }
        : null,
      patientProfile?.guardian
        ? { key: 'guardian', label: 'Guardian', value: patientProfile.guardian }
        : null,
      patientProfile?.guardian_contact_number
        ? { key: 'guardian_contact_number', label: 'Guardian contact', value: patientProfile.guardian_contact_number }
        : null,
      patientProfile?.medical_document
        ? { key: 'medical_document', label: 'Medical document', value: patientProfile.medical_document }
        : null,
      staffProfile?.hospital_id
        ? { key: 'staff_hospital', label: 'Assigned hospital', value: String(staffProfile.hospital_id) }
        : null,
      staffProfile?.assigned_date
        ? { key: 'staff_assigned_date', label: 'Assigned date', value: staffProfile.assigned_date }
        : null,
    ].filter(Boolean)
  ), [
    displayRows,
    fullName,
    hospitalProfile?.barangay,
    hospitalProfile?.city,
    hospitalProfile?.contact_number,
    hospitalProfile?.country,
    hospitalProfile?.hospital_name,
    hospitalProfile?.region,
    hospitalProfile?.street,
    patientProfile?.hospital_id,
    patientProfile?.date_of_diagnosis,
    patientProfile?.guardian,
    patientProfile?.guardian_contact_number,
    patientProfile?.medical_document,
    patientProfile?.medical_condition,
    patientProfile?.patient_id,
    patientProfile?.patient_code,
    roleLabel,
    staffProfile?.assigned_date,
    staffProfile?.hospital_id,
    user?.email,
  ]);
  const watchedNewPassword = passwordForm.watch('newPassword');
  const editablePreviewRows = useMemo(() => (
    [
      fullName ? { key: 'preview_name', label: 'Name', value: fullName } : null,
      profile?.birthdate ? { key: 'preview_birthdate', label: 'Birthdate', value: profile.birthdate } : null,
      (profile?.contact_number || profile?.phone)
        ? { key: 'preview_phone', label: 'Contact Number', value: profile?.contact_number || profile?.phone }
        : null,
      [profile?.street, profile?.barangay, profile?.city, profile?.province, profile?.region, profile?.country]
        .filter(Boolean)
        .length
        ? {
            key: 'preview_address',
            label: 'Address',
            value: [profile?.street, profile?.barangay, profile?.city, profile?.province, profile?.region, profile?.country]
              .filter(Boolean)
              .join(', '),
          }
        : null,
    ].filter(Boolean)
  ), [
    fullName,
    profile?.birthdate,
    profile?.contact_number,
    profile?.phone,
    profile?.street,
    profile?.barangay,
    profile?.city,
    profile?.province,
    profile?.region,
    profile?.country,
  ]);
  const actionItems = useMemo(() => (
    [
      ...(!isPatient && hasOrganization ? [{
        key: 'organization',
        icon: 'support',
        title: 'Open Organization',
        description: `Go to hospital ID ${staffProfile?.hospital_id}.`,
      }] : []),
      ...(!isPatient && !hasOrganization ? [{
        key: 'completeSetup',
        icon: 'editProfile',
        title: 'Complete Account Setup',
        description: 'Finish your account details.',
      }] : []),
      ...profileActionConfig,
    ]
  ), [hasOrganization, isPatient, staffProfile?.hospital_id]);
  const passwordStrengthMessage = getPasswordStrengthMessage(watchedNewPassword);
  const passwordStrengthVariant = watchedNewPassword
    ? passwordStrengthMessage === 'Strong password'
      ? 'success'
      : 'info'
    : 'info';
  const isPopupVisible = mode !== 'view';
  const liveProfileCompletionMeta = useMemo(() => (
    getProfileCompletionMeta(watchedProfileValues)
  ), [getProfileCompletionMeta, watchedProfileValues]);
  const activeProfileCompletionMeta = watchedProfileValues
    ? liveProfileCompletionMeta
    : profileCompletionMeta;
  const hasDirtyProfileDraft = mode === 'edit' && hasUnsavedProfileChanges(watchedProfileValues);
  const editModalTitle = role === 'donor' && !activeProfileCompletionMeta.isComplete
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
      role,
    });
    closeEditModal();
  }, [closeEditModal, profile?.user_id, role, user?.id]);

  const requestEditModalClose = useCallback(() => {
    if (!hasDirtyProfileDraft) {
      closeEditModal();
      return;
    }

    Alert.alert(
      'Discard changes?',
      'Unsaved changes will not be saved.',
      [
        {
          text: 'Continue Editing',
          style: 'cancel',
        },
        {
          text: 'Discard Changes',
          style: 'destructive',
          onPress: handleDiscardProfileChanges,
        },
      ]
    );
  }, [closeEditModal, handleDiscardProfileChanges, hasDirtyProfileDraft]);

  const handleModalClose = useCallback(() => {
    if (mode === 'edit') {
      requestEditModalClose();
      return;
    }

    if (mode === 'password') {
      passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }

    setMode('view');
  }, [mode, passwordForm, requestEditModalClose]);

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
    if (item.key === 'organization') {
      router.navigate('/donor/home');
      return;
    }
    if (item.key === 'completeSetup') {
      setMode('edit');
      return;
    }
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

  return (
    <>
      <DashboardLayout
        navItems={navItems}
        activeNavKey="profile"
        navVariant={role === 'donor' ? 'donor' : 'patient'}
        onNavPress={handleNavPress}
        header={(
          <DashboardHeader
            title="Profile"
            subtitle=""
            summary=""
            avatarInitials={avatarInitials}
            avatarUri={avatarUri}
            variant={role === 'donor' ? 'donor' : 'patient'}
            minimal={role === 'patient'}
            showAvatar={role === 'patient' ? false : undefined}
            utilityActions={role === 'patient' ? [
              {
                key: 'notifications',
                icon: 'notifications',
                badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
                onPress: () => router.navigate('/patient/notifications'),
              },
            ] : []}
          />
        )}
      >
        <AppCard variant={role === 'donor' ? 'donorTint' : 'patientTint'} radius="xl" padding="lg">
          <DashboardSectionHeader
            title="Overview"
            description=""
            style={styles.sectionHeader}
          />

          <View style={styles.overviewButtonRow}>
            <AppButton
              title="Change Photo"
              variant="outline"
              size="md"
              fullWidth={false}
              loading={isUploadingAvatar}
              leading={<AppIcon name="camera" state="muted" />}
              onPress={handlePhotoPress}
              style={styles.overviewButton}
            />
          </View>

          <View style={styles.overviewList}>
            {overviewRows.map((row) => (
              <View key={row.key} style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>{row.label}</Text>
                <Text style={styles.overviewValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard variant="elevated" radius="xl" padding="lg">
          <DashboardSectionHeader
            title="Actions"
            description=""
            style={styles.sectionHeader}
          />

          <View style={styles.actionList}>
            {actionItems.map((item) => (
              <ActionRow key={item.key} item={item} onPress={handleActionPress} />
            ))}
          </View>
        </AppCard>

        <Modal transparent visible={isPopupVisible} animationType="fade" onRequestClose={handleModalClose}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={handleModalClose} />

              <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {mode === 'edit' ? (
                    <>
                      <DashboardSectionHeader
                        title={editModalTitle}
                        description=""
                        style={styles.sectionHeader}
                      />

                      <View style={styles.completionCard}>
                        <View style={styles.completionHeader}>
                          <Text style={styles.completionTitle}>Profile Completion</Text>
                          <Text style={styles.completionPercent}>{activeProfileCompletionMeta.percentage}%</Text>
                        </View>
                        <View style={styles.completionBarTrack}>
                          <View
                            style={[
                              styles.completionBarFill,
                              { width: `${activeProfileCompletionMeta.percentage}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.completionCaption}>
                          {activeProfileCompletionMeta.completedFieldCount}/{activeProfileCompletionMeta.totalFieldCount} fields complete
                        </Text>
                        <FormProgressStepper
                          steps={activeProfileCompletionMeta.steps}
                          currentStep={activeProfileCompletionMeta.currentStep}
                        />
                        <Text style={styles.completionHint}>{completionHint}</Text>
                      </View>

                      <View style={styles.editPreviewCard}>
                        <Text style={styles.editPreviewTitle}>Current</Text>
                        <View style={styles.editPreviewList}>
                          {editablePreviewRows.map((row) => (
                            <View key={row.key} style={styles.editPreviewRow}>
                              <Text style={styles.editPreviewLabel}>{row.label}</Text>
                              <Text style={styles.editPreviewValue}>{row.value}</Text>
                            </View>
                          ))}
                        </View>
                      </View>

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
                              disabled={field.editable === false}
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
                        <AppTextLink title="Close" variant="muted" onPress={requestEditModalClose} />
                      </View>
                    </>
                  ) : null}

                  {mode === 'password' ? (
                    <>
                      <DashboardSectionHeader
                        title="Change Password"
                        description=""
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
                        <AppTextLink title="Close" variant="muted" onPress={handleModalClose} />
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
  overviewButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  overviewButton: {
    minWidth: 148,
  },
  overviewList: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
    overflow: 'hidden',
  },
  overviewRow: {
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  overviewLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  overviewValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
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
  completionCard: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  completionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  completionPercent: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  completionBarTrack: {
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderSubtle,
    overflow: 'hidden',
  },
  completionBarFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  completionCaption: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  completionHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalCard: {
    maxHeight: '90%',
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
  },
  modalScroll: {
    maxHeight: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.lg,
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
  editPreviewCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  editPreviewTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  editPreviewList: {
    gap: theme.spacing.sm,
  },
  editPreviewRow: {
    gap: 2,
  },
  editPreviewLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  editPreviewValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
});
