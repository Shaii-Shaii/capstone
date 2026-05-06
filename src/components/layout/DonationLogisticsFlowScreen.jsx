import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { DonorTopBar } from '../donor/DonorTopBar';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { DashboardLayout } from './DashboardLayout';

import { donorDashboardNavItems } from '../../constants/dashboard';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { useDonationFlow } from '../../hooks/useDonationFlow';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../providers/AuthProvider';

import {
    generateDonationQrPdf,
    shareDonationQrPdf,
    submitDonation,
} from '../../features/donationLogistics.service';
import {
    fetchHairSubmissionsByUserId,
    fetchLatestDonationRequirement,
} from '../../features/hairSubmission.api';

const HAIR_LENGTH_UNIT_OPTIONS = [
  { label: 'Inches', value: 'in' },
  { label: 'Centimeters', value: 'cm' },
];

/**
 * DonationLogisticsFlowScreen
 *
 * Implements the complete donation logistics flow:
 * Step 1: Profile Completion Check
 * Step 2: Hair Eligibility Assessment (within 30 days)
 * Step 3: Hair Details & Photo Collection
 * Step 4: QR Code Generation
 * Step 5: Shipment & Tracking
 * Step 6: Certificate Generation
 */
export const DonationLogisticsFlowScreen = ({ navigationState = null }) => {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { showNotification } = useNotifications();
  const { navigateToProfile } = useAuthActions();

  // Local state
  const [hairSubmissions, setHairSubmissions] = useState([]);
  const [donationRequirement, setDonationRequirement] = useState(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [hairPhotoPath, setHairPhotoPath] = useState(null);
  const [hairPhotoFileName, setHairPhotoFileName] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    hairLength: '',
    hairLengthUnit: 'in',
    bundleQuantity: '1',
    hairColor: '',
    sourceType: 'independent_donation',
  });

  // Flow hook
  const flow = useDonationFlow({
    userProfile,
    hairSubmissions,
    onFlowComplete: (stage, data) => {
      logAppEvent('donation_flow', `Flow stage: ${stage}`);
      if (stage === 'certificate_generated') {
        showNotification({
          type: 'success',
          title: 'Donation Complete!',
          message: 'Your donation certificate has been generated.',
        });
      }
    },
    onFlowError: (error) => {
      showNotification({
        type: 'error',
        title: 'Flow Error',
        message: error,
      });
    },
  });

  const roles = resolveThemeRoles(userProfile?.role);

  /**
   * Load initial data
   */
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoadingInitial(true);

        if (user?.id) {
          // Fetch user's hair submissions
          const submissions = await fetchHairSubmissionsByUserId(user.id);
          setHairSubmissions(submissions || []);
        }

        // Fetch current donation requirements
        const requirements = await fetchLatestDonationRequirement();
        setDonationRequirement(requirements);
      } catch (err) {
        logAppError('DonationLogisticsFlow', err);
        showNotification({
          type: 'error',
          title: 'Loading Error',
          message: 'Failed to load donation requirements',
        });
      } finally {
        setIsLoadingInitial(false);
      }
    };

    loadInitialData();
  }, [user?.id, showNotification]);

  /**
   * Handle profile navigation
   */
  const handleGoToProfile = useCallback(() => {
    navigateToProfile?.();
  }, [navigateToProfile]);

  /**
   * Handle hair eligibility check navigation
   */
  const handleCheckHairEligibility = useCallback(() => {
    flow.startHairEligibilityCheck();
    router.push('/donor/hair-history');
  }, [flow, router]);

  /**
   * Handle prefill from recent assessment
   */
  const handlePrefillHairDetails = useCallback(() => {
    if (flow.prefillFromRecentAssessment()) {
      // Also set the hair details in form
      if (flow.recentHairDetails?.estimatedLengthInches) {
        setFormData((prev) => ({
          ...prev,
          hairLength: String(flow.recentHairDetails.estimatedLengthInches),
          hairColor: flow.recentHairDetails.detectedColor || '',
        }));
      }
      showNotification({
        type: 'success',
        message: 'Hair details pre-filled from recent assessment',
      });
    }
  }, [flow, showNotification]);

  /**
   * Handle hair photo selection
   */
  const handleSelectHairPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setHairPhotoPath(asset.uri);
        setHairPhotoFileName(asset.fileName || `hair_${Date.now()}.jpg`);
        flow.setHairPhoto(asset.uri, asset.fileName);

        showNotification({
          type: 'success',
          message: 'Hair photo selected',
        });
      }
    } catch (err) {
      logAppError('DonationLogisticsFlow', err);
      showNotification({
        type: 'error',
        message: 'Failed to select photo',
      });
    }
  }, [flow, showNotification]);

  /**
   * Validate and advance to next step
   */
  const handleAdvanceStep = useCallback(async () => {
    const success = await flow.advanceToNextStep();
    if (!success) {
      if (flow.error) {
        showNotification({
          type: 'error',
          message: flow.error,
        });
      }
    }
  }, [flow, showNotification]);

  /**
   * Handle donation details submission
   */
  const handleSubmitDonationDetails = useCallback(async () => {
    try {
      // Validate form
      if (!formData.hairLength) {
        flow.setError('Hair length is required');
        return;
      }

      if (!hairPhotoPath) {
        flow.setError('Hair photo is required');
        return;
      }

      // Update flow with donation details
      const success = flow.updateDonationDetails({
        hairLength: formData.hairLength,
        hairLengthUnit: formData.hairLengthUnit,
        bundleQuantity: formData.bundleQuantity,
        uploadedPhotoPath: hairPhotoPath,
        photoFileName: hairPhotoFileName,
        sourceType: formData.sourceType,
        fromRecentAssessment: Boolean(flow.recentHairDetails),
        recentAssessmentData: flow.recentHairDetails,
      });

      if (success) {
        // Validate against requirements
        const validation = flow.validateCurrentDonationDetails(donationRequirement);
        if (!validation.isValid) {
          flow.setError(validation.errors.join(' '));
          return;
        }

        // Submit donation to backend (creates Hair_Submissions / logistics / upload image)
        try {
          const submissionResult = await submitDonation({
            userId: user?.id,
            userProfile,
            donationDetails: flow.donationDetails || {},
            hairPhotoPath,
            hairPhotoFileName,
            sourceType: formData.sourceType,
          });

          if (submissionResult?.success) {
            // Store QR info in flow state
            flow.setGeneratedQrCode({
              submissionCode: submissionResult.submissionCode,
              qrCodeUrl: submissionResult.qrCodeUrl,
            });

            // Optionally generate and open PDF for sharing
            try {
              const pdf = await generateDonationQrPdf({
                submissionCode: submissionResult.submissionCode,
                qrCodeUrl: submissionResult.qrCodeUrl,
                donorName: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim(),
                hairLength: flow.donationDetails?.hairLengthValue || formData.hairLength,
                bundleQuantity: flow.donationDetails?.bundleQuantity || formData.bundleQuantity,
              });

              // Auto-share PDF if possible
              await shareDonationQrPdf(pdf.uri || pdf.uri || pdf.filePath || pdf.path || pdf.fileName || pdf);
            } catch (pdfErr) {
              // ignore PDF errors but log
              logAppError('DonationLogisticsFlow', pdfErr);
            }

            // Advance to next step (QR generation)
            await handleAdvanceStep();
          } else {
            flow.setError('Failed to submit donation.');
            return;
          }
        } catch (submitErr) {
          logAppError('DonationLogisticsFlow', submitErr);
          flow.setError(submitErr.message || 'Submission failed');
          return;
        }
      }
    } catch (err) {
      logAppError('DonationLogisticsFlow', err);
      flow.setError('Failed to submit donation details');
    }
  }, [formData, hairPhotoPath, hairPhotoFileName, flow, donationRequirement, handleAdvanceStep]);

  // Loading state
  if (isLoadingInitial) {
    return (
      <DashboardLayout topBar={<DonorTopBar />} navItems={donorDashboardNavItems} activeItemKey="donations">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.brandPrimary} />
          <Text style={styles.loadingText}>Loading donation information...</Text>
        </View>
      </DashboardLayout>
    );
  }

  const stepPrompt = flow.getCurrentStepPrompt();

  return (
    <DashboardLayout
      topBar={<DonorTopBar />}
      navItems={donorDashboardNavItems}
      activeItemKey="donations"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* STEP 1: Profile Completion */}
        {flow.currentStep === 1 && (
          <Step1_ProfileCompletion
            roles={roles}
            profileStatus={flow.profileStatus}
            onManageProfile={handleGoToProfile}
          />
        )}

        {/* STEP 2: Hair Eligibility */}
        {flow.currentStep === 2 && (
          <Step2_HairEligibility
            roles={roles}
            isCheckingHair={flow.isCheckingHair}
            recentHairEligibility={flow.recentHairEligibility}
            stepPrompt={stepPrompt}
            onCheckHair={handleCheckHairEligibility}
            onCompleteCheck={() => flow.completeHairEligibilityCheck()}
          />
        )}

        {/* STEP 3: Donation Details */}
        {flow.currentStep === 3 && (
          <Step3_DonationDetails
            roles={roles}
            formData={formData}
            setFormData={setFormData}
            hairPhotoPath={hairPhotoPath}
            recentHairDetails={flow.recentHairDetails}
            stepPrompt={stepPrompt}
            onSelectPhoto={handleSelectHairPhoto}
            onPrefillHair={handlePrefillHairDetails}
            onSubmit={handleSubmitDonationDetails}
            hairLengthUnitOptions={HAIR_LENGTH_UNIT_OPTIONS}
          />
        )}

        {/* STEP 4: QR & Tracking */}
        {flow.currentStep >= 4 && (
          <Step4_QRAndTracking
              roles={roles}
              donationDetails={flow.donationDetails}
              qrCode={flow.qrCode}
              hairPhotoPath={hairPhotoPath}
              onProceed={async () => {
                // Currently proceed will just open/share the QR PDF if available
                const qr = flow.qrCode;
                if (qr?.qrCodeUrl && qr?.submissionCode) {
                  try {
                    const pdf = await generateDonationQrPdf({
                      submissionCode: qr.submissionCode,
                      qrCodeUrl: qr.qrCodeUrl,
                      donorName: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim(),
                      hairLength: flow.donationDetails?.hairLengthValue || formData.hairLength,
                      bundleQuantity: flow.donationDetails?.bundleQuantity || formData.bundleQuantity,
                    });

                    await shareDonationQrPdf(pdf.uri || pdf.filePath || pdf.path || pdf);
                  } catch (err) {
                    logAppError('DonationLogisticsFlow', err);
                    showNotification({ type: 'error', message: 'Failed to generate QR PDF' });
                  }
                } else {
                  showNotification({ type: 'info', message: 'No QR available yet' });
                }
              }}
            />
        )}

        {/* Error Banner */}
        {flow.error && (
          <StatusBanner
            variant="error"
            message={flow.error}
            style={styles.errorBanner}
          />
        )}
      </ScrollView>
    </DashboardLayout>
  );
};

/**
 * STEP 1: Profile Completion
 */
function Step1_ProfileCompletion({ roles, profileStatus, onManageProfile }) {
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.stepCard, { backgroundColor: roles.supportCardBackground }]}>
        <View style={styles.stepHeader}>
          <AppIcon name="checkmark-circle" size="lg" state="info" />
          <View style={styles.stepHeaderText}>
            <Text style={[styles.stepTitle, { color: roles.headingText }]}>
              Finish Setting Up Your Account
            </Text>
            <Text style={[styles.stepBody, { color: roles.bodyText }]}>
              Complete your profile before requesting a donation
            </Text>
          </View>
        </View>

        <View style={styles.completionProgressWrap}>
          <View style={styles.progressBarWrap}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${profileStatus.percentage}%`,
                  backgroundColor: roles.primaryActionBackground,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: roles.metaText }]}>
            {profileStatus.completedFields} of {profileStatus.totalFields} fields completed
          </Text>
        </View>

        {profileStatus.missingFieldLabels.length > 0 && (
          <View style={styles.missingFieldsList}>
            {profileStatus.missingFieldLabels.slice(0, 3).map((field, idx) => (
              <Text key={`${field}-${idx}`} style={[styles.missingField, { color: roles.bodyText }]}>
                • {field}
              </Text>
            ))}
          </View>
        )}

        <AppButton
          title="Complete Profile"
          variant="primary"
          fullWidth
          onPress={onManageProfile}
          style={styles.stepAction}
        />
      </View>
    </View>
  );
}

/**
 * STEP 2: Hair Eligibility Assessment
 */
function Step2_HairEligibility({
  roles,
  isCheckingHair,
  recentHairEligibility,
  stepPrompt,
  onCheckHair,
  onCompleteCheck,
}) {
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.stepCard, { backgroundColor: roles.supportCardBackground }]}>
        <View style={styles.stepHeader}>
          <AppIcon
            name={isCheckingHair ? 'time' : 'checkmark-circle'}
            size="lg"
            state={isCheckingHair ? 'info' : 'active'}
          />
          <View style={styles.stepHeaderText}>
            <Text style={[styles.stepTitle, { color: roles.headingText }]}>
              {stepPrompt?.title || 'Hair Eligibility Assessment'}
            </Text>
            <Text style={[styles.stepBody, { color: roles.bodyText }]}>
              {stepPrompt?.message || 'Your hair needs to be assessed for donation eligibility'}
            </Text>
          </View>
        </View>

        {recentHairEligibility && (
          <View style={[styles.eligibilityResult, { backgroundColor: roles.defaultCardBackground }]}>
            <View style={styles.resultBadge}>
              <AppIcon name="checkmark" size="sm" color={roles.successText} />
              <Text style={[styles.resultLabel, { color: roles.successText }]}>
                {recentHairEligibility.decision}
              </Text>
            </View>
            <Text style={[styles.resultDate, { color: roles.metaText }]}>
              Assessed on {new Date(recentHairEligibility.createdAt).toLocaleDateString()}
            </Text>
          </View>
        )}

        <AppButton
          title={stepPrompt?.primaryButtonText || 'Check Hair Eligibility'}
          variant="primary"
          fullWidth
          onPress={onCheckHair}
          loading={isCheckingHair}
          style={styles.stepAction}
        />

        {recentHairEligibility && (
          <AppButton
            title="Continue to Donation"
            variant="outline"
            fullWidth
            onPress={onCompleteCheck}
            style={styles.stepAction}
          />
        )}
      </View>
    </View>
  );
}

/**
 * STEP 3: Donation Details Collection
 */
function Step3_DonationDetails({
  roles,
  formData,
  setFormData,
  hairPhotoPath,
  recentHairDetails,
  stepPrompt,
  onSelectPhoto,
  onPrefillHair,
  onSubmit,
  hairLengthUnitOptions,
}) {
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.stepCard, { backgroundColor: roles.supportCardBackground }]}>
        <Text style={[styles.stepTitle, { color: roles.headingText }]}>
          Donation Details
        </Text>
        <Text style={[styles.stepBody, { color: roles.bodyText, marginBottom: 16 }]}>
          Provide your hair specifications and upload a photo
        </Text>

        {/* Hair Length Input */}
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: roles.headingText }]}>Hair Length</Text>
          <View style={styles.lengthInputGroup}>
            <AppInput
              placeholder="Enter length"
              value={formData.hairLength}
              onChangeText={(value) => setFormData({ ...formData, hairLength: value })}
              keyboardType="decimal-pad"
              style={styles.hairLengthInput}
            />
            <View style={styles.unitSelector}>
              {hairLengthUnitOptions.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setFormData({ ...formData, hairLengthUnit: option.value })}
                  style={[
                    styles.unitButton,
                    formData.hairLengthUnit === option.value
                      ? { backgroundColor: roles.primaryActionBackground }
                      : { backgroundColor: roles.defaultCardBackground },
                  ]}
                >
                  <Text
                    style={[
                      styles.unitButtonText,
                      {
                        color:
                          formData.hairLengthUnit === option.value
                            ? roles.primaryActionText
                            : roles.bodyText,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Bundle Quantity */}
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: roles.headingText }]}>Number of Bundles</Text>
          <AppInput
            placeholder="1"
            value={formData.bundleQuantity}
            onChangeText={(value) => setFormData({ ...formData, bundleQuantity: value })}
            keyboardType="number-pad"
          />
        </View>

        {/* Hair Photo Upload */}
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: roles.headingText }]}>Donation Photo</Text>
          {hairPhotoPath ? (
            <View style={styles.photoPreviewWrap}>
              <Image source={{ uri: hairPhotoPath }} style={styles.photoPreview} resizeMode="cover" />
              <Pressable onPress={onSelectPhoto} style={styles.changePhotoButton}>
                <AppIcon name="edit" size="sm" state="active" />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={onSelectPhoto} style={[styles.photoUploadArea, { borderColor: roles.defaultCardBorder }]}>
              <AppIcon name="camera" size="lg" state="muted" />
              <Text style={[styles.photoUploadText, { color: roles.bodyText }]}>
                Tap to upload donation photo
              </Text>
            </Pressable>
          )}
        </View>

        {/* Prefill Option */}
        {recentHairDetails && (
          <AppButton
            title={stepPrompt?.prefillButtonText || 'Use Hair from Recent Assessment'}
            variant="outline"
            fullWidth
            onPress={onPrefillHair}
            style={styles.stepAction}
          />
        )}

        {/* Submit Button */}
        <AppButton
          title="Generate Donation QR"
          variant="primary"
          fullWidth
          onPress={onSubmit}
          style={styles.stepAction}
        />
      </View>
    </View>
  );
}

/**
 * STEP 4: QR Code & Donation Tracking
 */
function Step4_QRAndTracking({
  roles,
  donationDetails,
  qrCode,
  hairPhotoPath,
  onProceed,
}) {
  return (
    <View style={styles.stepContainer}>
      <View style={[styles.stepCard, { backgroundColor: roles.supportCardBackground }]}>
        <Text style={[styles.stepTitle, { color: roles.headingText }]}>
          Donation Summary
        </Text>

        {donationDetails && (
          <View style={[styles.summaryWrap, { backgroundColor: roles.defaultCardBackground }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: roles.metaText }]}>Hair Length</Text>
              <Text style={[styles.summaryValue, { color: roles.headingText }]}>
                {donationDetails.hairLengthValue} {donationDetails.hairLengthUnit}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: roles.metaText }]}>Bundles</Text>
              <Text style={[styles.summaryValue, { color: roles.headingText }]}>
                {donationDetails.bundleQuantity}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: roles.metaText }]}>From Assessment</Text>
              <Text style={[styles.summaryValue, { color: roles.headingText }]}>
                {donationDetails.fromRecentAssessment ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        )}

        <AppButton
          title="Proceed to Shipment"
          variant="primary"
          fullWidth
          onPress={onProceed}
          style={styles.stepAction}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: theme.colors.bodyText,
  },
  stepContainer: {
    marginBottom: 24,
  },
  stepCard: {
    borderRadius: theme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.defaultCardBorder,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  stepBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  completionProgressWrap: {
    marginBottom: 16,
  },
  progressBarWrap: {
    height: 8,
    backgroundColor: theme.colors.defaultCardBorder,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
  },
  missingFieldsList: {
    marginBottom: 16,
  },
  missingField: {
    fontSize: 13,
    lineHeight: 20,
  },
  eligibilityResult: {
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 16,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  resultDate: {
    fontSize: 12,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  lengthInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hairLengthInput: {
    flex: 1,
  },
  unitSelector: {
    flexDirection: 'row',
    gap: 4,
  },
  unitButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
  },
  unitButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  photoUploadArea: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
  },
  photoUploadText: {
    marginTop: 12,
    fontSize: 14,
  },
  photoPreviewWrap: {
    position: 'relative',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    height: 200,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  changePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryActionBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryWrap: {
    borderRadius: theme.radius.md,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryRow__last: {
    marginBottom: 0,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepAction: {
    marginTop: 12,
  },
  errorBanner: {
    marginBottom: 16,
  },
});

export default DonationLogisticsFlowScreen;
