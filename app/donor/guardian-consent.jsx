import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { useAuth } from '../../src/providers/AuthProvider';
import { GUARDIAN_CONSENT_TEXT, saveGuardianConsent } from '../../src/features/donorCompliance.service';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

const initialForm = {
  guardianFullName: '',
  guardianRelationship: '',
  guardianContactNumber: '',
  guardianEmail: '',
  minorDonationConsent: false,
  aiImageProcessingConsent: false,
  publicPostingAllowed: false,
  signature: '',
};

const requiredMessage = 'This field is required.';

const CheckboxRow = ({ label, value, onPress, optional = false }) => (
  <Pressable
    accessibilityRole="checkbox"
    accessibilityState={{ checked: Boolean(value) }}
    onPress={onPress}
    style={({ pressed }) => [styles.checkboxRow, pressed ? styles.pressed : null]}
  >
    <View style={[styles.checkbox, value ? styles.checkboxActive : null]}>
      {value ? <AppIcon name="checkmark" size="xs" state="inverse" /> : null}
    </View>
    <Text style={styles.checkboxText}>{label}{optional ? ' (optional)' : ''}</Text>
  </Pressable>
);

export default function GuardianConsentScreen() {
  const router = useRouter();
  const { profile, refreshProfile, user, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [form, setForm] = React.useState(initialForm);
  const [errors, setErrors] = React.useState({});
  const [feedback, setFeedback] = React.useState(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setFeedback(null);
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.guardianFullName.trim()) nextErrors.guardianFullName = requiredMessage;
    if (!form.guardianRelationship.trim()) nextErrors.guardianRelationship = requiredMessage;
    if (!form.guardianContactNumber.trim()) nextErrors.guardianContactNumber = requiredMessage;
    if (!form.minorDonationConsent) nextErrors.minorDonationConsent = 'Guardian donation consent is required.';
    if (!form.aiImageProcessingConsent) nextErrors.aiImageProcessingConsent = 'AI image processing consent is required.';
    if (!form.signature.trim()) nextErrors.signature = 'Typed guardian name is required.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    const result = await saveGuardianConsent({
      userId: profile?.user_id,
      guardianFullName: form.guardianFullName,
      guardianRelationship: form.guardianRelationship,
      guardianContactNumber: form.guardianContactNumber,
      guardianEmail: form.guardianEmail,
      publicPostingAllowed: form.publicPostingAllowed,
    });
    setIsSaving(false);

    if (result.error) {
      setFeedback({ variant: 'error', message: result.error.message || 'Guardian consent save failed.' });
      return;
    }

    if (user?.id) {
      await refreshProfile(user.id);
    }

    setFeedback({ variant: 'success', message: 'Guardian consent has been saved.' });
    setTimeout(() => router.back(), 450);
  };

  const renderInput = ({ field, label, keyboardType = 'default', optional = false }) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}{optional ? ' (optional)' : ''}</Text>
      <TextInput
        value={form[field]}
        onChangeText={(value) => updateField(field, value)}
        keyboardType={keyboardType}
        autoCapitalize={field === 'guardianEmail' ? 'none' : 'words'}
        autoCorrect={field !== 'guardianEmail'}
        style={[styles.input, errors[field] ? styles.inputError : null]}
        placeholderTextColor="#8D7E82"
      />
      {errors[field] ? <Text style={styles.errorText}>{errors[field]}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: roles.screenBackground }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <AppIcon name="arrowLeft" size="md" state="default" />
            </Pressable>
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>Guardian Consent</Text>
              <Text style={styles.title}>Consent required</Text>
            </View>
          </View>

          <StatusBanner
            variant="warning"
            title="Parent or guardian consent is required"
            message="Since the donor is below 18 years old, parent or guardian consent is required before hair donation submission."
          />

          {feedback ? (
            <StatusBanner
              variant={feedback.variant}
              title={feedback.variant === 'success' ? 'Saved' : 'Unable to save'}
              message={feedback.message}
            />
          ) : null}

          <View style={styles.card}>
            {renderInput({ field: 'guardianFullName', label: 'Guardian Full Name' })}
            {renderInput({ field: 'guardianRelationship', label: 'Guardian Relationship' })}
            {renderInput({ field: 'guardianContactNumber', label: 'Guardian Contact Number', keyboardType: 'phone-pad' })}
            {renderInput({ field: 'guardianEmail', label: 'Guardian Email', keyboardType: 'email-address', optional: true })}

            <View style={styles.consentBox}>
              <Text style={styles.consentText}>{GUARDIAN_CONSENT_TEXT}</Text>
            </View>

            <CheckboxRow
              label="I allow this minor donor to participate in hair donation."
              value={form.minorDonationConsent}
              onPress={() => updateField('minorDonationConsent', !form.minorDonationConsent)}
            />
            {errors.minorDonationConsent ? <Text style={styles.errorText}>{errors.minorDonationConsent}</Text> : null}

            <CheckboxRow
              label="I allow AI-assisted image processing for initial hair screening."
              value={form.aiImageProcessingConsent}
              onPress={() => updateField('aiImageProcessingConsent', !form.aiImageProcessingConsent)}
            />
            {errors.aiImageProcessingConsent ? <Text style={styles.errorText}>{errors.aiImageProcessingConsent}</Text> : null}

            <CheckboxRow
              label="I allow public posting or donor recognition"
              value={form.publicPostingAllowed}
              optional
              onPress={() => updateField('publicPostingAllowed', !form.publicPostingAllowed)}
            />

            {renderInput({ field: 'signature', label: 'Typed Guardian Name as E-Signature' })}

            <AppButton
              title="Save Guardian Consent"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              backgroundColorOverride={roles.primaryActionBackground}
              textColorOverride={roles.primaryActionText}
              borderColorOverride={roles.primaryActionBackground}
              style={styles.saveButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D9DA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F4F2',
  },
  headerTextWrap: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#6B0606',
  },
  title: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 24,
    fontWeight: theme.typography.weights.bold,
    color: '#342D2F',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E4D9DA',
    backgroundColor: '#FFFFFF',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: '#342D2F',
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D9DA',
    paddingHorizontal: theme.spacing.md,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: '#342D2F',
    backgroundColor: '#FBF8F7',
  },
  inputError: {
    borderColor: theme.colors.textError,
  },
  consentBox: {
    borderRadius: 18,
    backgroundColor: '#F8F4F2',
    borderWidth: 1,
    borderColor: '#E4D9DA',
    padding: theme.spacing.md,
  },
  consentText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: '#526078',
  },
  checkboxRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D5C7C9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#6B0606',
    borderColor: '#6B0606',
  },
  checkboxText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: '#342D2F',
  },
  errorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 18,
    marginTop: theme.spacing.sm,
  },
});
