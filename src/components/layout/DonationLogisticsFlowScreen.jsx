import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DonorTopBar } from '../donor/DonorTopBar';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { DashboardLayout } from './DashboardLayout';

import { donorDashboardNavItems } from '../../constants/dashboard';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../providers/AuthProvider';

import {
  getProfileCompletionStatus,
  isProfileComplete,
} from '../../features/donationLogisticsFlow.service';
import {
  buildDonationTrackingQrPayload,
  buildQrImageUrl,
  generateDonationQrPdf,
  generateIndependentDonationQrFast,
  getDonorDonationsModuleData,
  saveManualDonationQualification,
  shareDonationQrPdf
} from '../../features/donorDonations.service';
import { logAppError } from '../../utils/appErrors';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PHASE = {
    LOADING: 'loading',
    PROFILE_INCOMPLETE: 'profile_incomplete',
    NEED_HAIR_CHECK: 'need_hair_check',
    ELIGIBILITY_RESULT: 'eligibility_result',
    DONATION_FORM: 'donation_form',
    ACTIVE_DONATION: 'active_donation',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
    try {
        return new Intl.DateTimeFormat('en-PH', {
            month: 'long', day: 'numeric', year: 'numeric',
        }).format(new Date(d));
    } catch {
        return d || '';
    }
};

const cmToIn = (cm) => {
    const v = Number(cm);
    return Number.isFinite(v) && v > 0 ? (v / 2.54).toFixed(1) : '';
};

const capitalize = (s = '') =>
    String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const resolvePhase = (data, profile) => {
    if (!isProfileComplete(profile)) return PHASE.PROFILE_INCOMPLETE;
    if (!data?.isAiEligible && !data?.isManualQualified) return PHASE.NEED_HAIR_CHECK;
    if (data?.hasOngoingDonation) return PHASE.ACTIVE_DONATION;
    if (data?.isAiEligible || data?.isManualQualified) return PHASE.ELIGIBILITY_RESULT;
    return PHASE.NEED_HAIR_CHECK;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export const DonationLogisticsFlowScreen = () => {
    const router = useRouter();
    const { user, userProfile, resolvedTheme } = useAuth();
    const { showNotification } = useNotifications({
        role: userProfile?.role,
        userId: user?.id,
        userEmail: user?.email,
        mode: 'badge',
        refreshOnMount: true,
    });
    const roles = resolveThemeRoles(resolvedTheme);

    const [phase, setPhase] = useState(PHASE.LOADING);
    const [moduleData, setModuleData] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    // Donation form state
    const [packagePhoto, setPackagePhoto] = useState(null);
    const [hairLength, setHairLength] = useState('');
    const [hairLengthUnit, setHairLengthUnit] = useState('in');
    const [bundleQty, setBundleQty] = useState('1');
    const [shippingMethod, setShippingMethod] = useState('courier');
    const [pickupAddress, setPickupAddress] = useState('');

    // ── Data loading ──────────────────────────────────────────────────────────

    const loadModuleData = useCallback(async (silent = false) => {
        if (!user?.id) return;
        try {
            const data = await getDonorDonationsModuleData({
                userId: user.id,
                databaseUserId: user.id,
            });
            setModuleData(data);
            setPhase(resolvePhase(data, userProfile));

            // Auto-fill hair length from latest AI screening if not already set
            if (data?.latestScreening?.estimated_length) {
                setHairLength((prev) =>
                    prev ? prev : cmToIn(data.latestScreening.estimated_length)
                );
            }
        } catch (err) {
            logAppError('DonationLogisticsFlow', err);
            if (!silent) setSubmitError('Failed to load donation data. Pull to refresh.');
        }
    }, [user?.id, userProfile]);

    useEffect(() => { loadModuleData(); }, [loadModuleData]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        setSubmitError(null);
        await loadModuleData(true);
        setIsRefreshing(false);
    }, [loadModuleData]);

    // ── Navigation ────────────────────────────────────────────────────────────

    const handleGoToProfile = useCallback(() => router.push('/profile'), [router]);
    const handleCheckHair = useCallback(() => router.push('/donor/hair-history'), [router]);
    const handleProceedFromEligibility = useCallback(() => {
        setSubmitError(null);
        setPhase(PHASE.DONATION_FORM);
    }, []);

    const handleCancelDonation = useCallback(() => {
        setSubmitError(null);
        setPhase(PHASE.NEED_HAIR_CHECK);
    }, []);

    // ── Photo picker ──────────────────────────────────────────────────────────

    const handleSelectPhoto = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });
            if (!result.canceled && result.assets?.[0]) {
                setPackagePhoto(result.assets[0].uri);
            }
        } catch (err) {
            logAppError('DonationLogisticsFlow', err);
        }
    }, []);

    // ── Donation form submit ──────────────────────────────────────────────────

    const handleSubmit = useCallback(async () => {
        setSubmitError(null);

        if (!packagePhoto) {
            setSubmitError('Please upload a photo of your packaged hair donation.');
            return;
        }

        const isAiPath = Boolean(
            moduleData?.isAiEligible && moduleData?.latestSubmission?.submission_id
        );

        if (!isAiPath && !hairLength) {
            setSubmitError('Please enter your hair length.');
            return;
        }

        setIsSubmitting(true);
        try {
            let targetSubmission;

            if (isAiPath) {
                // Reuse the existing AI-qualified submission
                targetSubmission = moduleData.latestSubmission;
            } else {
                // Create a new manual submission with the entered details
                const result = await saveManualDonationQualification({
                    userId: user.id,
                    databaseUserId: user.id,
                    manualDetails: {
                        length_value: hairLength,
                        length_unit: hairLengthUnit,
                        bundle_quantity: bundleQty,
                        treated: 'no',
                        colored: 'no',
                        trimmed: 'no',
                        hair_color: '',
                        density: '',
                    },
                    photo: { uri: packagePhoto },
                    donationRequirement: moduleData?.latestDonationRequirement,
                });

                if (!result.success) {
                    setSubmitError(result.error || 'Failed to save donation details.');
                    return;
                }
                targetSubmission = result.submission;
            }

            // Generate / ensure QR code for this submission (FAST - returns immediately)
            const qrResult = await generateIndependentDonationQrFast({
                userId: user.id,
                submission: targetSubmission,
                databaseUserId: user.id,
            });

            if (!qrResult.success) {
                setSubmitError(qrResult.error || 'Failed to generate QR code. Please try again.');
                return;
            }

            showNotification({
                type: 'success',
                title: 'Donation Submitted',
                message: 'Your donation QR code has been generated.',
            });

            // Reload to reflect the new ongoing-donation state
            await loadModuleData(true);
        } catch (err) {
            logAppError('DonationLogisticsFlow', err);
            setSubmitError(err?.message || 'Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [
        packagePhoto, hairLength, hairLengthUnit, bundleQty,
        moduleData, user?.id, loadModuleData, showNotification,
    ]);

    // ── QR share ─────────────────────────────────────────────────────────────

    const handleShareQr = useCallback(async () => {
        try {
            const { latestSubmission, latestDetail, logistics } = moduleData || {};
            if (!latestSubmission) return;

            const qrPayloadText = buildDonationTrackingQrPayload({
                submission: latestSubmission,
                detail: latestDetail,
                logistics,
            });

            const pdf = await generateDonationQrPdf({
                title: 'Donation QR Code',
                subtitle: `Reference: ${latestSubmission.submission_code || ''}`,
                qrPayloadText,
                helperText: 'Show this QR code to staff at the donation hub for verification.',
                details: [
                    { label: 'Reference Code', value: latestSubmission.submission_code || '' },
                    { label: 'Status', value: capitalize(latestSubmission.status || 'Pending') },
                ],
            });

            await shareDonationQrPdf(pdf.uri);
        } catch (err) {
            logAppError('DonationLogisticsFlow', err);
            showNotification({ type: 'error', message: 'Failed to share QR code.' });
        }
    }, [moduleData, showNotification]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (phase === PHASE.LOADING) {
        return (
            <DashboardLayout
                topBar={<DonorTopBar />}
                navItems={donorDashboardNavItems}
                activeNavKey="donations"
            >
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={theme.colors.brandPrimary} />
                    <Text style={[styles.loadingText, { color: roles.bodyText }]}>
                        Loading donation info…
                    </Text>
                </View>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            topBar={<DonorTopBar />}
            navItems={donorDashboardNavItems}
            activeNavKey="donations"
        >
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={theme.colors.brandPrimary}
                    />
                }
            >
                {/* Page header */}
                <View style={styles.pageHeader}>
                    <Text style={[styles.pageTitle, { color: roles.headingText }]}>
                        Donation Logistics
                    </Text>
                    <Text style={[styles.pageSubtitle, { color: roles.bodyText }]}>
                        Finalize your contribution and schedule your shipment.
                    </Text>
                </View>

                {/* Error banner */}
                {submitError ? (
                    <StatusBanner variant="error" message={submitError} style={styles.banner} />
                ) : null}

                {/* ── Phase screens ── */}

                {phase === PHASE.PROFILE_INCOMPLETE && (
                    <ProfileIncompletePhase
                        roles={roles}
                        profileStatus={getProfileCompletionStatus(userProfile)}
                        onGoToProfile={handleGoToProfile}
                    />
                )}

                {phase === PHASE.NEED_HAIR_CHECK && (
                    <NeedHairCheckPhase
                        roles={roles}
                        onCheckHair={handleCheckHair}
                    />
                )}

                {phase === PHASE.ELIGIBILITY_RESULT && (
                    <EligibilityResultPhase
                        roles={roles}
                        moduleData={moduleData}
                        onProceed={handleProceedFromEligibility}
                        onRecheck={handleCheckHair}
                    />
                )}

                {phase === PHASE.DONATION_FORM && (
                    <DonationFormPhase
                        roles={roles}
                        moduleData={moduleData}
                        hairLength={hairLength}
                        setHairLength={setHairLength}
                        hairLengthUnit={hairLengthUnit}
                        setHairLengthUnit={setHairLengthUnit}
                        bundleQty={bundleQty}
                        setBundleQty={setBundleQty}
                        packagePhoto={packagePhoto}
                        shippingMethod={shippingMethod}
                        setShippingMethod={setShippingMethod}
                        pickupAddress={pickupAddress}
                        setPickupAddress={setPickupAddress}
                        onSelectPhoto={handleSelectPhoto}
                        onSubmit={handleSubmit}
                        onCancel={handleCancelDonation}
                        isSubmitting={isSubmitting}
                    />
                )}

                {phase === PHASE.ACTIVE_DONATION && (
                    <ActiveDonationPhase
                        roles={roles}
                        moduleData={moduleData}
                        onShareQr={handleShareQr}
                        onCheckHair={handleCheckHair}
                    />
                )}
            </ScrollView>
        </DashboardLayout>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase: Profile Incomplete
// ─────────────────────────────────────────────────────────────────────────────

function ProfileIncompletePhase({ roles, profileStatus, onGoToProfile }) {
    return (
        <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                {/* Header row */}
                <View style={styles.cardHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: `${roles.primaryActionBackground}18` }]}>
                        <AppIcon name="person" size="md" state="active" />
                    </View>
                    <View style={styles.cardHeaderText}>
                        <Text style={[styles.cardTitle, { color: roles.headingText }]}>
                            Finish Setting Up Your Account
                        </Text>
                        <Text style={[styles.cardBody, { color: roles.bodyText }]}>
                            Complete your profile before requesting a donation.
                        </Text>
                    </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressWrap}>
                    <View style={[styles.progressTrack, { backgroundColor: roles.defaultCardBorder }]}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${profileStatus.percentage}%`,
                                    backgroundColor: roles.primaryActionBackground,
                                },
                            ]}
                        />
                    </View>
                    <Text style={[styles.progressLabel, { color: roles.metaText }]}>
                        {profileStatus.completedFields} of {profileStatus.totalFields} fields completed
                    </Text>
                </View>

                {/* Missing fields */}
                {profileStatus.missingFieldLabels.slice(0, 4).map((field) => (
                    <View key={field} style={styles.missingRow}>
                        <View style={[styles.dot, { backgroundColor: roles.bodyText }]} />
                        <Text style={[styles.missingField, { color: roles.bodyText }]}>{field}</Text>
                    </View>
                ))}

                <AppButton
                    title="Manage Profile"
                    variant="primary"
                    fullWidth
                    onPress={onGoToProfile}
                    style={styles.cardAction}
                />
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: Need Hair Check
// ─────────────────────────────────────────────────────────────────────────────

function NeedHairCheckPhase({ roles, onCheckHair }) {
    return (
        <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.cardHeader}>
                    <View style={[styles.iconCircle, { backgroundColor: `${roles.primaryActionBackground}18` }]}>
                        <AppIcon name="cut" size="md" state="active" />
                    </View>
                    <View style={styles.cardHeaderText}>
                        <Text style={[styles.cardTitle, { color: roles.headingText }]}>
                            Hair Eligibility Required
                        </Text>
                        <Text style={[styles.cardBody, { color: roles.bodyText }]}>
                            You need a hair eligibility assessment within the last 30 days to proceed.
                        </Text>
                    </View>
                </View>

                <View style={[styles.infoBox, { backgroundColor: roles.defaultCardBackground }]}>
                    <AppIcon name="information-circle" size="sm" state="info" />
                    <Text style={[styles.infoText, { color: roles.bodyText }]}>
                        The Check Hair module will analyze your hair length and condition to confirm donation eligibility.
                    </Text>
                </View>

                <AppButton
                    title="Check Hair Eligibility"
                    variant="primary"
                    fullWidth
                    onPress={onCheckHair}
                    style={styles.cardAction}
                />
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: Eligibility Result
// ─────────────────────────────────────────────────────────────────────────────

function EligibilityResultPhase({ roles, moduleData, onProceed, onRecheck }) {
    const screening = moduleData?.latestScreening;
    const isEligible = moduleData?.isAiEligible;
    const lengthIn = screening?.estimated_length ? cmToIn(screening.estimated_length) : null;
    const assessedDate = screening?.created_at
        ? fmtDate(screening.created_at)
        : moduleData?.latestSubmission?.created_at
            ? fmtDate(moduleData.latestSubmission.created_at)
            : null;

    return (
        <View style={styles.section}>
            {/* Eligibility result card */}
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.cardHeader}>
                    <View style={[
                        styles.iconCircle,
                        { backgroundColor: isEligible ? '#e8f5e9' : '#fce4e4' },
                    ]}>
                        <AppIcon
                            name={isEligible ? 'checkmark-circle' : 'close-circle'}
                            size="md"
                            state={isEligible ? 'active' : 'error'}
                        />
                    </View>
                    <View style={styles.cardHeaderText}>
                        <Text style={[styles.cardTitle, { color: roles.headingText }]}>
                            Hair Eligibility Result
                        </Text>
                        {assessedDate ? (
                            <Text style={[styles.metaLine, { color: roles.metaText }]}>
                                Assessed on {assessedDate}
                            </Text>
                        ) : null}
                    </View>
                </View>

                {/* Result details */}
                <View style={[styles.resultGrid, { backgroundColor: roles.defaultCardBackground }]}>
                    <ResultRow
                        roles={roles}
                        label="Decision"
                        value={capitalize(screening?.decision || (isEligible ? 'Eligible for donation' : 'Not eligible'))}
                        highlight={isEligible}
                    />
                    {lengthIn ? (
                        <ResultRow roles={roles} label="Detected Length" value={`${lengthIn} inches`} />
                    ) : null}
                    {screening?.detected_condition ? (
                        <ResultRow roles={roles} label="Hair Condition" value={capitalize(screening.detected_condition)} />
                    ) : null}
                    {screening?.detected_color ? (
                        <ResultRow roles={roles} label="Color" value={capitalize(screening.detected_color)} />
                    ) : null}
                </View>

                {isEligible ? (
                    <>
                        <AppButton
                            title="Proceed to Donate"
                            variant="primary"
                            fullWidth
                            onPress={onProceed}
                            style={styles.cardAction}
                        />
                        <AppButton
                            title="Re-assess My Hair"
                            variant="outline"
                            fullWidth
                            onPress={onRecheck}
                            style={styles.secondaryAction}
                        />
                    </>
                ) : (
                    <>
                        <View style={[styles.infoBox, { backgroundColor: '#fce4e4' }]}>
                            <AppIcon name="alert-circle" size="sm" state="error" />
                            <Text style={[styles.infoText, { color: roles.bodyText }]}>
                                Your current assessment does not meet donation requirements. Re-assess or improve hair health before donating.
                            </Text>
                        </View>
                        <AppButton
                            title="Re-assess Hair"
                            variant="primary"
                            fullWidth
                            onPress={onRecheck}
                            style={styles.cardAction}
                        />
                    </>
                )}
            </View>
        </View>
    );
}

function ResultRow({ roles, label, value, highlight }) {
    return (
        <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: roles.metaText }]}>{label}</Text>
            <Text style={[
                styles.resultValue,
                { color: highlight ? roles.primaryActionBackground : roles.headingText },
            ]}>
                {value}
            </Text>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: Donation Form
// ─────────────────────────────────────────────────────────────────────────────

function DonationFormPhase({
    roles,
    moduleData,
    hairLength,
    setHairLength,
    hairLengthUnit,
    setHairLengthUnit,
    bundleQty,
    setBundleQty,
    packagePhoto,
    shippingMethod,
    setShippingMethod,
    pickupAddress,
    setPickupAddress,
    onSelectPhoto,
    onSubmit,
    onCancel,
    isSubmitting,
}) {
    const isAiPrefilled = Boolean(moduleData?.isAiEligible && moduleData?.latestScreening?.estimated_length);
    const screening = moduleData?.latestScreening;

    return (
        <View style={styles.section}>
            {/* Hair Specifications */}
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.sectionLabel}>
                    <AppIcon name="cut" size="sm" state="active" />
                    <Text style={[styles.sectionTitle, { color: roles.headingText }]}>
                        Hair Specifications
                    </Text>
                </View>

                {/* Auto-fill notice */}
                {isAiPrefilled ? (
                    <View style={[styles.autofillBanner, { backgroundColor: `${roles.primaryActionBackground}12` }]}>
                        <AppIcon name="checkmark-circle" size="sm" state="active" />
                        <Text style={[styles.autofillText, { color: roles.primaryActionBackground }]}>
                            Details auto-filled from your{screening?.created_at ? ` ${fmtDate(screening.created_at)}` : ''} hair assessment. You may edit if needed.
                        </Text>
                    </View>
                ) : null}

                {/* Hair Length */}
                <View style={styles.formGroup}>
                    <Text style={[styles.fieldLabel, { color: roles.headingText }]}>
                        HAIR LENGTH (INCHES)
                    </Text>
                    <View style={styles.lengthRow}>
                        <AppInput
                            placeholder="e.g. 12"
                            value={hairLength}
                            onChangeText={setHairLength}
                            keyboardType="decimal-pad"
                            style={styles.lengthInput}
                        />
                        <View style={styles.unitToggle}>
                            {['in', 'cm'].map((unit) => (
                                <Pressable
                                    key={unit}
                                    onPress={() => setHairLengthUnit(unit)}
                                    style={[
                                        styles.unitBtn,
                                        hairLengthUnit === unit && {
                                            backgroundColor: roles.primaryActionBackground,
                                        },
                                    ]}
                                >
                                    <Text style={[
                                        styles.unitBtnText,
                                        { color: hairLengthUnit === unit ? '#fff' : roles.bodyText },
                                    ]}>
                                        {unit === 'in' ? 'Inches' : 'CM'}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Number of Bundles */}
                <View style={styles.formGroup}>
                    <Text style={[styles.fieldLabel, { color: roles.headingText }]}>
                        NUMBER OF BUNDLES
                    </Text>
                    <AppInput
                        placeholder="1"
                        value={bundleQty}
                        onChangeText={setBundleQty}
                        keyboardType="number-pad"
                    />
                </View>

                {/* Package Photo */}
                <View style={styles.formGroup}>
                    <Text style={[styles.fieldLabel, { color: roles.headingText }]}>
                        PACKAGE PHOTO
                    </Text>
                    {packagePhoto ? (
                        <Pressable onPress={onSelectPhoto} style={styles.photoPreviewWrap}>
                            <Image
                                source={{ uri: packagePhoto }}
                                style={styles.photoPreview}
                                resizeMode="cover"
                            />
                            <View style={[styles.changeChipBtn, { backgroundColor: roles.primaryActionBackground }]}>
                                <AppIcon name="camera" size="sm" color="#fff" />
                            </View>
                        </Pressable>
                    ) : (
                        <Pressable
                            onPress={onSelectPhoto}
                            style={[styles.photoUpload, { borderColor: roles.primaryActionBackground }]}
                        >
                            <AppIcon name="camera-outline" size="lg" state="muted" />
                            <Text style={[styles.photoUploadText, { color: roles.bodyText }]}>
                                Tap to upload a clear photo of your secured hair bundles in their packaging.
                            </Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Shipping Method */}
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.sectionLabel}>
                    <AppIcon name="car" size="sm" state="active" />
                    <Text style={[styles.sectionTitle, { color: roles.headingText }]}>
                        Shipping Method
                    </Text>
                </View>

                <ShippingOption
                    roles={roles}
                    value="courier"
                    selected={shippingMethod === 'courier'}
                    onSelect={setShippingMethod}
                    title="Standard Courier Pickup"
                    description="A local partner will collect from your address."
                    badge="Free"
                />

                <ShippingOption
                    roles={roles}
                    value="dropoff"
                    selected={shippingMethod === 'dropoff'}
                    onSelect={setShippingMethod}
                    title="Self-Drop Off"
                    description="Drop at the nearest authorized collection center."
                />

                {shippingMethod === 'courier' ? (
                    <View style={styles.formGroup}>
                        <Text style={[styles.fieldLabel, { color: roles.headingText }]}>
                            PICKUP ADDRESS
                        </Text>
                        <AppInput
                            placeholder="Enter your full street address..."
                            value={pickupAddress}
                            onChangeText={setPickupAddress}
                            multiline
                            numberOfLines={2}
                        />
                    </View>
                ) : null}
            </View>

            {/* Donate journey preview */}
            <DonationJourney roles={roles} timelineStages={[]} previewOnly />

            {/* Action Buttons */}
            <View style={styles.buttonGroup}>
                <AppButton
                    title="Submit Donation"
                    variant="primary"
                    fullWidth
                    onPress={onSubmit}
                    loading={isSubmitting}
                    style={styles.submitBtn}
                />
                <AppButton
                    title="Cancel"
                    variant="outline"
                    fullWidth
                    onPress={onCancel}
                    disabled={isSubmitting}
                    style={styles.cancelBtn}
                />
            </View>
            <Text style={[styles.submitNote, { color: roles.metaText }]}>
                By submitting, you agree to our donation quality guidelines.
            </Text>
        </View>
    );
}

function ShippingOption({ roles, value, selected, onSelect, title, description, badge }) {
    return (
        <Pressable
            onPress={() => onSelect(value)}
            style={[
                styles.shippingOption,
                {
                    borderColor: selected ? roles.primaryActionBackground : roles.defaultCardBorder,
                    backgroundColor: selected
                        ? `${roles.primaryActionBackground}08`
                        : roles.defaultCardBackground,
                },
            ]}
        >
            <View style={[
                styles.radioOuter,
                { borderColor: selected ? roles.primaryActionBackground : roles.defaultCardBorder },
            ]}>
                {selected ? (
                    <View style={[styles.radioInner, { backgroundColor: roles.primaryActionBackground }]} />
                ) : null}
            </View>
            <View style={styles.shippingOptionText}>
                <Text style={[styles.shippingTitle, { color: roles.headingText }]}>{title}</Text>
                <Text style={[styles.shippingDesc, { color: roles.bodyText }]}>{description}</Text>
            </View>
            {badge ? (
                <Text style={[styles.shippingBadge, { color: roles.primaryActionBackground }]}>
                    {badge}
                </Text>
            ) : null}
        </Pressable>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: Active Donation (QR + Tracking)
// ─────────────────────────────────────────────────────────────────────────────

function ActiveDonationPhase({ roles, moduleData, onShareQr, onCheckHair }) {
    const {
        latestSubmission,
        latestDetail,
        logistics,
        independentQrState,
        timelineStages = [],
        certificate,
    } = moduleData || {};

    const qrPayloadText = latestSubmission
        ? buildDonationTrackingQrPayload({
            submission: latestSubmission,
            detail: latestDetail,
            logistics,
        })
        : null;

    const qrImageUrl = qrPayloadText ? buildQrImageUrl(qrPayloadText, 300) : null;
    const referenceCode = latestSubmission?.submission_code || '';
    const isPendingScan = !independentQrState?.is_activated;

    return (
        <View style={styles.section}>
            {/* QR Card */}
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.qrHeader}>
                    <Text style={[styles.cardTitle, { color: roles.headingText }]}>
                        Your Shipping ID
                    </Text>
                    <Text style={[styles.cardBody, { color: roles.bodyText }]}>
                        Print or show this QR code at the drop-off hub. It links your donation to your profile for certification.
                    </Text>
                </View>

                {/* QR image */}
                <View style={[styles.qrWrap, { backgroundColor: roles.defaultCardBackground }]}>
                    <View style={[styles.qrStatusBadge, { backgroundColor: isPendingScan ? '#fffbe6' : '#e8f5e9' }]}>
                        <Text style={[
                            styles.qrStatusText,
                            { color: isPendingScan ? '#b8860b' : '#388e3c' },
                        ]}>
                            {isPendingScan ? 'PENDING SCAN' : 'SCANNED & ACTIVE'}
                        </Text>
                    </View>

                    {qrImageUrl ? (
                        <Image
                            source={{ uri: qrImageUrl }}
                            style={styles.qrImage}
                            resizeMode="contain"
                        />
                    ) : (
                        <View style={styles.qrPlaceholder}>
                            <AppIcon name="qr-code" size="lg" state="muted" />
                        </View>
                    )}

                    {referenceCode ? (
                        <View style={styles.refCodeWrap}>
                            <Text style={[styles.refCodeLabel, { color: roles.metaText }]}>
                                PACKAGE REFERENCE
                            </Text>
                            <Text style={[styles.refCode, { color: roles.headingText }]}>
                                {referenceCode}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {/* Actions */}
                <AppButton
                    title="Save to Gallery / Share"
                    variant="primary"
                    fullWidth
                    onPress={onShareQr}
                    style={styles.cardAction}
                />

                {/* Info note */}
                <View style={styles.qrInfoRow}>
                    <AppIcon name="information-circle-outline" size="sm" state="muted" />
                    <Text style={[styles.qrInfoText, { color: roles.metaText }]}>
                        No printer needed. Show this screen to the donation hub staff and they can scan it directly from your device.
                    </Text>
                </View>
            </View>

            {/* Certificate card if available */}
            {certificate ? (
                <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconCircle, { backgroundColor: '#e8f5e9' }]}>
                            <AppIcon name="ribbon" size="md" state="active" />
                        </View>
                        <View style={styles.cardHeaderText}>
                            <Text style={[styles.cardTitle, { color: roles.headingText }]}>
                                Certificate Ready
                            </Text>
                            <Text style={[styles.cardBody, { color: roles.bodyText }]}>
                                Your donation has been received and verified. Download your certificate of donation.
                            </Text>
                        </View>
                    </View>
                    <AppButton
                        title="View Certificate"
                        variant="primary"
                        fullWidth
                        onPress={() => {}}
                        style={styles.cardAction}
                    />
                </View>
            ) : null}

            {/* Donation Journey */}
            <DonationJourney roles={roles} timelineStages={timelineStages} />

            {/* Re-assess option */}
            <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
                <View style={styles.qrInfoRow}>
                    <AppIcon name="information-circle-outline" size="sm" state="muted" />
                    <Text style={[styles.qrInfoText, { color: roles.metaText }]}>
                        Need to re-assess your hair or start a new donation after this one is complete?
                    </Text>
                </View>
                <AppButton
                    title="Go to Hair Check"
                    variant="outline"
                    fullWidth
                    onPress={onCheckHair}
                    style={styles.secondaryAction}
                />
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Donation Journey Timeline
// ─────────────────────────────────────────────────────────────────────────────

const JOURNEY_STAGES = [
    { key: 'donation_created', label: 'Donation Created', description: 'QR generated, awaiting shipment.' },
    { key: 'logistics_confirmed', label: 'Logistics Confirmed', description: 'Pickup or drop-off scheduled.' },
    { key: 'in_transit', label: 'In Transit', description: 'Package moving to facility.' },
    { key: 'quality_verified', label: 'Quality Verified', description: 'Verification of hair health.' },
];

const STAGE_KEY_MAP = {
    donation_created: ['ready_for_shipment', 'qr'],
    logistics_confirmed: ['ready_for_shipment'],
    in_transit: ['in_transit'],
    quality_verified: ['quality_checking', 'received_by_organization'],
};

function DonationJourney({ roles, timelineStages = [], previewOnly = false }) {
    const resolveStageState = (stageKey) => {
        if (previewOnly) {
            return stageKey === 'donation_created' ? 'current' : 'upcoming';
        }
        const mappedKeys = STAGE_KEY_MAP[stageKey] || [];
        const matched = timelineStages.find((s) => mappedKeys.includes(s.key));
        if (!matched) return stageKey === 'donation_created' && timelineStages.length > 0 ? 'completed' : 'upcoming';
        return matched.state === 'upcoming' ? 'upcoming' : matched.state;
    };

    return (
        <View style={[styles.card, { backgroundColor: roles.supportCardBackground }]}>
            <Text style={[styles.cardTitle, { color: roles.headingText }]}>Donation Journey</Text>

            {JOURNEY_STAGES.map((stage, idx) => {
                const state = resolveStageState(stage.key);
                const isCompleted = state === 'completed';
                const isCurrent = state === 'current';
                const isLast = idx === JOURNEY_STAGES.length - 1;

                return (
                    <View key={stage.key} style={styles.journeyItem}>
                        {/* Dot + line */}
                        <View style={styles.journeyDotCol}>
                            <View style={[
                                styles.journeyDot,
                                isCompleted && { backgroundColor: roles.primaryActionBackground },
                                isCurrent && { borderColor: roles.primaryActionBackground, borderWidth: 2 },
                                !isCompleted && !isCurrent && { backgroundColor: roles.defaultCardBorder },
                            ]}>
                                {isCompleted ? (
                                    <AppIcon name="checkmark" size="xs" color="#fff" />
                                ) : null}
                            </View>
                            {!isLast ? (
                                <View style={[
                                    styles.journeyLine,
                                    { backgroundColor: isCompleted ? roles.primaryActionBackground : roles.defaultCardBorder },
                                ]} />
                            ) : null}
                        </View>

                        {/* Text */}
                        <View style={styles.journeyText}>
                            <Text style={[
                                styles.journeyLabel,
                                {
                                    color: isCompleted || isCurrent
                                        ? roles.headingText
                                        : roles.metaText,
                                    fontWeight: isCurrent ? '600' : '400',
                                },
                            ]}>
                                {stage.label}
                            </Text>
                            <Text style={[styles.journeyDesc, { color: roles.metaText }]}>
                                {stage.description}
                            </Text>
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 40 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 300, gap: 12 },
    loadingText: { fontSize: 14 },

    pageHeader: { marginBottom: 20 },
    pageTitle: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
    pageSubtitle: { fontSize: 14, lineHeight: 20 },

    banner: { marginBottom: 16 },

    section: { gap: 16 },

    // Card
    card: {
        borderRadius: theme.radius.lg,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.borderSubtle,
        marginBottom: 16,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
    cardHeaderText: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    cardBody: { fontSize: 13, lineHeight: 18 },
    cardAction: { marginTop: 16 },
    secondaryAction: { marginTop: 8 },

    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Profile incomplete
    progressWrap: { marginBottom: 12 },
    progressTrack: {
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 6,
    },
    progressFill: { height: '100%', borderRadius: 3 },
    progressLabel: { fontSize: 12 },
    missingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    dot: { width: 5, height: 5, borderRadius: 2.5 },
    missingField: { fontSize: 13 },

    // Info box
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderRadius: theme.radius.md,
        padding: 12,
        marginTop: 12,
        marginBottom: 4,
    },
    infoText: { flex: 1, fontSize: 13, lineHeight: 18 },

    // Eligibility result
    metaLine: { fontSize: 12 },
    resultGrid: { borderRadius: theme.radius.md, padding: 12, marginBottom: 12, gap: 8 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultLabel: { fontSize: 12 },
    resultValue: { fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },

    // Section label (form headings)
    sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '600' },

    // Auto-fill banner
    autofillBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        borderRadius: theme.radius.sm,
        padding: 10,
        marginBottom: 12,
    },
    autofillText: { flex: 1, fontSize: 12, lineHeight: 16 },

    // Form
    formGroup: { marginBottom: 14 },
    fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 },
    lengthRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    lengthInput: { flex: 1 },
    unitToggle: { flexDirection: 'row', gap: 4 },
    unitBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: theme.radius.sm,
        backgroundColor: '#f0ece6',
    },
    unitBtnText: { fontSize: 12, fontWeight: '500' },

    // Photo upload
    photoUpload: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderRadius: theme.radius.md,
        minHeight: 140,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 10,
    },
    photoUploadText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    photoPreviewWrap: {
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        height: 180,
        position: 'relative',
    },
    photoPreview: { width: '100%', height: '100%' },
    changeChipBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Shipping options
    shippingOption: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: theme.radius.md,
        padding: 12,
        marginBottom: 10,
        gap: 10,
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioInner: { width: 10, height: 10, borderRadius: 5 },
    shippingOptionText: { flex: 1 },
    shippingTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
    shippingDesc: { fontSize: 12, lineHeight: 16 },
    shippingBadge: { fontSize: 12, fontWeight: '600' },

    // Submit
    submitBtn: { marginTop: 4 },
    cancelBtn: { marginTop: 8 },
    buttonGroup: { gap: 8 },
    submitNote: { fontSize: 11, textAlign: 'center', marginTop: 8 },

    // QR screen
    qrHeader: { marginBottom: 16 },
    qrWrap: {
        borderRadius: theme.radius.md,
        padding: 16,
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    qrStatusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    qrStatusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
    qrImage: { width: 220, height: 220 },
    qrPlaceholder: {
        width: 220,
        height: 220,
        justifyContent: 'center',
        alignItems: 'center',
    },
    refCodeWrap: { alignItems: 'center', gap: 2 },
    refCodeLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
    refCode: { fontSize: 18, fontWeight: '700', letterSpacing: 1 },
    qrInfoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 12,
    },
    qrInfoText: { flex: 1, fontSize: 12, lineHeight: 17 },

    // Journey
    journeyItem: { flexDirection: 'row', gap: 12, minHeight: 48 },
    journeyDotCol: { alignItems: 'center', width: 24 },
    journeyDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#e5e0d8',
    },
    journeyLine: { width: 2, flex: 1, marginTop: 4 },
    journeyText: { flex: 1, paddingBottom: 16 },
    journeyLabel: { fontSize: 14, marginBottom: 2 },
    journeyDesc: { fontSize: 12, lineHeight: 16 },
});

export default DonationLogisticsFlowScreen;
