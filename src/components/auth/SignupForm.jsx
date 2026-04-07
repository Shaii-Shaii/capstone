import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { FormProgressStepper } from '../ui/FormProgressStepper';
import { theme } from '../../design-system/theme';
import { SignupAddressSection } from './SignupAddressSection';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';
import { getPasswordStrengthMessage } from '../../utils/passwordRules';

const IMAGE_MEDIA_TYPES = ['images'];

const buildSignupSteps = (role) => {
  const steps = [
    {
      key: 'role',
      label: 'Account Type',
      shortLabel: 'Type',
      fields: ['role'],
    },
    {
      key: 'personal',
      label: 'Personal Details',
      shortLabel: 'Personal',
      fields: ['firstName', 'lastName', 'email', 'phone'],
    },
  ];

  if (role === 'patient') {
    steps.push({
      key: 'patient',
      label: 'Patient Details',
      shortLabel: 'Patient',
      fields: ['patientGender', 'medicalCondition', 'patientAge', 'hospitalId'],
    });
  }

  steps.push(
    {
      key: 'address',
      label: 'Address Details',
      shortLabel: 'Address',
      fields: ['street', 'barangay', 'city', 'province', 'region', 'country'],
    },
    {
      key: 'photo',
      label: 'Profile Photo',
      shortLabel: 'Photo',
      fields: [],
    },
    {
      key: 'password',
      label: 'Password',
      shortLabel: 'Password',
      fields: ['password', 'confirmPassword'],
    },
    {
      key: 'verify',
      label: 'OTP Verification',
      shortLabel: 'Verify',
      fields: [],
    }
  );

  return steps;
};

const renderStepCopy = (stepKey, role) => {
  if (stepKey === 'role') {
    return {
      title: 'Choose account type',
      body: 'Select whether you are signing up as a donor or a patient before continuing.',
    };
  }

  if (stepKey === 'personal') {
    return {
      title: 'Basic details',
      body: 'Start with your contact details so we can create your account record properly.',
    };
  }

  if (stepKey === 'patient') {
    return {
      title: 'Patient details',
      body: 'Add the patient information needed for the patient record. Hospital ID is optional if not yet assigned.',
    };
  }

  if (stepKey === 'address') {
    return {
      title: 'Address details',
      body: 'Search your address first, then adjust the returned fields only if needed.',
    };
  }

  if (stepKey === 'photo') {
    return {
      title: 'Optional profile photo',
      body: 'Add a profile photo now if you want. You can also skip this step and continue.',
    };
  }

  return {
    title: 'Create your password',
    body: role === 'patient'
      ? 'Set a secure password before we send you to email verification and finish the patient account setup.'
      : 'Set a secure password before we send you to email verification.',
  };
};

const StepTitle = ({ title, body }) => (
  <View style={styles.stepHeader}>
    <Text style={styles.stepTitle}>{title}</Text>
    <Text style={styles.stepBody}>{body}</Text>
  </View>
);

const PhotoStep = ({ value, onChange, isUploading }) => (
  <View style={styles.photoStep}>
    <View style={styles.photoPreviewShell}>
      {value ? (
        <Image source={{ uri: value }} style={styles.photoPreview} />
      ) : (
        <View style={styles.photoPlaceholder}>
          <View style={styles.photoPlaceholderIcon}>
            <AppIcon name="camera" state="active" />
          </View>
          <Text style={styles.photoPlaceholderTitle}>No photo selected</Text>
          <Text style={styles.photoPlaceholderBody}>
            This step is optional. You can upload a profile photo now or skip it.
          </Text>
        </View>
      )}
    </View>

    <View style={styles.photoActions}>
      <AppButton
        title={value ? 'Change Photo' : 'Upload Photo'}
        variant="secondary"
        loading={isUploading}
        leading={<AppIcon name="image" state="muted" />}
        onPress={onChange}
      />
    </View>
  </View>
);

const RoleOptionCard = ({ roleKey, title, description, icon, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={[styles.roleOptionCard, selected ? styles.roleOptionCardActive : null]}
  >
    <View style={[styles.roleOptionIconWrap, selected ? styles.roleOptionIconWrapActive : null]}>
      <AppIcon name={icon} size="sm" state={selected ? 'inverse' : 'active'} />
    </View>
    <View style={styles.roleOptionCopy}>
      <Text style={styles.roleOptionTitle}>{title}</Text>
      <Text style={styles.roleOptionDescription}>{description}</Text>
    </View>
    {selected ? <AppIcon name="success" size="sm" state="success" /> : null}
  </Pressable>
);

export const SignupForm = ({ schema, onSubmit, isLoading, buttonText = 'Create Account' }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const { control, handleSubmit, setValue, watch, trigger, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: signupDefaultValues,
  });

  const selectedRole = watch('role');
  const signupSteps = useMemo(() => buildSignupSteps(selectedRole), [selectedRole]);
  const activeStep = signupSteps[currentStep];
  const stepCopy = renderStepCopy(activeStep.key, selectedRole);
  const profilePhoto = watch('profilePhoto');
  const passwordValue = watch('password');
  const passwordStrengthMessage = getPasswordStrengthMessage(passwordValue);

  useEffect(() => {
    if (currentStep > signupSteps.length - 2) {
      setCurrentStep(Math.max(0, signupSteps.length - 2));
    }
  }, [currentStep, signupSteps.length]);

  const handleNext = async () => {
    if (!activeStep.fields.length) {
      setCurrentStep((current) => Math.min(current + 1, signupSteps.length - 2));
      return;
    }

    const isValid = await trigger(activeStep.fields);
    if (!isValid) return;
    setCurrentStep((current) => Math.min(current + 1, signupSteps.length - 2));
  };

  const handleBack = () => {
    setCurrentStep((current) => Math.max(current - 1, 0));
  };

  const handlePickProfilePhoto = async () => {
    try {
      setIsUploadingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo Access Needed', 'Allow photo library access first so you can add an optional profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Photo Unavailable', 'The selected image could not be read. Please choose another photo.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const profilePhotoValue = `data:${mimeType};base64,${asset.base64}`;
      setValue('profilePhoto', profilePhotoValue, { shouldDirty: true });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSkipPhoto = () => {
    setValue('profilePhoto', '', { shouldDirty: true });
    setCurrentStep((current) => Math.min(current + 1, signupSteps.length - 2));
  };

  const submitLabel = useMemo(() => buttonText || 'Create Account', [buttonText]);

  return (
    <View style={styles.container}>
      <FormProgressStepper steps={signupSteps} currentStep={currentStep} style={styles.stepper} />

      <View style={styles.stepCard}>
        <StepTitle title={stepCopy.title} body={stepCopy.body} />

        {activeStep.key === 'role' ? (
          <Controller
            control={control}
            name="role"
            render={({ field: { value } }) => (
              <View style={styles.roleOptionList}>
                <RoleOptionCard
                  roleKey="donor"
                  title="Donor Account"
                  description="For users who want to donate hair and manage donation-related steps."
                  icon="heart"
                  selected={value === 'donor'}
                  onPress={() => setValue('role', 'donor', { shouldDirty: true, shouldValidate: true })}
                />
                <RoleOptionCard
                  roleKey="patient"
                  title="Patient Account"
                  description="For users who need support, patient tracking, and wig request access."
                  icon="support"
                  selected={value === 'patient'}
                  onPress={() => setValue('role', 'patient', { shouldDirty: true, shouldValidate: true })}
                />
                {errors.role?.message ? <Text style={styles.inlineErrorText}>{errors.role.message}</Text> : null}
              </View>
            )}
          />
        ) : null}

        {activeStep.key === 'personal' ? (
          <>
            <View style={styles.row}>
              <Controller
                control={control}
                name="firstName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="First Name"
                    placeholder="Juan"
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.firstName?.message}
                    style={styles.rowField}
                  />
                )}
              />
              <Controller
                control={control}
                name="lastName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Last Name"
                    placeholder="Dela Cruz"
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.lastName?.message}
                    style={styles.rowField}
                  />
                )}
              />
            </View>

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <AppInput
                  label="Email Address"
                  placeholder="juan@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  variant="filled"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <AppInput
                  label="Mobile Number"
                  placeholder="09123456789"
                  keyboardType="phone-pad"
                  variant="filled"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.phone?.message}
                />
              )}
            />
          </>
        ) : null}

        {activeStep.key === 'patient' ? (
          <>
            <Controller
              control={control}
              name="patientGender"
              render={({ field: { onChange, onBlur, value } }) => (
                <AppInput
                  label="Gender"
                  placeholder="Female"
                  variant="filled"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.patientGender?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="medicalCondition"
              render={({ field: { onChange, onBlur, value } }) => (
                <AppInput
                  label="Medical Condition"
                  placeholder="Alopecia"
                  variant="filled"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.medicalCondition?.message}
                />
              )}
            />

            <View style={styles.row}>
              <Controller
                control={control}
                name="patientAge"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Age"
                    placeholder="18"
                    keyboardType="number-pad"
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.patientAge?.message}
                    helperText="Optional"
                    style={styles.rowField}
                  />
                )}
              />
              <Controller
                control={control}
                name="hospitalId"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Hospital ID"
                    placeholder="12"
                    keyboardType="number-pad"
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.hospitalId?.message}
                    helperText="Optional"
                    style={styles.rowField}
                  />
                )}
              />
            </View>
          </>
        ) : null}

        {activeStep.key === 'address' ? (
          <SignupAddressSection
            control={control}
            errors={errors}
            setValue={setValue}
            showHeader={false}
          />
        ) : null}

        {activeStep.key === 'photo' ? (
          <Controller
            control={control}
            name="profilePhoto"
            render={() => (
              <PhotoStep
                value={profilePhoto}
                onChange={handlePickProfilePhoto}
                isUploading={isUploadingPhoto}
              />
            )}
          />
        ) : null}

        {activeStep.key === 'password' ? (
          <>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <PasswordInput
                  label="Password"
                  placeholder="Create a strong password"
                  variant="filled"
                  helperText={passwordStrengthMessage || 'Use uppercase, lowercase, numbers, and a symbol.'}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.password?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <PasswordInput
                  label="Confirm Password"
                  placeholder="Retype password"
                  variant="filled"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.confirmPassword?.message}
                />
              )}
            />
          </>
        ) : null}

        <View style={styles.footerRow}>
          <View style={styles.footerSecondary}>
            {currentStep > 0 ? (
              <AppButton
                title="Back"
                variant="ghost"
                fullWidth={false}
                onPress={handleBack}
              />
            ) : null}

            {activeStep.key === 'photo' ? (
              <AppButton
                title="Skip"
                variant="ghost"
                fullWidth={false}
                onPress={handleSkipPhoto}
              />
            ) : null}
          </View>

          {currentStep < signupSteps.length - 2 ? (
            <AppButton
              title="Next"
              fullWidth={false}
              trailing={<AppIcon name="chevronRight" state="inverse" />}
              onPress={handleNext}
            />
          ) : (
            <AppButton
              title={submitLabel}
              onPress={handleSubmit(onSubmit)}
              loading={isLoading}
              size="lg"
              enableHaptics={true}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: theme.spacing.md,
  },
  stepper: {
    marginBottom: theme.spacing.xs,
  },
  stepCard: {
    gap: theme.spacing.sm,
  },
  stepHeader: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  stepTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
  },
  stepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  roleOptionList: {
    gap: theme.spacing.sm,
  },
  roleOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  roleOptionCardActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  roleOptionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  roleOptionIconWrapActive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  roleOptionCopy: {
    flex: 1,
    gap: 2,
  },
  roleOptionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  roleOptionDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  inlineErrorText: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowField: {
    flex: 1,
  },
  photoStep: {
    gap: theme.spacing.md,
  },
  photoPreviewShell: {
    minHeight: 220,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: 220,
  },
  photoPlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  photoPlaceholderIcon: {
    width: 58,
    height: 58,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  photoPlaceholderTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  photoPlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  photoActions: {
    gap: theme.spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  footerSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
