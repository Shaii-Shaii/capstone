import React, { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
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

const SIGNUP_STEPS = [
  {
    key: 'personal',
    label: 'Personal Details',
    shortLabel: 'Personal',
    fields: ['firstName', 'lastName', 'email', 'phone'],
  },
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
  },
];

const renderStepCopy = (stepKey) => {
  if (stepKey === 'personal') {
    return {
      title: 'Basic details',
      body: 'Start with your personal contact details so we can set up your donor account properly.',
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
    body: 'Set a secure password before we send you to email verification.',
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

export const SignupForm = ({ schema, onSubmit, isLoading, buttonText = 'Sign Up' }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const { control, handleSubmit, setValue, watch, trigger, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: signupDefaultValues,
  });

  const activeStep = SIGNUP_STEPS[currentStep];
  const stepCopy = renderStepCopy(activeStep.key);
  const profilePhoto = watch('profilePhoto');
  const passwordValue = watch('password');
  const passwordStrengthMessage = getPasswordStrengthMessage(passwordValue);

  const handleNext = async () => {
    if (!activeStep.fields.length) {
      setCurrentStep((current) => Math.min(current + 1, SIGNUP_STEPS.length - 2));
      return;
    }

    const isValid = await trigger(activeStep.fields);
    if (!isValid) return;
    setCurrentStep((current) => Math.min(current + 1, SIGNUP_STEPS.length - 2));
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
    setCurrentStep((current) => Math.min(current + 1, SIGNUP_STEPS.length - 2));
  };

  const submitLabel = useMemo(() => buttonText || 'Create donor account', [buttonText]);

  return (
    <View style={styles.container}>
      <FormProgressStepper steps={SIGNUP_STEPS} currentStep={currentStep} style={styles.stepper} />

      <View style={styles.stepCard}>
        <StepTitle title={stepCopy.title} body={stepCopy.body} />

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

          {currentStep < SIGNUP_STEPS.length - 2 ? (
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
