import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../design-system/theme';
import { AppTextLink } from '../ui/AppTextLink';
import donivraLogoNoText from '../../assets/images/donivra_logo_no_text.png';

const HEADER_VARIANTS = {
  donor: {
    colors: [theme.colors.dashboardDonorFrom, theme.colors.dashboardDonorTo],
    chipOne: 'Donor journey',
    chipTwo: 'Hair donation',
  },
  patient: {
    colors: [theme.colors.dashboardPatientFrom, theme.colors.dashboardPatientTo],
    chipOne: 'Patient support',
    chipTwo: 'Care access',
  },
  access: {
    colors: [theme.colors.heroFrom, theme.colors.heroTo],
    chipOne: 'Donor access',
    chipTwo: 'Patient access',
  },
  default: {
    colors: [theme.colors.heroFrom, theme.colors.heroTo],
    chipOne: 'Hair donation',
    chipTwo: 'Secure account',
  },
};

export const AuthHeader = ({
  title,
  subtitle,
  eyebrow,
  style,
  backLabel,
  onBackPress,
  role = 'default',
}) => {
  const config = HEADER_VARIANTS[role] || HEADER_VARIANTS.default;

  return (
    <View style={[styles.container, style]}>
      {backLabel && onBackPress ? (
        <AppTextLink title={backLabel} variant="muted" onPress={onBackPress} style={styles.backLink} />
      ) : null}

      <LinearGradient
        colors={config.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.visualCard}
      >
        <View style={styles.glowPrimary} />
        <View style={styles.glowSecondary} />

        <View style={styles.visualTopRow}>
          <View style={styles.logoGroup}>
            <View style={styles.logoFrame}>
              <Image source={donivraLogoNoText} style={styles.logoImage} resizeMode="contain" />
            </View>
            <View style={styles.visualCopy}>
              <Text style={styles.brandName}>Donivra</Text>
              <Text style={styles.brandTag}>Hair donation and support</Text>
            </View>
          </View>

          {eyebrow ? (
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrowText}>{eyebrow}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.chipRow}>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{config.chipOne}</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{config.chipTwo}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.xs,
  },
  backLink: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  visualCard: {
    borderRadius: 28,
    padding: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  glowPrimary: {
    position: 'absolute',
    top: -28,
    right: -18,
    width: 116,
    height: 116,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  glowSecondary: {
    position: 'absolute',
    bottom: -18,
    left: -16,
    width: 82,
    height: 82,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  visualTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  logoFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  visualCopy: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textInverse,
  },
  brandTag: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textHeroMuted,
  },
  eyebrowPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  eyebrowText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  heroChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.medium,
  },
  copyBlock: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleLg,
    lineHeight: theme.typography.compact.titleLg * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
