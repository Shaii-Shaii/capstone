import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Alert, ScrollView, Modal, KeyboardAvoidingView, Platform, useWindowDimensions, Image, Linking } from 'react-native';
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
import { useAuth } from '../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../src/design-system/theme';
import { getPasswordStrengthMessage } from '../src/utils/passwordRules';
import { logAppEvent } from '../src/utils/appErrors';
import {
  passwordFieldConfig,
  profileDisplayFields,
  profileFieldConfig,
  profileGenderOptions,
  roleLabelMap,
} from '../src/constants/profile';
import { changePasswordSchema, profileUpdateSchema } from '../src/features/profile/profile.schema';
import { donorDashboardNavItems, patientDashboardNavItems } from '../src/constants/dashboard';
import { fetchOrganizationMembershipsByUserId } from '../src/features/donorHome.api';
import { fetchDonationCertificatesByUserId, fetchHairSubmissionsByUserId } from '../src/features/hairSubmission.api';
import {
  fetchActiveGuardianConsent,
  fetchActiveLegalDocument,
  getDonorProfileBadge,
  GUARDIAN_CONSENT_TEXT,
  saveGuardianConsent,
} from '../src/features/donorCompliance.service';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const MINIMUM_BIRTHDATE = new Date(1900, 0, 1);
const REQUIRED_PROFILE_FIELDS = new Set(['firstName', 'lastName', 'birthdate', 'gender', 'phone']);
const APP_VERSION_LABEL = 'Donivra v1.0.0';
const formatPhilippineMobileInput = (value) => String(value || '').replace(/\D/g, '').slice(0, 11);

const getMaximumBirthdate = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

function ProfileMenuRow({ icon, title, description, badge, danger = false, onPress }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.985, theme.motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, theme.motion.spring);
      }}
      style={[styles.profileMenuRow, animatedStyle]}
    >
      <View style={[styles.profileMenuIconWrap, danger ? styles.profileMenuIconDanger : null]}>
        <AppIcon name={icon} size="md" color={danger ? theme.colors.textError : theme.colors.brandPrimary} />
      </View>
      <View style={styles.profileMenuCopy}>
        <Text style={[styles.profileMenuTitle, danger ? styles.profileMenuTitleDanger : null]}>{title}</Text>
        {description ? <Text style={styles.profileMenuDescription}>{description}</Text> : null}
      </View>
      {badge != null ? (
        <View style={styles.profileMenuBadge}>
          <Text style={styles.profileMenuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <AppIcon name="chevronRight" state="muted" />
    </AnimatedPressable>
  );
}

function ProfileMoreRow({ title, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.profileMoreRow, { opacity: pressed ? 0.72 : 1 }]}
    >
      <Text style={styles.profileMoreText}>{title}</Text>
      <AppIcon name="chevronRight" size="sm" state="muted" />
    </Pressable>
  );
}

function PatientProfileRow({ icon, title, value, badge, onPress, danger = false, roles = null }) {
  const disabled = !onPress;
  const rowRoles = roles || {};

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.patientProfileRow,
        {
          opacity: pressed ? 0.72 : 1,
          backgroundColor: rowRoles.supportCardBackground || theme.colors.surfaceCard,
          borderColor: rowRoles.supportCardBorder || theme.colors.borderSubtle,
        },
      ]}
    >
      <View
        style={[
          styles.patientProfileRowIcon,
          { backgroundColor: danger ? theme.colors.surfaceSoft : rowRoles.iconPrimarySurface || theme.colors.brandPrimaryMuted },
        ]}
      >
        <AppIcon
          name={icon}
          size="md"
          color={danger ? theme.colors.textError : rowRoles.iconPrimaryColor || theme.colors.brandPrimary}
        />
      </View>
      <View style={styles.patientProfileRowCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.patientProfileRowTitle,
            { color: danger ? theme.colors.textError : rowRoles.headingText || theme.colors.textPrimary },
          ]}
        >
          {title}
        </Text>
        {value ? (
          <Text numberOfLines={1} style={[styles.patientProfileRowValue, { color: rowRoles.bodyText || theme.colors.textSecondary }]}>
            {value}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.patientProfileRowBadge, { backgroundColor: rowRoles.badgeBackground || theme.colors.brandPrimaryMuted }]}>
          <Text style={[styles.patientProfileRowBadgeText, { color: rowRoles.badgeText || theme.colors.brandPrimary }]}>{badge}</Text>
        </View>
      ) : null}
      {!disabled ? <AppIcon name="chevronRight" state="muted" color={rowRoles.metaText} /> : null}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { height: viewportHeight } = useWindowDimensions();
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
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
    logout,
  } = useProfileActions();
  const normalizedRole = String(profile?.role || '').trim().toLowerCase();
  const resolvedRole = normalizedRole === 'patient' ? 'patient' : 'donor';
  const { unreadCount } = useNotifications({ role: resolvedRole, userId: user?.id, databaseUserId: profile?.user_id });

  const [mode, setMode] = useState('view');
  const [feedback, setFeedback] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [activeProfilePicker, setActiveProfilePicker] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(null);
  const [isGuardianConsentModalOpen, setIsGuardianConsentModalOpen] = useState(false);
  const [isSavingGuardianConsent, setIsSavingGuardianConsent] = useState(false);
  const [guardianConsentDocument, setGuardianConsentDocument] = useState(null);
  const [guardianConsentDocumentError, setGuardianConsentDocumentError] = useState('');
  const [isLoadingGuardianConsentDocument, setIsLoadingGuardianConsentDocument] = useState(false);
  const [guardianConsentForm, setGuardianConsentForm] = useState({
    guardianFullName: '',
    guardianRelationship: '',
    guardianContactNumber: '',
    guardianEmail: '',
    guardianAgreementAccepted: false,
  });
  const [guardianConsentErrors, setGuardianConsentErrors] = useState({});
  const [donorStats, setDonorStats] = useState({
    donations: 0,
    organizations: 0,
    achievements: 0,
  });
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
  const role = resolvedRole;

  useEffect(() => {
    profileForm.reset(defaultValues);
  }, [defaultValues, profileForm]);

  useEffect(() => {
    let isMounted = true;
    const loadGuardianConsent = async () => {
      if (role !== 'donor' || !profile?.user_id) {
        if (isMounted) setGuardianConsent(null);
        return;
      }

      const result = await fetchActiveGuardianConsent(profile.user_id);
      if (isMounted) {
        setGuardianConsent(result.data || null);
      }
    };

    loadGuardianConsent();
    return () => {
      isMounted = false;
    };
  }, [profile?.user_id, role]);

  useEffect(() => {
    let isMounted = true;

    const loadDonorStats = async () => {
      if (role !== 'donor' || !user?.id) {
        if (isMounted) {
          setDonorStats({ donations: 0, organizations: 0, achievements: 0 });
        }
        return;
      }

      const [submissionsResult, membershipsResult, certificatesResult] = await Promise.all([
        fetchHairSubmissionsByUserId(user.id, 100),
        fetchOrganizationMembershipsByUserId(profile?.user_id || null),
        fetchDonationCertificatesByUserId(user.id, 100),
      ]);

      if (!isMounted) return;

      const activeMemberships = (membershipsResult.data || []).filter((membership) => {
        const status = String(membership?.status || '').trim().toLowerCase();
        return status === 'active' || membership?.is_active;
      });

      setDonorStats({
        donations: (submissionsResult.data || []).filter((submission) => {
          const status = String(submission?.status || '').trim().toLowerCase();
          return status && !['cancelled', 'canceled', 'rejected'].includes(status);
        }).length,
        organizations: activeMemberships.length,
        achievements: (certificatesResult.data || []).length,
      });
    };

    loadDonorStats();

    return () => {
      isMounted = false;
    };
  }, [profile?.user_id, role, user?.id]);

  useEffect(() => () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
  }, []);

  const isPatient = role === 'patient';
  const navItems = role === 'donor' ? donorDashboardNavItems : patientDashboardNavItems;
  const roleLabel = roleLabelMap[normalizedRole] || roleLabelMap[role] || 'Member';
  const firstName = (profile?.first_name || '').trim();
  const middleName = (profile?.middle_name || '').trim();
  const lastName = (profile?.last_name || '').trim();
  const suffix = profile?.suffix || '';
  const avatarUri = profile?.avatar_url || profile?.photo_path || patientProfile?.patient_picture || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();
  const fullName = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');
  const profileLocation = [profile?.city, profile?.province || profile?.region, profile?.country || 'Philippines']
    .filter(Boolean)
    .join(', ');
  const donorAgeBadge = useMemo(() => (
    getDonorProfileBadge({ birthdate: profile?.birthdate, guardianConsent })
  ), [guardianConsent, profile?.birthdate]);
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
  const overviewRows = useMemo(() => {
    if (isPatient) {
      return [
        fullName ? { key: 'full_name', label: 'Full name', value: fullName } : null,
        { key: 'email', label: 'Email', value: user?.email || 'Not available' },
        { key: 'role', label: 'Account type', value: roleLabel },
        hospitalProfile?.hospital_name
          ? { key: 'hospital_name', label: 'Hospital', value: hospitalProfile.hospital_name }
          : null,
        patientProfile?.patient_code
          ? { key: 'patient_code', label: 'Patient code', value: patientProfile.patient_code }
          : null,
        patientProfile?.medical_condition
          ? { key: 'medical_condition', label: 'Medical condition', value: patientProfile.medical_condition }
          : null,
        patientProfile?.guardian
          ? { key: 'guardian', label: 'Guardian', value: patientProfile.guardian }
          : null,
        patientProfile?.guardian_contact_number
          ? { key: 'guardian_contact_number', label: 'Guardian contact', value: patientProfile.guardian_contact_number }
          : null,
      ].filter(Boolean);
    }

    return [
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
    ].filter(Boolean);
  }, [
    displayRows,
    fullName,
    hospitalProfile?.barangay,
    hospitalProfile?.city,
    hospitalProfile?.contact_number,
    hospitalProfile?.country,
    hospitalProfile?.hospital_name,
    hospitalProfile?.region,
    hospitalProfile?.street,
    isPatient,
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
  const patientHospitalName = hospitalProfile?.hospital_name || patientProfile?.hospital_name || '';
  const patientMedicalDocument = patientProfile?.medical_document || patientProfile?.medical_document_url || '';
  const watchedGender = useWatch({ control: profileForm.control, name: 'gender' });
  const watchedBirthdate = useWatch({ control: profileForm.control, name: 'birthdate' });
  const setupDonorAgeBadge = useMemo(() => (
    getDonorProfileBadge({ birthdate: watchedBirthdate, guardianConsent })
  ), [guardianConsent, watchedBirthdate]);
  const isMinorProfileDraft = setupDonorAgeBadge && setupDonorAgeBadge.category !== 'Adult';
  const hasActiveGuardianConsent = Boolean(guardianConsent?.guardian_consent_id || guardianConsent?.Guardian_Consent_ID);
  const guardianConsentText = guardianConsentDocument?.content || guardianConsentDocument?.summary || GUARDIAN_CONSENT_TEXT;
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
  const setFloatingFeedback = useCallback((type, title, message) => {
    setFeedback({ type, title, message });
  }, []);

  const updateGuardianConsentField = useCallback((field, value) => {
    setGuardianConsentForm((current) => ({
      ...current,
      [field]: value,
    }));
    setGuardianConsentErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const validateGuardianConsentForm = useCallback(() => {
    const nextErrors = {};
    const fullName = guardianConsentForm.guardianFullName.trim();
    const relationship = guardianConsentForm.guardianRelationship.trim();
    const contactNumber = guardianConsentForm.guardianContactNumber.trim();

    if (!fullName) nextErrors.guardianFullName = 'Guardian full name is required.';
    if (!relationship) nextErrors.guardianRelationship = 'Relationship is required.';
    if (!contactNumber) nextErrors.guardianContactNumber = 'Guardian contact number is required.';
    if (!guardianConsentForm.guardianAgreementAccepted) nextErrors.guardianAgreementAccepted = 'Please confirm guardian consent to continue.';

    setGuardianConsentErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [guardianConsentForm]);

  const closeGuardianConsentModal = useCallback(() => {
    if (isSavingGuardianConsent) return;
    setIsGuardianConsentModalOpen(false);
    setGuardianConsentErrors({});
  }, [isSavingGuardianConsent]);

  const openGuardianConsentModal = useCallback(async () => {
    setIsGuardianConsentModalOpen(true);
    if (guardianConsentDocument || isLoadingGuardianConsentDocument) return;

    setGuardianConsentDocumentError('');
    setIsLoadingGuardianConsentDocument(true);
    const result = await fetchActiveLegalDocument('Guardian Consent');
    setIsLoadingGuardianConsentDocument(false);

    if (result.error) {
      setGuardianConsentDocumentError(result.error.message || 'Guardian consent document could not be loaded.');
      return;
    }

    setGuardianConsentDocument(result.data);
  }, [guardianConsentDocument, isLoadingGuardianConsentDocument]);

  const submitGuardianConsent = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!profile?.user_id) {
      setFloatingFeedback('error', 'Profile Not Ready', 'Please save your donor account first, then complete guardian consent.');
      return;
    }

    if (!validateGuardianConsentForm()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSavingGuardianConsent(true);
    const result = await saveGuardianConsent({
      userId: profile.user_id,
      guardianFullName: guardianConsentForm.guardianFullName,
      guardianRelationship: guardianConsentForm.guardianRelationship,
      guardianContactNumber: guardianConsentForm.guardianContactNumber,
      guardianEmail: guardianConsentForm.guardianEmail,
      publicPostingAllowed: false,
      consentTextSnapshot: guardianConsentText,
    });
    setIsSavingGuardianConsent(false);

    if (result.error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFloatingFeedback('error', 'Consent Not Saved', result.error.message || 'Guardian consent could not be saved. Please try again.');
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const refreshed = await fetchActiveGuardianConsent(profile.user_id);
    setGuardianConsent(refreshed.data || result.data || { guardian_consent_id: true });
    setGuardianConsentForm({
      guardianFullName: '',
      guardianRelationship: '',
      guardianContactNumber: '',
      guardianEmail: '',
      guardianAgreementAccepted: false,
    });
    setIsGuardianConsentModalOpen(false);
    setFloatingFeedback('success', 'Consent Completed', 'Guardian consent is now saved for this donor account.');
  }, [guardianConsentForm, guardianConsentText, profile?.user_id, setFloatingFeedback, validateGuardianConsentForm]);

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

  const handleMorePress = useCallback((label) => {
    setFloatingFeedback('info', label, `${label} settings will be available in the next update.`);
  }, [setFloatingFeedback]);

  const handleOpenMedicalDocument = useCallback(async () => {
    if (!patientMedicalDocument) {
      setFloatingFeedback('info', 'No Document', 'No medical document is linked yet.');
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(patientMedicalDocument);
      if (!canOpen) {
        setFloatingFeedback('error', 'Cannot Open File', 'The linked document cannot be opened on this device.');
        return;
      }
      await Linking.openURL(patientMedicalDocument);
    } catch (error) {
      setFloatingFeedback('error', 'Cannot Open File', error?.message || 'Unable to open the medical document.');
    }
  }, [patientMedicalDocument, setFloatingFeedback]);

  const handleLogoutPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await logout();
    if (result?.success && !result?.error) {
      router.replace('/auth/access');
      return;
    }
    if (result?.error) {
      setFloatingFeedback('error', 'Logout Failed', result.error || 'Unable to log out right now.');
    }
  }, [logout, router, setFloatingFeedback]);

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
    <View style={styles.profileMainShell}>
      <View style={styles.profileTopAppBar}>
        <Pressable
          accessibilityLabel="Go to donor home"
          onPress={() => router.navigate('/donor/home')}
          style={({ pressed }) => [styles.profileTopIconButton, { opacity: pressed ? 0.72 : 1 }]}
        >
          <AppIcon name="menu" size="lg" state="muted" />
        </Pressable>
        <Text style={styles.profileBrandTitle}>{resolvedTheme?.brandName || 'Donivra'}</Text>
        <Pressable
          accessibilityLabel="Open settings"
          onPress={() => setMode('password')}
          style={({ pressed }) => [styles.profileTopIconButton, { opacity: pressed ? 0.72 : 1 }]}
        >
          <AppIcon name="settings" size="lg" state="muted" />
        </Pressable>
      </View>

      <View style={styles.profileHeroPanel}>
        <View style={styles.profileHeroDecorOne} />
        <View style={styles.profileHeroDecorTwo} />
        <Pressable
          onPress={handlePhotoPress}
          disabled={isUploadingAvatar}
          style={({ pressed }) => [styles.profileHeroPhotoButton, { opacity: pressed ? 0.86 : 1 }]}
        >
          <View style={styles.profileHeroPhoto}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.profileHeroAvatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.profileHeroAvatarText}>{(avatarInitials || 'DN').toUpperCase().slice(0, 2)}</Text>
            )}
          </View>
          <View style={styles.profileHeroCameraBadge}>
            <AppIcon name="camera" size="sm" color={theme.colors.surfaceCard} />
          </View>
        </Pressable>

        <View style={styles.profileHeroCopyCentered}>
          <Text numberOfLines={2} style={styles.profileHeroDisplayName}>
            {fullName || 'Complete your donor profile'}
          </Text>
          <View style={styles.profileRolePill}>
            <Text style={styles.profileRolePillText}>{roleLabel}</Text>
          </View>
          <Text numberOfLines={1} style={styles.profileHeroEmailText}>{user?.email || 'No email linked'}</Text>
          {profileLocation ? (
            <View style={styles.profileLocationRow}>
              <AppIcon name="location" size="sm" state="muted" />
              <Text numberOfLines={1} style={styles.profileLocationText}>{profileLocation}</Text>
            </View>
          ) : null}
          {donorAgeBadge ? (
            <View
              style={[
                styles.donorAgeBadge,
                donorAgeBadge.tone === 'success' ? styles.donorAgeBadgeSuccess : styles.donorAgeBadgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.donorAgeBadgeText,
                  donorAgeBadge.tone === 'success' ? styles.donorAgeBadgeTextSuccess : styles.donorAgeBadgeTextWarning,
                ]}
              >
                {donorAgeBadge.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.profileStatsGrid}>
        {[
          { key: 'donations', label: 'Donations', value: donorStats.donations },
          { key: 'organizations', label: 'Organizations', value: donorStats.organizations },
          { key: 'achievements', label: 'Achievements', value: donorStats.achievements },
        ].map((item) => (
          <View key={item.key} style={styles.profileStatTile}>
            <Text style={styles.profileStatValue}>{item.value}</Text>
            <Text numberOfLines={1} style={styles.profileStatLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionEyebrow}>Account</Text>
        <ProfileMenuRow
          icon="editProfile"
          title="Edit Profile"
          description="Update personal information"
          onPress={() => setMode('edit')}
        />
        <ProfileMenuRow
          icon="role"
          title="Account Details"
          description="Manage contact and address"
          onPress={() => setMode('edit')}
        />
        <ProfileMenuRow
          icon="changePassword"
          title="Change Password"
          description="Update your security credentials"
          onPress={() => setMode('password')}
        />
        <ProfileMenuRow
          icon="updates"
          title="History"
          description="View past donations"
          badge={donorStats.donations}
          onPress={() => router.navigate('/donor/donation-history')}
        />
        <ProfileMenuRow
          icon="sparkle"
          title="Achievements"
          description="Milestones reached"
          badge={donorStats.achievements}
          onPress={() => router.navigate('/donor/achievements')}
        />
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionEyebrow}>More</Text>
        <View style={styles.profileMoreCard}>
          <ProfileMoreRow title="Notifications" onPress={() => router.navigate('/donor/notifications')} />
          <ProfileMoreRow title="Privacy" onPress={() => handleMorePress('Privacy')} />
          <ProfileMoreRow title="Help" onPress={() => handleMorePress('Help')} />
          <ProfileMoreRow title="About" onPress={() => handleMorePress('About')} />
          <ProfileMoreRow title="Terms" onPress={() => handleMorePress('Terms')} />
        </View>
      </View>

      <View style={styles.profileLogoutSection}>
        <AppButton
          title="Logout"
          variant="outline"
          fullWidth
          onPress={handleLogoutPress}
          leading={<AppIcon name="signOut" state="danger" />}
          style={styles.profileLogoutButton}
          textColorOverride={theme.colors.textError}
          borderColorOverride={theme.colors.textError}
        />
        <Text style={styles.profileVersionText}>{APP_VERSION_LABEL}</Text>
      </View>
    </View>
  );

  const renderPatientProfileContent = () => (
    <View style={styles.patientProfileShell}>
      <View style={styles.patientProfileHero}>
        <Pressable
          accessibilityLabel="Change profile photo"
          onPress={handlePhotoPress}
          disabled={isUploadingAvatar}
          style={({ pressed }) => [styles.patientProfileAvatarButton, { opacity: pressed ? 0.86 : 1 }]}
        >
          <View
            style={[
              styles.patientProfileAvatar,
              {
                backgroundColor: roles.supportCardBackground,
                borderColor: roles.supportCardBorder,
              },
            ]}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.profileHeroAvatarImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.patientProfileAvatarText, { color: roles.headingText }]}>
                {(avatarInitials || 'PT').toUpperCase().slice(0, 2)}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.patientProfileVerifiedBadge,
              {
                backgroundColor: roles.primaryActionBackground,
                borderColor: roles.pageBackground,
              },
            ]}
          >
            <AppIcon name="check-decagram" size="sm" color={roles.primaryActionText} />
          </View>
        </Pressable>

        <Text numberOfLines={2} style={[styles.patientProfileName, { color: roles.headingText }]}>
          {fullName || 'Patient account'}
        </Text>
        <View style={[styles.patientProfileStatusPill, { backgroundColor: roles.badgeStrongBackground }]}>
          <AppIcon name="checkmarkCircle" size="sm" color={roles.badgeStrongText} />
          <Text style={[styles.patientProfileStatusText, { color: roles.badgeStrongText }]}>Verified Patient</Text>
        </View>
        {patientProfile?.patient_code ? (
          <Text numberOfLines={1} style={[styles.patientProfileCode, { color: roles.metaText }]}>
            {patientProfile.patient_code}
          </Text>
        ) : null}
      </View>

      <View style={styles.patientProfileGrid}>
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.patientProfileCard}>
          <View style={styles.patientProfileCardHeader}>
            <Text style={[styles.patientProfileCardTitle, { color: roles.headingText, marginBottom: 0 }]}>Medical Information</Text>
            <AppIcon name="medical-bag" size="lg" color={roles.iconPrimaryColor} />
          </View>
          <View style={styles.patientProfileRows}>
            <PatientProfileRow
              icon="hospital-building"
              title="Clinic / Hospital"
              value={patientHospitalName || 'Not linked'}
              roles={roles}
            />
            <PatientProfileRow
              icon="clipboard-pulse-outline"
              title="Condition"
              value={patientProfile?.medical_condition || 'Not provided'}
              roles={roles}
            />
            <PatientProfileRow
              icon="account-heart-outline"
              title="Guardian"
              value={patientProfile?.guardian || 'Not provided'}
              roles={roles}
            />
            <PatientProfileRow
              icon="folder-account-outline"
              title="Medical Document"
              value={patientMedicalDocument ? 'View file' : 'No file'}
              onPress={patientMedicalDocument ? handleOpenMedicalDocument : undefined}
              roles={roles}
            />
          </View>
        </AppCard>

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.patientProfileCard}>
          <Text style={[styles.patientProfileCardTitle, { color: roles.headingText }]}>Account Settings</Text>
          <View style={styles.patientProfileRows}>
            <PatientProfileRow
              icon="profile"
              title="Personal Information"
              onPress={() => setMode('edit')}
              roles={roles}
            />
          </View>
        </AppCard>
      </View>

      <View style={styles.profileLogoutSection}>
        <AppButton
          title="Log Out"
          variant="outline"
          fullWidth={false}
          onPress={handleLogoutPress}
          leading={<AppIcon name="signOut" state="danger" />}
          style={styles.patientProfileLogoutButton}
          textColorOverride={theme.colors.textError}
          borderColorOverride={theme.colors.textError}
        />
        <Text style={[styles.profileVersionText, { color: roles.metaText }]}>{APP_VERSION_LABEL}</Text>
      </View>
    </View>
  );

  return (
    <>
      <DashboardLayout
        screenVariant={role === 'donor' ? 'default' : 'dashboard'}
        navItems={navItems}
        activeNavKey="profile"
        navVariant={role === 'donor' ? 'donor' : 'patient'}
        onNavPress={handleNavPress}
        header={role === 'donor' ? null : (
          <DashboardHeader
            title={resolvedTheme?.brandName || 'Donivra'}
            subtitle=""
            summary=""
            avatarInitials={avatarInitials}
            avatarUri={avatarUri}
            variant={role === 'donor' ? 'donor' : 'patient'}
            minimal={role === 'patient'}
            showAvatar={role === 'patient'}
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
        {role === 'donor' ? renderDonorProfileContent() : renderPatientProfileContent()}

        <Modal transparent visible={isPopupVisible} animationType="fade" onRequestClose={handleModalClose}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                {mode === 'details' ? (
                  <>
                    <View style={styles.modalHeaderBlock}>
                      <DashboardSectionHeader
                        title="Account Details"
                        description="Patient and hospital information."
                        style={styles.sectionHeaderCompact}
                      />
                    </View>

                    <ScrollView
                      style={[styles.modalBodyScroll, { maxHeight: modalMaxHeight - 150 }]}
                      contentContainerStyle={styles.modalBodyContent}
                      showsVerticalScrollIndicator={true}
                    >
                      <View style={styles.overviewGrid}>
                        {overviewRows.map((row, index) => (
                          <View
                            key={row.key}
                            style={[
                              styles.overviewTile,
                              row.key === 'email' || row.key === 'hospital_name' || index === 0 ? styles.overviewTileWide : null,
                            ]}
                          >
                            <Text style={styles.overviewTileLabel}>{row.label}</Text>
                            <Text numberOfLines={row.key === 'email' ? 1 : 2} style={styles.overviewTileValue}>{row.value}</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.formActions}>
                        <AppButton
                          title="Edit Profile"
                          size="lg"
                          onPress={() => setMode('edit')}
                          leading={<AppIcon name="editProfile" state="inverse" />}
                        />
                        <AppTextLink title="Close" variant="muted" onPress={handleModalClose} />
                      </View>
                    </ScrollView>
                  </>
                ) : null}

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
                      style={[styles.modalBodyScroll, { maxHeight: modalMaxHeight - 230 }]}
                      contentContainerStyle={styles.modalBodyContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="interactive"
                      nestedScrollEnabled={true}
                    >
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
                                  <View>
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
                                    {setupDonorAgeBadge ? (
                                      <View
                                        style={[
                                          styles.setupAgeBadge,
                                          setupDonorAgeBadge.tone === 'success'
                                            ? styles.setupAgeBadgeSuccess
                                            : styles.setupAgeBadgeWarning,
                                        ]}
                                      >
                                        <AppIcon
                                          name={setupDonorAgeBadge.tone === 'success' ? 'success' : 'shield'}
                                          size="sm"
                                          color={setupDonorAgeBadge.tone === 'success' ? '#1E7A42' : '#8A5A00'}
                                        />
                                        <View style={styles.setupAgeBadgeCopy}>
                                          <Text
                                            style={[
                                              styles.setupAgeBadgeTitle,
                                              setupDonorAgeBadge.tone === 'success'
                                                ? styles.setupAgeBadgeTextSuccess
                                                : styles.setupAgeBadgeTextWarning,
                                            ]}
                                          >
                                            {setupDonorAgeBadge.label}
                                          </Text>
                                          {setupDonorAgeBadge.category !== 'Adult' ? (
                                            <Text style={styles.setupAgeBadgeHint}>
                                              Complete guardian consent now so donation features are ready after account setup.
                                            </Text>
                                          ) : null}
                                        </View>
                                      </View>
                                    ) : null}
                                  </View>
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
                                  onChangeText={(nextValue) => {
                                    controllerField.onChange(
                                      field.formKey === 'phone' ? formatPhilippineMobileInput(nextValue) : nextValue
                                    );
                                  }}
                                  maxLength={field.formKey === 'phone' ? 11 : undefined}
                                  onBlur={controllerField.onBlur}
                                  error={fieldState.error?.message}
                                />
                              );
                            }}
                          />
                        );
                      })}

                      {isMinorProfileDraft ? (
                        <Pressable
                          onPress={async () => {
                            await Haptics.selectionAsync();
                            if (hasActiveGuardianConsent) return;
                            openGuardianConsentModal();
                          }}
                          style={({ pressed }) => [
                            styles.setupConsentPrompt,
                            hasActiveGuardianConsent ? styles.setupConsentPromptDone : null,
                            { opacity: pressed ? 0.84 : 1 },
                          ]}
                        >
                          <View style={styles.setupConsentPromptIcon}>
                            <AppIcon
                              name={hasActiveGuardianConsent ? 'success' : 'shield'}
                              size="sm"
                              color={hasActiveGuardianConsent ? '#1E7A42' : theme.colors.brandPrimary}
                            />
                          </View>
                          <View style={styles.setupConsentPromptCopy}>
                            <Text style={styles.setupConsentPromptTitle}>
                              {hasActiveGuardianConsent ? 'Guardian consent completed' : 'Guardian consent needed'}
                            </Text>
                            <Text style={styles.setupConsentPromptText}>
                              {hasActiveGuardianConsent
                                ? 'This account can continue to donation steps after the profile is saved.'
                                : 'Ask a parent or legal guardian to review and complete this before saving.'}
                            </Text>
                          </View>
                          {!hasActiveGuardianConsent ? (
                            <AppIcon name="chevronRight" size="sm" color={theme.colors.brandPrimary} />
                          ) : null}
                        </Pressable>
                      ) : null}

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
                      style={[styles.modalBodyScroll, { maxHeight: modalMaxHeight - 130 }]}
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

        <Modal
          transparent
          visible={isGuardianConsentModalOpen}
          animationType="fade"
          onRequestClose={closeGuardianConsentModal}
        >
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={closeGuardianConsentModal} />

              <AppCard
                variant="elevated"
                radius="xl"
                padding="lg"
                style={[styles.guardianConsentModalCard, { maxHeight: modalMaxHeight }]}
                contentStyle={styles.modalCardContent}
              >
                <View style={styles.guardianConsentHeader}>
                  <View style={styles.guardianConsentHeaderIcon}>
                    <AppIcon name="shield" color={theme.colors.brandPrimary} />
                  </View>
                  <View style={styles.guardianConsentHeaderCopy}>
                    <Text style={styles.guardianConsentTitle}>Guardian Consent</Text>
                    <Text style={styles.guardianConsentSubtitle}>
                      Required because the entered birthdate is below 18 years old.
                    </Text>
                  </View>
                  <Pressable
                    onPress={closeGuardianConsentModal}
                    style={({ pressed }) => [styles.guardianConsentCloseButton, { opacity: pressed ? 0.72 : 1 }]}
                  >
                    <AppIcon name="close" size="sm" color={theme.colors.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView
                  style={[styles.modalBodyScroll, { maxHeight: modalMaxHeight - 170 }]}
                  contentContainerStyle={styles.guardianConsentBody}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  nestedScrollEnabled={true}
                >
                  <AppInput
                    label="Guardian Full Name"
                    required
                    placeholder="Parent or legal guardian name"
                    variant="filled"
                    value={guardianConsentForm.guardianFullName}
                    onChangeText={(value) => updateGuardianConsentField('guardianFullName', value)}
                    error={guardianConsentErrors.guardianFullName}
                  />
                  <AppInput
                    label="Relationship"
                    required
                    placeholder="Mother, father, legal guardian"
                    variant="filled"
                    value={guardianConsentForm.guardianRelationship}
                    onChangeText={(value) => updateGuardianConsentField('guardianRelationship', value)}
                    error={guardianConsentErrors.guardianRelationship}
                  />
                  <AppInput
                    label="Guardian Contact Number"
                    required
                    placeholder="09XXXXXXXXX"
                    keyboardType="phone-pad"
                    variant="filled"
                    value={guardianConsentForm.guardianContactNumber}
                    onChangeText={(value) => updateGuardianConsentField('guardianContactNumber', formatPhilippineMobileInput(value))}
                    maxLength={11}
                    error={guardianConsentErrors.guardianContactNumber}
                  />
                  <AppInput
                    label="Guardian Email"
                    placeholder="Optional email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    variant="filled"
                    value={guardianConsentForm.guardianEmail}
                    onChangeText={(value) => updateGuardianConsentField('guardianEmail', value)}
                  />

                  <View style={styles.guardianConsentNotice}>
                    <Text style={styles.guardianConsentNoticeTitle}>
                      {guardianConsentDocument?.title || 'Guardian Consent Agreement'}
                    </Text>
                    <Text style={styles.guardianConsentNoticeText}>
                      {isLoadingGuardianConsentDocument
                        ? 'Loading guardian consent document...'
                        : guardianConsentDocumentError || guardianConsentText}
                    </Text>
                  </View>

                  <View style={styles.guardianAgreementBlock}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(guardianConsentForm.guardianAgreementAccepted), disabled: isSavingGuardianConsent }}
                      disabled={isSavingGuardianConsent}
                      onPress={() => updateGuardianConsentField('guardianAgreementAccepted', !guardianConsentForm.guardianAgreementAccepted)}
                      style={({ pressed }) => [
                        styles.guardianAgreementRow,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.guardianAgreementCheckbox,
                          guardianConsentForm.guardianAgreementAccepted ? styles.guardianAgreementCheckboxActive : null,
                        ]}
                      >
                        {guardianConsentForm.guardianAgreementAccepted ? (
                          <AppIcon name="checkmark" size="xs" state="inverse" />
                        ) : null}
                      </View>
                      <Text style={styles.guardianAgreementText}>
                        As a guardian, I agree to the{' '}
                        <Text style={styles.guardianAgreementLink}>Guardian Consent</Text>
                        {' '}terms and confirm that the information I provided is true.
                      </Text>
                    </Pressable>
                    {guardianConsentErrors.guardianAgreementAccepted ? (
                      <Text style={styles.guardianConsentError}>{guardianConsentErrors.guardianAgreementAccepted}</Text>
                    ) : null}
                  </View>

                  <View style={styles.formActions}>
                    <AppButton
                      title="Save Guardian Consent"
                      size="lg"
                      loading={isSavingGuardianConsent}
                      onPress={submitGuardianConsent}
                      leading={<AppIcon name="save" state="inverse" />}
                    />
                    <AppTextLink title="Cancel" variant="muted" onPress={closeGuardianConsentModal} />
                  </View>
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
  profileMainShell: {
    gap: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
  },
  profileTopAppBar: {
    minHeight: 58,
    borderRadius: 28,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  profileTopIconButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  profileBrandTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  profileHeroPanel: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  profileHeroDecorOne: {
    position: 'absolute',
    right: -36,
    top: -42,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(104, 26, 46, 0.08)',
  },
  profileHeroDecorTwo: {
    position: 'absolute',
    left: -34,
    bottom: -48,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(104, 26, 46, 0.12)',
  },
  profileHeroPhotoButton: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  profileHeroPhoto: {
    width: 96,
    height: 96,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 4,
    borderColor: theme.colors.surfaceCard,
  },
  profileHeroCameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
    borderWidth: 2,
    borderColor: theme.colors.surfaceCard,
  },
  profileHeroCopyCentered: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: '100%',
  },
  profileHeroDisplayName: {
    maxWidth: '94%',
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  profileRolePill: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    backgroundColor: theme.colors.brandPrimary,
  },
  profileRolePillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.textOnBrand,
  },
  profileHeroEmailText: {
    maxWidth: '100%',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  profileLocationRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  profileLocationText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  profileStatsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  profileStatTile: {
    flex: 1,
    minHeight: 96,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  profileStatValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  profileStatLabel: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  profileSection: {
    gap: theme.spacing.sm,
  },
  profileSectionEyebrow: {
    paddingHorizontal: theme.spacing.xs,
    marginBottom: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  profileMenuRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  profileMenuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  profileMenuIconDanger: {
    backgroundColor: '#FBE8EC',
  },
  profileMenuCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileMenuTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  profileMenuTitleDanger: {
    color: theme.colors.textError,
  },
  profileMenuDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.snug,
    color: theme.colors.textSecondary,
  },
  profileMenuBadge: {
    minWidth: 26,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  profileMenuBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textOnBrand,
  },
  profileMoreCard: {
    overflow: 'hidden',
    borderRadius: 18,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  profileMoreRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderSubtle,
  },
  profileMoreText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textSecondary,
  },
  profileLogoutSection: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  profileLogoutButton: {
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceCard,
  },
  profileVersionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.4,
    color: theme.colors.textMuted,
  },
  patientProfileShell: {
    gap: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  patientProfileHero: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  patientProfileAvatarButton: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  patientProfileAvatar: {
    width: 128,
    height: 128,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    ...theme.shadows.soft,
  },
  patientProfileAvatarText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    fontWeight: theme.typography.weights.bold,
  },
  patientProfileVerifiedBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  patientProfileName: {
    maxWidth: '92%',
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  patientProfileStatusPill: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    marginTop: theme.spacing.xs,
  },
  patientProfileStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  patientProfileCode: {
    maxWidth: '90%',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  patientProfileGrid: {
    gap: theme.spacing.lg,
  },
  patientProfileCard: {
    gap: theme.spacing.md,
  },
  patientProfileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  patientProfileCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    marginBottom: theme.spacing.md,
  },
  patientProfileRows: {
    gap: theme.spacing.sm,
  },
  patientProfileRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  patientProfileRowIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientProfileRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  patientProfileRowTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  patientProfileRowValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  patientProfileRowBadge: {
    minHeight: 28,
    maxWidth: 96,
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  patientProfileRowBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  patientProfileLogoutButton: {
    minWidth: 148,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceCard,
  },
  donorProfileShell: {
    overflow: 'hidden',
    borderRadius: 30,
  },
  donorProfileHeader: {
    minHeight: 242,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    borderRadius: 30,
    borderWidth: 1,
  },
  donorTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  donorHeaderEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  donorHeaderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  donorHeaderIconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  donorIdentityBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.lg,
  },
  donorAvatarButton: {
    marginBottom: theme.spacing.xs,
  },
  donorProfileAvatar: {
    width: 96,
    height: 96,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 4,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surfaceCard,
  },
  donorProfileName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  donorProfileMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: 'center',
  },
  donorAgeBadge: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    marginTop: theme.spacing.xs,
  },
  donorAgeBadgeSuccess: {
    backgroundColor: '#EAF8EF',
  },
  donorAgeBadgeWarning: {
    backgroundColor: '#FFF4D8',
  },
  donorAgeBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
  },
  donorAgeBadgeTextSuccess: {
    color: '#1E7A42',
  },
  donorAgeBadgeTextWarning: {
    color: '#8A5A00',
  },
  setupAgeBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderRadius: 18,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
  },
  setupAgeBadgeSuccess: {
    backgroundColor: '#EAF8EF',
    borderColor: '#BFE8CD',
  },
  setupAgeBadgeWarning: {
    backgroundColor: '#FFF4D8',
    borderColor: '#F2D38B',
  },
  setupAgeBadgeCopy: {
    flex: 1,
    gap: 2,
  },
  setupAgeBadgeTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  setupAgeBadgeHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: '#526078',
  },
  setupAgeBadgeTextSuccess: {
    color: '#1E7A42',
  },
  setupAgeBadgeTextWarning: {
    color: '#8A5A00',
  },
  setupConsentPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 62,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  setupConsentPromptDone: {
    backgroundColor: '#EAF8EF',
    borderColor: '#BFE8CD',
  },
  setupConsentPromptIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  setupConsentPromptCopy: {
    flex: 1,
    gap: 2,
  },
  setupConsentPromptTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  setupConsentPromptText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  donorActionPanel: {
    marginTop: -theme.spacing.xl,
    minHeight: 360,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
  },
  donorActionHeader: {
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  donorActionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  donorActionSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
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
    minHeight: 76,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 20,
    ...theme.shadows.soft,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
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
    minHeight: 0,
  },
  modalHeaderBlock: {
    flexShrink: 0,
  },
  modalBodyScroll: {
    minHeight: 0,
  },
  modalBodyContent: {
    paddingBottom: theme.spacing.giant,
  },
  guardianConsentModalCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
    minHeight: 0,
    overflow: 'hidden',
    flexShrink: 1,
  },
  guardianConsentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  guardianConsentHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  guardianConsentHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  guardianConsentTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  guardianConsentSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  guardianConsentCloseButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  guardianConsentBody: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  guardianConsentNotice: {
    marginBottom: theme.spacing.md,
    borderRadius: 18,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: theme.spacing.xs,
  },
  guardianConsentNoticeTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  guardianConsentNoticeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  guardianAgreementBlock: {
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  guardianAgreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guardianAgreementCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCard,
    marginTop: 1,
  },
  guardianAgreementCheckboxActive: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  guardianAgreementText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.normal,
    color: theme.colors.textPrimary,
  },
  guardianAgreementLink: {
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  guardianConsentError: {
    marginLeft: 28,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
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
});
