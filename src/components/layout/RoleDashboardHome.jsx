import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View, StyleSheet, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { DashboardWidgetRail } from '../ui/DashboardWidgetRail';
import { DashboardActionCard } from '../ui/DashboardActionCard';
import { DashboardFeatureCard } from '../ui/DashboardFeatureCard';
import { DashboardInfoCard } from '../ui/DashboardInfoCard';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppTextLink } from '../ui/AppTextLink';
import { useNotifications } from '../../hooks/useNotifications';
import { useProcessTracking } from '../../hooks/useProcessTracking';
import { useAuth } from '../../providers/AuthProvider';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { needsPersonalDetailsCompletion } from '../../features/profile/services/profile.service';
import { logAppEvent } from '../../utils/appErrors';

const DONOR_COMPLETION_GUARD_ROUTES = new Set([
  '/donor/status',
  '/donor/donations',
  '/donor/appointment',
]);

function renderDashboardSection({ section, content, role, onItemPress, onActionPress }) {
  const data = content[section.dataKey];
  if (!data) return null;

  const header = (
    <DashboardSectionHeader
      title={data.title}
      description={data.description}
      actionLabel={section.actionLabel}
      onActionPress={section.actionRoute ? () => onActionPress(section.actionRoute) : undefined}
    />
  );

  if (section.kind === 'grid') {
    return (
      <View key={section.key} style={styles.section}>
        {header}
        <View style={styles.gridWrap}>
          {data.items.map((item) => (
            <View key={item.key} style={styles.gridItem}>
              <DashboardActionCard
                title={item.title}
                description={item.description}
                badgeText={item.badgeText}
                meta={item.meta}
                icon={item.icon}
                compact={true}
                variant={role}
                onPress={() => onItemPress(item)}
              />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (section.kind === 'featured') {
    return (
      <View key={section.key} style={styles.section}>
        {header}
        <DashboardWidgetRail
          items={data.items}
          renderItem={(item, index, width) => (
            <DashboardFeatureCard
              key={item.key}
              width={width}
              variant={role}
              title={item.title}
              description={item.description}
              badgeText={item.badgeText}
              meta={item.meta}
              ctaLabel={item.ctaLabel}
              icon={item.icon}
              onPress={() => onItemPress(item)}
            />
          )}
        />
      </View>
    );
  }

  if (section.kind === 'info') {
    return (
      <View key={section.key} style={styles.section}>
        {header}
        <DashboardWidgetRail
          items={data.items}
          cardWidth={section.cardWidth}
          renderItem={(item, index, width) => (
            <DashboardInfoCard
              key={item.key}
              width={width}
              variant={role}
              title={item.title}
              description={item.description}
              badgeText={item.badgeText}
              meta={item.meta}
              icon={item.icon}
              onPress={() => onItemPress(item)}
            />
          )}
        />
      </View>
    );
  }

  return (
    <View key={section.key} style={styles.section}>
      {header}
      <DashboardWidgetRail
        items={data.items}
        cardWidth={section.cardWidth}
        renderItem={(item, index, width) => (
          <DashboardActionCard
            key={item.key}
            title={item.title}
            description={item.description}
            badgeText={item.badgeText}
            meta={item.meta}
            icon={item.icon}
            compact={section.compact ?? false}
            variant={role}
            style={{ width }}
            onPress={() => onItemPress(item)}
          />
        )}
      />
    </View>
  );
}

export function RoleDashboardHome({ role, profile, navItems, content }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, patientProfile, staffProfile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [showCompleteProfilePrompt, setShowCompleteProfilePrompt] = useState(false);
  const { unreadCount } = useNotifications({ role, userId: user?.id, databaseUserId: profile?.user_id });
  const { tracker } = useProcessTracking({ role, userId: user?.id, databaseUserId: profile?.user_id });
  const firstName = (profile?.first_name || '').trim();
  const lastName = (profile?.last_name || '').trim();
  const avatarUri = profile?.avatar_url || profile?.photo_path || patientProfile?.patient_picture || '';
  const avatarInitials = [firstName[0], lastName[0]].filter(Boolean).join('');
  const needsAccountSetup = role !== 'patient' && !staffProfile?.hospital_id;
  const needsProfileCompletion = role === 'donor' && needsPersonalDetailsCompletion(profile);
  const isTentativeRole = String(profile?.role || '').trim().toLowerCase() === 'tentative';
  const welcomeTitle = content.header.greeting === 'hello'
    ? (firstName ? `Hello, ${firstName}` : 'Hello')
    : (firstName ? `Welcome back, ${firstName}` : 'Welcome back');
  const headerTitle = role === 'patient'
    ? (firstName ? `Welcome, ${firstName}` : 'Welcome')
    : welcomeTitle;
  const summaryCard = {
    eyebrow: role === 'patient'
      ? (patientProfile?.patient_code ? `Code ${patientProfile.patient_code}` : 'Patient account')
      : 'Current status',
    title: tracker?.summary?.label || (role === 'patient' ? 'No request yet' : 'No submission yet'),
    body: tracker?.summary?.helperText
      || (role === 'patient'
        ? 'Request updates appear here.'
        : 'Donation updates appear here.'),
  };
  const snapshotItems = [
    {
      key: 'updates',
      label: 'Updates',
      value: unreadCount ? String(unreadCount) : '0',
      icon: 'notifications',
    },
    tracker?.summary?.referenceValue
      ? {
          key: 'reference',
          label: tracker.summary.referenceLabel || 'Reference',
          value: tracker.summary.referenceValue,
          icon: role === 'patient' ? 'requests' : 'donations',
        }
      : null,
    role === 'patient' && patientProfile?.hospital_id
      ? {
          key: 'hospital',
          label: 'Hospital',
          value: `ID ${patientProfile.hospital_id}`,
          icon: 'support',
        }
      : null,
    role !== 'patient' && staffProfile?.hospital_id
      ? {
          key: 'assignment',
          label: 'Hospital',
          value: `ID ${staffProfile.hospital_id}`,
          icon: 'support',
        }
      : null,
  ].filter(Boolean);
  const hasSummaryCard = Boolean(summaryCard.title) || Boolean(snapshotItems.length);

  const handleNavPress = (item) => {
    if (!item.route || item.route === pathname) return;
    if (role === 'donor' && needsProfileCompletion && DONOR_COMPLETION_GUARD_ROUTES.has(item.route)) {
      logAppEvent('profile_completion.modal', 'Profile completion modal displayed from donor feature gate.', {
        authUserId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        role: profile?.role || role,
        route: item.route,
      });
      setShowCompleteProfilePrompt(true);
      return;
    }
    router.navigate(item.route);
  };

  const handleItemPress = async (item) => {
    if (!item.route) return;
    await Haptics.selectionAsync();
    if (item.route === pathname) return;
    if (role === 'donor' && needsProfileCompletion && DONOR_COMPLETION_GUARD_ROUTES.has(item.route)) {
      logAppEvent('profile_completion.modal', 'Profile completion modal displayed from donor feature gate.', {
        authUserId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        role: profile?.role || role,
        route: item.route,
      });
      setShowCompleteProfilePrompt(true);
      return;
    }
    router.navigate(item.route);
  };

  const handleActionRoute = async (route) => {
    if (!route || route === pathname) return;
    await Haptics.selectionAsync();
    if (role === 'donor' && needsProfileCompletion && DONOR_COMPLETION_GUARD_ROUTES.has(route)) {
      logAppEvent('profile_completion.modal', 'Profile completion modal displayed from donor feature gate.', {
        authUserId: user?.id || null,
        databaseUserId: profile?.user_id || null,
        role: profile?.role || role,
        route,
      });
      setShowCompleteProfilePrompt(true);
      return;
    }
    router.navigate(route);
  };

  const quickTools = content.header.quickTools?.map((item) => ({
    ...item,
    onPress: item.route ? () => handleActionRoute(item.route) : undefined,
  })) || [];

  useEffect(() => {
    if (!needsProfileCompletion || !isTentativeRole) {
      setShowCompleteProfilePrompt(false);
    }
  }, [isTentativeRole, needsProfileCompletion]);

  return (
    <>
      <DashboardLayout
        navItems={navItems}
        activeNavKey="home"
        navVariant={role}
        onNavPress={handleNavPress}
        header={(
          <DashboardHeader
            title={headerTitle}
            subtitle={role === 'patient' ? '' : content.header.subtitle}
            summary={content.header.summary}
            avatarInitials={avatarInitials}
            avatarUri={avatarUri}
            variant={role}
            quickTools={role === 'patient' ? [] : quickTools}
            minimal={role === 'patient'}
            showAvatar={role === 'patient' ? true : undefined}
            utilityActions={content.header.utilityActions?.map((item) => ({
              ...item,
              badge: item.key === 'notifications' ? (unreadCount ? String(Math.min(unreadCount, 99)) : undefined) : item.badge,
              onPress: item.route ? () => handleActionRoute(item.route) : undefined,
            }))}
          />
        )}
      >
        {needsAccountSetup ? (
          <AppCard variant="donorTint" radius="xl" padding="md" style={styles.setupCard}>
            <View style={styles.setupCopy}>
              <Text style={[styles.setupTitle, { color: roles.headingText }]}>Complete Account Setup</Text>
              <Text style={[styles.setupBody, { color: roles.bodyText }]}>Finish your profile.</Text>
            </View>
            <AppButton
              title="Open Profile"
              fullWidth={false}
              onPress={() => handleActionRoute('/profile')}
              leading={<AppIcon name="profile" state="inverse" />}
            />
          </AppCard>
        ) : null}

        {hasSummaryCard ? (
          <AppCard variant={role === 'donor' ? 'donorTint' : 'patientTint'} radius="xl" padding="xs">
            {summaryCard.eyebrow ? (
              <Text style={[styles.summaryEyebrow, { color: role === 'donor' ? (resolvedTheme?.primaryColor || roles.metaText) : roles.metaText }]}>
                {summaryCard.eyebrow}
              </Text>
            ) : null}
            {summaryCard.title ? <Text style={[styles.summaryTitle, { color: roles.headingText }]}>{summaryCard.title}</Text> : null}
            {summaryCard.body ? <Text style={[styles.summaryBody, { color: roles.bodyText }]}>{summaryCard.body}</Text> : null}
            {snapshotItems.length ? (
              <View style={styles.snapshotRow}>
                {snapshotItems.map((item) => (
                  <View
                    key={item.key}
                    style={[
                      styles.snapshotPill,
                      {
                        backgroundColor: roles.defaultCardBackground,
                        borderColor: roles.defaultCardBorder,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.snapshotIconWrap,
                        {
                          backgroundColor: role === 'donor' ? roles.iconPrimarySurface : roles.iconSupportSurface,
                        },
                      ]}
                    >
                      <AppIcon
                        name={item.icon}
                        size="sm"
                        state="default"
                        color={role === 'donor' ? roles.iconPrimaryColor : roles.iconSupportColor}
                      />
                    </View>
                    <View style={styles.snapshotCopy}>
                      <Text style={[styles.snapshotLabel, { color: roles.metaText }]}>{item.label}</Text>
                      <Text style={[styles.snapshotValue, { color: roles.headingText }]}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </AppCard>
        ) : null}

        {content.sections.map((section) => renderDashboardSection({
          section,
          content,
          role,
          onItemPress: handleItemPress,
          onActionPress: handleActionRoute,
        }))}
      </DashboardLayout>

      <Modal
        transparent
        visible={showCompleteProfilePrompt}
        animationType="fade"
        onRequestClose={() => setShowCompleteProfilePrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowCompleteProfilePrompt(false)} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
            <View style={styles.modalCopy}>
              <Text style={[styles.modalTitle, { color: roles.headingText }]}>Complete Your Details</Text>
              <Text style={[styles.modalBody, { color: roles.bodyText }]}>
                Add your personal details.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <AppButton
                title="Open Profile"
                size="lg"
                onPress={() => {
                  setShowCompleteProfilePrompt(false);
                  handleActionRoute('/profile');
                }}
              />
              <AppTextLink
                title="Later"
                variant="muted"
                onPress={() => setShowCompleteProfilePrompt(false)}
              />
            </View>
          </AppCard>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.xs,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  gridItem: {
    width: '22.8%',
    minWidth: 74,
  },
  summaryEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
  },
  summaryTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    marginBottom: 2,
  },
  summaryBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  snapshotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  snapshotPill: {
    minWidth: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  snapshotIconWrap: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotCopy: {
    gap: 1,
  },
  snapshotLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  snapshotValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  setupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  setupCopy: {
    flex: 1,
    gap: 2,
  },
  setupTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  setupBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: theme.layout.authCardMaxWidth,
    alignSelf: 'center',
  },
  modalCopy: {
    gap: theme.spacing.xs,
  },
  modalTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
  },
  modalBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalActions: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
