import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';
import { fetchActiveLegalDocument } from '../../features/donorCompliance.service';

const termsLabel = 'Terms and Conditions';

function PdfFrame({ source }) {
  if (!source || Platform.OS !== 'web') return null;
  return React.createElement('iframe', {
    src: source,
    title: 'Terms and Conditions PDF',
    style: {
      width: '100%',
      height: '100%',
      border: '0',
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
    },
  });
}

function LegalDetailsModal({ visible, onClose, roles, document, error, isLoading, onOpenPdf }) {
  const title = document?.title || termsLabel;
  const pdfUrl = document?.pdf_url || '';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleBlock}>
              <Text style={[styles.modalEyebrow, { color: roles.primaryActionBackground }]}>Before you sign up</Text>
              <Text style={[styles.modalTitle, { color: roles.headingText }]}>{title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close terms and privacy notice"
              onPress={onClose}
              style={({ pressed }) => [styles.modalCloseButton, pressed ? styles.pressed : null]}
            >
              <AppIcon name="closeCircle" size="md" state="muted" />
            </Pressable>
          </View>

          <View style={styles.pdfContainer}>
            {isLoading ? (
              <View style={styles.pdfState}>
                <ActivityIndicator color={roles.primaryActionBackground} />
                <Text style={[styles.pdfStateText, { color: roles.bodyText }]}>Loading document...</Text>
              </View>
            ) : error ? (
              <View style={styles.pdfState}>
                <AppIcon name="error" size="lg" color={theme.colors.textError} />
                <Text style={[styles.pdfStateTitle, { color: roles.headingText }]}>Document unavailable</Text>
                <Text style={[styles.pdfStateText, { color: roles.bodyText }]}>{error}</Text>
              </View>
            ) : pdfUrl ? (
              Platform.OS === 'web' ? (
                <PdfFrame source={pdfUrl} />
              ) : (
                <View style={styles.pdfState}>
                  <AppIcon name="shield" size="lg" color={roles.primaryActionBackground} />
                  <Text style={[styles.pdfStateTitle, { color: roles.headingText }]}>Terms PDF is ready</Text>
                  <Text style={[styles.pdfStateText, { color: roles.bodyText }]}>
                    Open the PDF to review the Terms and Conditions before signing up.
                  </Text>
                  <AppButton
                    title="Open PDF"
                    onPress={onOpenPdf}
                    backgroundColorOverride={roles.primaryActionBackground}
                    textColorOverride={roles.primaryActionText}
                    borderColorOverride={roles.primaryActionBackground}
                    style={styles.openPdfButton}
                  />
                </View>
              )
            ) : (
              <ScrollView contentContainerStyle={styles.modalScrollContent}>
                <Text style={[styles.modalBody, { color: roles.bodyText }]}>
                  {document?.content || document?.summary || 'Terms and Conditions are not available yet.'}
                </Text>
              </ScrollView>
            )}
          </View>

          <AppButton
            title="Done"
            onPress={onClose}
            backgroundColorOverride={roles.primaryActionBackground}
            textColorOverride={roles.primaryActionText}
            borderColorOverride={roles.primaryActionBackground}
            style={styles.modalDoneButton}
          />
        </View>
      </View>
    </Modal>
  );
}

export const SignupForm = ({
  schema,
  onSubmit,
  isLoading,
  activeAuthAction = '',
  buttonText = 'Sign up',
  submitError = '',
  onFieldEdit,
  onFieldFocus,
  autofillEmail = '',
  resolvedTheme,
}) => {
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: signupDefaultValues,
  });

  const passwordValue = watch('password');
  const roles = resolveThemeRoles(resolvedTheme);
  const isSubmitLoading = isLoading && activeAuthAction === 'signup';
  const [isLegalModalOpen, setIsLegalModalOpen] = React.useState(false);
  const [termsDocument, setTermsDocument] = React.useState(null);
  const [termsError, setTermsError] = React.useState('');
  const [isLoadingTerms, setIsLoadingTerms] = React.useState(false);

  React.useEffect(() => {
    if (!autofillEmail) return;
    setValue('email', autofillEmail, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    onFieldEdit?.();
  }, [autofillEmail, onFieldEdit, setValue]);

  const openTermsModal = React.useCallback(async () => {
    setIsLegalModalOpen(true);
    if (termsDocument || isLoadingTerms) return;

    setTermsError('');
    setIsLoadingTerms(true);
    const result = await fetchActiveLegalDocument('Terms and Conditions');
    setIsLoadingTerms(false);

    if (result.error) {
      setTermsError(result.error.message || 'Terms and Conditions could not be loaded.');
      return;
    }

    setTermsDocument(result.data);
  }, [isLoadingTerms, termsDocument]);

  const handleOpenPdf = React.useCallback(async () => {
    const pdfUrl = termsDocument?.pdf_url;
    if (!pdfUrl) return;
    await WebBrowser.openBrowserAsync(pdfUrl);
  }, [termsDocument?.pdf_url]);

  return (
    <View style={styles.container}>
      {submitError ? (
        <Text style={styles.submitErrorText}>
          {submitError}
        </Text>
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppInput
            label="Email Address"
            value={value}
            leftIcon="email"
            onBlur={onBlur}
            onFocus={() => onFieldFocus?.('email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            error={errors.email?.message}
            placeholder="jane@example.com"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
            style={styles.field}
            labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
            shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
            inputStyle={[styles.fieldInput, { color: roles.headingText }]}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordInput
            label="Password"
            value={value}
            leftIcon="lock"
            onBlur={onBlur}
            onFocus={() => onFieldFocus?.('password')}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.password?.message}
            helperText={passwordValue || errors.password
              ? 'Use uppercase, lowercase, a number, and a special character.'
              : undefined}
            placeholder="Password"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
            style={styles.field}
            labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
            shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
            inputStyle={[styles.fieldInput, { color: roles.headingText }]}
            helperTextStyle={[styles.helperText, { color: roles.bodyText }]}
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordInput
            label="Confirm Password"
            value={value}
            leftIcon="lock-check"
            onBlur={onBlur}
            onFocus={() => onFieldFocus?.('confirmPassword')}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.confirmPassword?.message}
            placeholder="Confirm Password"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
            style={styles.field}
            labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
            shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
            inputStyle={[styles.fieldInput, { color: roles.headingText }]}
          />
        )}
      />

      <Controller
        control={control}
        name="acceptedLegal"
        render={({ field: { onChange, value } }) => (
          <View style={styles.legalBlock}>
            <View
              style={[
                styles.legalRow,
                {
                  borderColor: errors.acceptedLegal?.message ? theme.colors.textError : roles.defaultCardBorder,
                  backgroundColor: roles.defaultCardBackground,
                },
              ]}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: Boolean(value), disabled: isLoading }}
                disabled={isLoading}
                onPress={() => {
                  onFieldEdit?.();
                  onChange(!value);
                }}
                style={({ pressed }) => [
                  styles.checkbox,
                  {
                    borderColor: value ? roles.primaryActionBackground : roles.defaultCardBorder,
                    backgroundColor: value ? roles.primaryActionBackground : roles.defaultCardBackground,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                {value ? <AppIcon name="checkmark" size="xs" state="inverse" /> : null}
              </Pressable>
              <View style={styles.legalCopy}>
                <Text style={[styles.legalText, { color: roles.bodyText }]}>
                  I agree to the Terms of Service and Privacy Policy. I understand how my donation data is handled.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={openTermsModal}
                  style={({ pressed }) => [styles.legalLinkHitArea, pressed ? styles.pressed : null]}
                >
                  <Text style={[styles.legalLinkText, { color: roles.primaryActionBackground }]}>
                    View Terms PDF
                  </Text>
                </Pressable>
              </View>
            </View>
            {errors.acceptedLegal?.message ? (
              <Text style={styles.legalErrorText}>{errors.acceptedLegal.message}</Text>
            ) : null}
          </View>
        )}
      />

      <LegalDetailsModal
        visible={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        roles={roles}
        document={termsDocument}
        error={termsError}
        isLoading={isLoadingTerms}
        onOpenPdf={handleOpenPdf}
      />

      <AppButton
        title={buttonText}
        onPress={handleSubmit((values) => {
          onFieldEdit?.();
          return onSubmit(values);
        })}
        loading={isSubmitLoading}
        disabled={isLoading}
        variant="outline"
        size="lg"
        style={styles.submitButton}
        textStyle={styles.submitButtonText}
        textColorOverride={roles.primaryActionText}
        backgroundColorOverride={roles.primaryActionBackground}
        borderColorOverride={roles.primaryActionBackground}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  fieldShell: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  fieldInput: {
    fontSize: theme.typography.semantic.body,
  },
  helperText: {
    fontSize: theme.typography.compact.caption,
  },
  legalBlock: {
    marginTop: 2,
    marginBottom: theme.spacing.sm,
  },
  legalRow: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalCopy: {
    flex: 1,
    gap: 2,
  },
  legalText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  legalLinkHitArea: {
    alignSelf: 'flex-start',
    minHeight: 24,
    justifyContent: 'center',
  },
  legalLinkText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  legalErrorText: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
  },
  submitErrorText: {
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textError,
  },
  submitButton: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.md,
  },
  submitButtonText: {
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18, 12, 14, 0.42)',
  },
  modalSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: '#D8CED0',
    marginBottom: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  modalTitleBlock: {
    flex: 1,
  },
  modalEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfContainer: {
    height: 380,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F8F4F2',
    borderWidth: 1,
    borderColor: '#E4D9DA',
  },
  pdfState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  pdfStateTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  pdfStateText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    textAlign: 'center',
  },
  modalScrollContent: {
    padding: theme.spacing.md,
  },
  modalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalNoticeBox: {
    borderRadius: 18,
    backgroundColor: '#F8F4F2',
    borderWidth: 1,
    borderColor: '#E4D9DA',
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
    gap: 4,
  },
  modalNoticeTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  modalNoticeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalDoneButton: {
    minHeight: 48,
    borderRadius: 18,
    marginTop: theme.spacing.md,
  },
  openPdfButton: {
    minHeight: 46,
    borderRadius: 16,
    marginTop: theme.spacing.sm,
    minWidth: 140,
  },
});
