import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppIcon } from '../src/components/ui/AppIcon';
import { theme } from '../src/design-system/theme';
import systemLogo from '../src/assets/images/system-logo.jpg';
import heroLanding from '../src/assets/images/hero_landing.png';

export default function LandingScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const heroHeight = isCompactScreen ? 224 : isShortScreen ? 246 : 276;

  const navigateWithHaptic = async (path) => {
    await Haptics.selectionAsync();
    router.push(path);
  };

  return (
    <ScreenContainer
      scrollable={false}
      safeArea
      variant="auth"
      heroColors={[theme.colors.dashboardDonorFrom, theme.colors.heroTo]}
      contentStyle={[
        styles.screenContent,
        isCompactScreen ? styles.screenContentCompact : null,
      ]}
    >
      <View style={[styles.container, isShortScreen ? styles.containerCompact : null]}>
        <View style={styles.backgroundShapeOne} />
        <View style={styles.backgroundShapeTwo} />

        <Animated.View
          entering={FadeInUp.duration(520)}
          style={[styles.heroWrap, isCompactScreen ? styles.heroWrapCompact : null]}
        >
          <ImageBackground
            source={heroLanding}
            resizeMode="cover"
            style={[
              styles.heroCard,
              { height: heroHeight },
              isShortScreen ? styles.heroCardCompact : null,
            ]}
            imageStyle={styles.heroImage}
          >
            <LinearGradient
              colors={['rgba(100,100,100,0.10)', 'rgba(8,8,8,0.28)', 'rgba(8,8,8,0.88)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.heroGlow} />
            <View style={styles.heroGlowSecondary} />

            <View style={styles.heroTopRow}>
              <View style={styles.brandBadge}>
                <View style={styles.logoFrame}>
                  <Image source={systemLogo} style={styles.logoImage} resizeMode="cover" />
                </View>
                <View style={styles.brandCopy}>
                  <Text style={styles.brandName}>StrandShare</Text>
                  <Text style={styles.brandTag}>Hair donation and support</Text>
                </View>
              </View>

              <View style={styles.heroIconButton}>
                <AppIcon name="heart" state="inverse" />
              </View>
            </View>

            <View style={styles.heroContent}>
              <View style={styles.heroChipRow}>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>Support-first</Text>
                </View>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>Donor and patient</Text>
                </View>
              </View>

              <Text style={[styles.heroTitle, isCompactScreen ? styles.heroTitleCompact : null]}>
                Give hope through hair donation and guided support.
              </Text>
              <Text style={[styles.heroSubtitle, isCompactScreen ? styles.heroSubtitleCompact : null]}>
                StrandShare helps patients seek care and donors begin their giving journey in one calm mobile space.
              </Text>
            </View>
          </ImageBackground>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(100).duration(500)}
          style={[styles.panelWrap, isShortScreen ? styles.panelWrapCompact : null]}
        >
          <AppCard
            variant="elevated"
            radius="xl"
            padding={isCompactScreen ? 'sm' : 'lg'}
            contentStyle={styles.actionPanelContent}
            style={[styles.actionPanel, isCompactScreen ? styles.actionPanelCompact : null]}
          >
            <View style={styles.panelMainContent}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelEyebrow}>Start here</Text>
                <Text style={[styles.panelTitle, isCompactScreen ? styles.panelTitleCompact : null]}>
                  Choose the path that fits your StrandShare journey.
                </Text>
                <Text style={styles.panelSubtitle}>
                  Get support, start donating, or return to your existing account with a faster mobile entry flow.
                </Text>
              </View>

              <View style={styles.actionStack}>
                <Animated.View entering={FadeInDown.delay(180).duration(320)}>
                  <AppButton
                    title="I Need Help"
                    variant="primary"
                    size="lg"
                    leading={<AppIcon name="hand-heart" state="inverse" />}
                    onPress={() => navigateWithHaptic('/patient/signup')}
                    enableHaptics={true}
                  />
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(240).duration(320)}>
                  <AppButton
                    title="I Want to Donate"
                    variant="secondary"
                    size="lg"
                    leading={<AppIcon name="heart" state="default" />}
                    onPress={() => navigateWithHaptic('/donor/signup')}
                    enableHaptics={true}
                  />
                </Animated.View>
              </View>
            </View>

            <Animated.View entering={FadeInDown.delay(300).duration(320)} style={styles.accountActionWrap}>
              <Pressable
                onPress={() => navigateWithHaptic('/auth/access')}
                style={({ pressed }) => [
                  styles.accountAction,
                  pressed ? styles.accountActionPressed : null,
                ]}
              >
                <View style={styles.accountActionLeft}>
                  <View style={styles.accountActionIcon}>
                    <AppIcon name="profile" size="md" state="active" />
                  </View>
                  <View style={styles.accountActionCopy}>
                    <Text style={styles.accountActionLabel}>Returning user</Text>
                    <Text numberOfLines={1} style={styles.accountActionTitle}>I already have an account</Text>
                  </View>
                </View>

                <View style={styles.accountActionArrow}>
                  <AppIcon name="chevronRight" size="md" state="active" />
                </View>
              </Pressable>
            </Animated.View>
          </AppCard>
        </Animated.View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
  screenContentCompact: {
    paddingBottom: theme.spacing.xs,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  containerCompact: {
    paddingBottom: 0,
    gap: theme.spacing.xs,
  },
  heroWrap: {
    paddingHorizontal: theme.layout.screenPaddingX,
    zIndex: 1,
    marginBottom: theme.spacing.xs,
  },
  heroWrapCompact: {
    paddingHorizontal: theme.layout.screenPaddingXCompact,
    marginBottom: 0,
  },
  heroCard: {
    borderRadius: 34,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    ...theme.shadows.hero,
  },
  heroCardCompact: {
    padding: theme.spacing.md,
    borderRadius: 30,
  },
  heroImage: {
    borderRadius: 34,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    zIndex: 2,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  logoFrame: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textInverse,
  },
  brandTag: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textHeroMuted,
  },
  heroIconButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.whiteOverlay,
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroContent: {
    zIndex: 2,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  heroChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.medium,
  },
  heroTitle: {
    maxWidth: 280,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    lineHeight: 34,
    color: theme.colors.textInverse,
    marginBottom: theme.spacing.xs,
  },
  heroTitleCompact: {
    maxWidth: 236,
    fontSize: 26,
    lineHeight: 30,
  },
  heroSubtitle: {
    maxWidth: 292,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textHeroSoft,
  },
  heroSubtitleCompact: {
    maxWidth: 240,
  },
  panelWrap: {
    flex: 1,
    paddingHorizontal: theme.layout.screenPaddingX,
    zIndex: 3,
    marginTop: 0,
  },
  panelWrapCompact: {
    paddingHorizontal: theme.layout.screenPaddingXCompact,
  },
  actionPanel: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
    borderRadius: 32,
    paddingTop: theme.spacing.lg,
  },
  actionPanelCompact: {
    borderRadius: 28,
    paddingTop: theme.spacing.md,
  },
  actionPanelContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  panelMainContent: {
    gap: theme.spacing.md,
  },
  panelHeader: {
    marginBottom: 0,
  },
  panelEyebrow: {
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: theme.colors.brandPrimary,
  },
  panelTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 23,
    lineHeight: 28,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  panelTitleCompact: {
    fontSize: 21,
    lineHeight: 25,
  },
  panelSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  actionStack: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  accountActionWrap: {
    marginTop: 'auto',
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  accountAction: {
    minHeight: 68,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  accountActionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  accountActionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  accountActionIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  accountActionCopy: {
    flex: 1,
    gap: 2,
  },
  accountActionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  accountActionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  accountActionArrow: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  backgroundShapeOne: {
    position: 'absolute',
    top: 36,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentSoft,
  },
  backgroundShapeTwo: {
    position: 'absolute',
    top: 186,
    left: -48,
    width: 112,
    height: 112,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroGlow: {
    position: 'absolute',
    top: -28,
    right: -12,
    width: 132,
    height: 132,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(151,49,58,0.26)',
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: 30,
    right: 18,
    width: 86,
    height: 86,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(201,200,200,0.18)',
  },
});
