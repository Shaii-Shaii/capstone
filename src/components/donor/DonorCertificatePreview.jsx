import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { theme } from '../../design-system/theme';

function CertificateDetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function DonorCertificatePreview({
  certificate,
  isGenerating,
  isSharingAvailable,
  generatedFileUri,
  onGenerate,
  onShare,
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.preview}>
        <Text style={styles.eyebrow}>Donivra</Text>
        <Text style={styles.title}>Certificate of Appreciation</Text>
        <Text style={styles.subtitle}>Qualified hair donation milestone</Text>

        <Text style={styles.presentedText}>Presented to</Text>
        <Text style={styles.recipient}>{certificate.donorName}</Text>

        <Text style={styles.body}>
          Thank you for reaching a qualified donation milestone through your hair submission. Your donation helps support patients who need wig assistance.
        </Text>

        <View style={styles.detailsCard}>
          <CertificateDetailRow label="Submission code" value={certificate.submissionCode} />
          <CertificateDetailRow label="Donation date" value={certificate.donationDateLabel} />
          <CertificateDetailRow label="Result" value={certificate.decision || 'Qualified'} />
          <CertificateDetailRow label="Bundles" value={String(certificate.bundleQuantity || 0)} />
        </View>

        {certificate.summary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Review summary</Text>
            <Text style={styles.summaryText}>{certificate.summary}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actionRow}>
        <AppButton
          title={generatedFileUri ? 'Regenerate PDF' : 'Generate PDF'}
          loading={isGenerating}
          onPress={onGenerate}
          leading={<AppIcon name="file-document-outline" state="inverse" />}
          fullWidth={false}
        />
        <AppButton
          title="Share Certificate"
          variant="secondary"
          loading={isGenerating}
          disabled={!isSharingAvailable}
          onPress={onShare}
          leading={<AppIcon name="share-variant-outline" state="muted" />}
          fullWidth={false}
        />
      </View>

      <Text style={styles.helperText}>
        {isSharingAvailable
          ? 'Use the share sheet to save the certificate to Files or send it to another app.'
          : 'PDF preview is available, but native sharing is not supported on this device.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: theme.spacing.md,
  },
  preview: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    borderColor: '#c99365',
    backgroundColor: '#fff8ef',
  },
  eyebrow: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#8d5b39',
  },
  title: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 28,
    color: '#5d2f18',
  },
  subtitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: '#7b5d49',
  },
  presentedText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: '#8d5b39',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recipient: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    color: '#2b2118',
  },
  body: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: '#5d4638',
  },
  detailsCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(201, 147, 101, 0.12)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  detailLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: '#7b5d49',
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: '#2b2118',
  },
  summaryCard: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: 'rgba(141, 91, 57, 0.16)',
  },
  summaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#8d5b39',
  },
  summaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: '#5d4638',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  helperText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
