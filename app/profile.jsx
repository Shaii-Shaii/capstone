import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Alert, ScrollView, Modal, KeyboardAvoidingView, Platform, useWindowDimensions, Image } from 'react-native';
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
import { DatePickerField } from '../src/components/ui/DatePickerField';
import { StatusBanner } from '../src/components/ui/StatusBanner';
import { DashboardSectionHeader } from '../src/components/ui/DashboardSectionHeader';
import { AddressOptionSheet, AddressSelectField, SignupAddressSection } from '../src/components/auth/SignupAddressSection';
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
  profileGenderOptions,
  roleLabelMap,
} from '../src/constants/profile';
import { changePasswordSchema, profileUpdateSchema } from '../src/features/profile/profile.schema';
import { donorDashboardNavItems, patientDashboardNavItems } from '../src/constants/dashboard';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PROFILE_MINIMUM_AGE = 18;
const MINIMUM_BIRTHDATE = new Date(1900, 0, 1);
const REQUIRED_PROFILE_FIELDS = new Set(['firstName', 'lastName', 'birthdate', 'gender', 'phone']);

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

export default function ProfileScreen() {
  const router = useRouter();
  const { height: viewportHeight } = useWindowDimensions();
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
  const normalizedRole = String(profile?.role || '').trim().toLowerCase();
  const resolvedRole = normalizedRole === 'patient' ? 'patient' : 'donor';
  const { unreadCount } = useNotifications({ role: resolvedRole, userId: user?.id, databaseUserId: profile?.user_id });

  const [mode, setMode] = useState('view');
  const [feedback, setFeedback] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [activeProfilePicker, setActiveProfilePicker] = useState('');
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

  const role = resolvedRole;
  const isPatient = role === 'patient';
  const hasOrganization = !isPatient && Boolean(staffProfile?.hospital_id);
  const navItems = role === 'donor' ? donorDashboardNavItems : patientDashboardNavItems;
  const roleLabel = roleLabelMap[normalizedRole] || roleLabelMap[role] || 'Member';
  const donorProfileReady = profileCompletionMeta?.isComplete;
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
  const watchedGender = useWatch({ control: profileForm.control, name: 'gender' });
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
  const donorActionItems = useMemo(() => (
    [
      {
        key: 'account',
        icon: 'settings',
        title: donorProfileReady ? 'Manage Account' : 'Complete Account Setup',
        description: donorProfileReady
          ? 'Edit profile details, update your photo, and change your password.'
          : 'Finish the core donor details on your account.',
      },
      {
        key: 'achievements',
        icon: 'sparkle',
        title: 'Achievements',
        description: 'View donor certificates and recognition milestones.',
      },
      {
        key: 'history',
        icon: 'checkHair',
        title: 'Hair Analysis History',
        description: 'Open your saved hair-check results in a separate screen.',
      },
    ]
  ), [donorProfileReady]);
  const actionItems = useMemo(() => (
    role === 'donor'
      ? donorActionItems
      : [
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
  ), [donorActionItems, hasOrganization, isPatient, role, staffProfile?.hospital_id]);
  const passwordStrengthMessage = getPasswordStrengthMessage(watchedNewPassword);
  const passwordStrengthVariant = watchedNewPassword
    ? passwordStrengthMessage === 'Strong password'
      ? 'success'
      : 'info'
    : 'info';
  const isPopupVisible = mode !== 'view';
  const modalMaxHeight = Math.max(360, viewportHeight - theme.spacing.xl * 2);
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
    setActiveProfilePicker('');
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
    if (role === 'donor') {
      if (item.key === 'account') {
        router.navigate('/donor/account');
        return;
      }
      if (item.key === 'achievements') {
        router.navigate('/donor/achievements');
        return;
      }
      if (item.key === 'history') {
        router.navigate('/donor/hair-history');
        return;
      }
    }
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
    setActiveProfilePicker('');
    setMode('view');
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
      setActiveProfilePicker('');
      profileForm.reset(defaultValues);
    }

    if (mode === 'password') {
      setActiveProfilePicker('');
      passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }

    if (mode === 'view') {
      setActiveProfilePicker('');
    }
  }, [defaultValues, mode, passwordForm, profileForm]);

  const renderDonorProfileContent = () => (
    <>
      <AppCard variant="elevated" radius="xl" padding="lg" style={styles.profileHeroCard}>
        <View style={styles.profileHeroTopRow}>
          <View style={styles.profileHeroIdentity}>
            <View style={styles.profileHeroAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.profileHeroAvatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.profileHeroAvatarText}>{(avatarInitials || 'DN').toUpperCase().slice(0, 2)}</Text>
              )}
            </View>

            <View style={styles.profileHeroCopy}>
              <Text numberOfLines={2} style={styles.profileHeroName}>{fullName || 'Complete your donor profile'}</Text>
              <Text numberOfLines={1} style={styles.profileHeroEmail}>{user?.email || 'No email linked'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileHeroFooter}>
          <AppButton
            title="Change Photo"
            variant="outline"
            size="sm"
            fullWidth={false}
            loading={isUploadingAvatar}
            leading={<AppIcon name="camera" state="muted" />}
            onPress={handlePhotoPress}
          />
        </View>
      </AppCard>

      <AppCard variant="elevated" radius="xl" padding="lg">
        <DashboardSectionHeader
          title="Profile Actions"
          description="Open donor account tools, achievements, and separate history modules."
          style={styles.sectionHeader}
        />

        <View style={styles.actionList}>
          {donorActionItems.map((item) => (
            <ActionRow key={item.key} item={item} onPress={handleActionPress} />
          ))}
        </View>
      </AppCard>
    </>
  );

  return (
    <>
      <DashboardLayout
        screenVariant={role === 'donor' ? 'default' : 'dashboard'}
        navItems={navItems}
        activeNavKey="profile"
        navVariant={role === 'donor' ? 'donor' : 'patient'}
        onNavPress={handleNavPress}
        header={(
          <DashboardHeader
            title="Profile"
            subtitle=""
            summary=""
            variant={role === 'donor' ? 'donor' : 'patient'}
            minimal={role === 'patient'}
            showAvatar={false}
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
        {role === 'donor' ? renderDonorProfileContent() : (
          <>
            <AppCard variant="patientTint" radius="xl" padding="lg">
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
          </>
        )}

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
                style={[styles.modalCard, { maxHeight: modalMaxHeight }]}
                contentStyle={styles.modalCardContent}
              >
                {mode === 'edit' ? (
                  <>
                    <View style={styles.modalHeaderBlock}>
                      <DashboardSectionHeader
                        title={editModalTitle}
                        description=""
                        style={styles.sectionHeaderCompact}
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
                        <Text style={styles.completionHint}>{completionHint}</Text>
                      </View>
                    </View>

                    <ScrollView
                      style={styles.modalBodyScroll}
                      contentContainerStyle={styles.modalBodyContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                      nestedScrollEnabled={true}
                    >
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

                      {profileFieldConfig.map((field) => {
                        if (field.formKey === 'street') {
                          return (
                            <SignupAddressSection
                              key="profile-address-section"
                              control={profileForm.control}
                              errors={profileErrors}
                              setValue={profileForm.setValue}
                              showHeader={false}
                              showHelperText={false}
                              showTopBorder={false}
                            />
                          );
                        }

                        if (['barangay', 'region', 'city', 'province', 'country'].includes(field.formKey)) {
                          return null;
                        }

                        return (
                          <Controller
                            key={field.formKey}
                            control={profileForm.control}
                            name={field.formKey}
                            render={({ field: controllerField, fieldState }) => {
                              if (field.formKey === 'birthdate') {
                                return (
                                  <DatePickerField
                                    label={field.label}
                                    required={REQUIRED_PROFILE_FIELDS.has(field.formKey)}
                                    value={controllerField.value}
                                    placeholder={field.placeholder}
                                    helperText={field.helperText}
                                    error={fieldState.error?.message}
                                    onChange={controllerField.onChange}
                                    onBlur={controllerField.onBlur}
                                    minimumDate={MINIMUM_BIRTHDATE}
                                    maximumDate={getMaximumBirthdate()}
                                    onPress={() => Haptics.selectionAsync()}
                                  />
                                );
                              }

                              if (field.formKey === 'gender') {
                                return (
                                  <>
                                    <AddressSelectField
                                      label={field.label}
                                      required={REQUIRED_PROFILE_FIELDS.has(field.formKey)}
                                      value={watchedGender}
                                      placeholder={field.placeholder}
                                      helperText={field.helperText}
                                      error={fieldState.error?.message}
                                      onPress={async () => {
                                        await Haptics.selectionAsync();
                                        setActiveProfilePicker('gender');
                                      }}
                                    />

                                    <AddressOptionSheet
                                      visible={activeProfilePicker === 'gender'}
                                      title="Select Gender"
                                      placeholder="Search gender"
                                      options={profileGenderOptions}
                                      selectedValue={watchedGender}
                                      onClose={() => setActiveProfilePicker('')}
                                      onSelect={(option) => {
                                        profileForm.setValue('gender', option.value, {
                                          shouldDirty: true,
                                          shouldTouch: true,
                                          shouldValidate: true,
                                        });
                                      }}
                                    />
                                  </>
                                );
                              }

                              return (
                                <AppInput
                                  label={field.label}
                                  required={REQUIRED_PROFILE_FIELDS.has(field.formKey)}
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
                              );
                            }}
                          />
                        );
                      })}

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
                    </ScrollView>
                  </>
                ) : null}

                {mode === 'password' ? (
                  <>
                    <View style={styles.modalHeaderBlock}>
                      <DashboardSectionHeader
                        title="Change Password"
                        description=""
                        style={styles.sectionHeaderCompact}
                      />
                    </View>

                    <ScrollView
                      style={styles.modalBodyScroll}
                      contentContainerStyle={styles.modalBodyContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                      nestedScrollEnabled={true}
                    >
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
                    </ScrollView>
                  </>
                ) : null}
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
  profileHeroCard: {
    overflow: 'hidden',
  },
  profileHeroTopRow: {
    marginBottom: theme.spacing.md,
  },
  profileHeroIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  profileHeroAvatar: {
    width: 74,
    height: 74,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  profileHeroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  profileHeroAvatarText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.brandPrimary,
  },
  profileHeroCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  profileHeroName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  profileHeroEmail: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  profileHeroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  profileHeroBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  profileHeroBadgeMuted: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  profileHeroBadgeSuccess: {
    backgroundColor: theme.colors.brandPrimaryMuted,
    borderColor: theme.colors.borderSubtle,
  },
  profileHeroBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  profileHeroBadgeTextSuccess: {
    color: theme.colors.textSuccess,
  },
  profileHeroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  profileHeroJoined: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  overviewTile: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 148,
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  overviewTileWide: {
    flexBasis: '100%',
  },
  overviewTileLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  overviewTileValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  previewList: {
    gap: theme.spacing.sm,
  },
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
  sectionHeaderCompact: {
    marginBottom: theme.spacing.md,
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
  summaryCompactCard: {
    paddingVertical: theme.spacing.sm,
  },
  summaryCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryCompactCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  summaryCompactDivider: {
    width: 1,
    height: 40,
    backgroundColor: theme.colors.borderSubtle,
    marginHorizontal: theme.spacing.md,
  },
  summaryCompactLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  summaryCompactValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  summaryCompactValueReady: {
    color: theme.colors.textSuccess,
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
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
    minHeight: 0,
    overflow: 'hidden',
    flexShrink: 1,
  },
  modalCardContent: {
    flex: 1,
    minHeight: 0,
  },
  modalHeaderBlock: {
    flexShrink: 0,
  },
  modalBodyScroll: {
    flex: 1,
    minHeight: 0,
  },
  modalBodyContent: {
    paddingBottom: theme.spacing.xl,
  },
  modalKeyboardWrap: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  editPreviewCard: {
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.xs,
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
