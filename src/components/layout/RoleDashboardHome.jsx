import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
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
import { AppIcon } from '../ui/AppIcon';
import { useNotifications } from '../../hooks/useNotifications';
import { useProcessTracking } from '../../hooks/useProcessTracking';
import { useAuth } from '../../providers/AuthProvider';
import { theme } from '../../design-system/theme';

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
  const { user, patientProfile, staffProfile } = useAuth();
  const { unreadCount } = useNotifications({ role, userId: user?.id, databaseUserId: profile?.user_id });
  const { tracker } = useProcessTracking({ role, userId: user?.id, databaseUserId: profile?.user_id });
  const firstName = profile?.first_name || (role === 'donor' ? 'Donor' : 'Patient');
  const lastName = profile?.last_name || '';
  const avatarInitials = [firstName[0], lastName[0]].filter(Boolean).join('');
  const title = content.header.greeting === 'hello' ? `Hello, ${firstName}` : `Welcome back, ${firstName}`;
  const summaryCard = {
    eyebrow: role === 'patient'
      ? (patientProfile?.patient_code ? `Code ${patientProfile.patient_code}` : 'Patient account')
      : 'Current status',
    title: tracker?.summary?.label || (role === 'patient' ? 'No request yet' : 'No submission yet'),
    body: tracker?.summary?.helperText
      || (role === 'patient'
        ? 'Your linked request updates show here.'
        : 'Your latest donation updates show here.'),
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
    router.navigate(item.route);
  };

  const handleItemPress = async (item) => {
    if (!item.route) return;
    await Haptics.selectionAsync();
    if (item.route === pathname) return;
    router.navigate(item.route);
  };

  const handleActionRoute = async (route) => {
    if (!route || route === pathname) return;
    await Haptics.selectionAsync();
    router.navigate(route);
  };

  const quickTools = content.header.quickTools?.map((item) => ({
    ...item,
    onPress: item.route ? () => handleActionRoute(item.route) : undefined,
  })) || [];

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavKey="home"
      navVariant={role}
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title={title}
          subtitle={content.header.subtitle}
          summary={content.header.summary}
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant={role}
          quickTools={quickTools}
          utilityActions={content.header.utilityActions?.map((item) => ({
            ...item,
            badge: item.key === 'notifications' && unreadCount ? String(Math.min(unreadCount, 99)) : item.badge,
            onPress: item.route ? () => handleActionRoute(item.route) : undefined,
          }))}
        />
      )}
    >
      {hasSummaryCard ? (
        <AppCard variant={role === 'donor' ? 'donorTint' : 'patientTint'} radius="xl" padding="xs">
          {summaryCard.eyebrow ? (
            <Text style={[styles.summaryEyebrow, role === 'donor' ? styles.summaryEyebrowDonor : null]}>
              {summaryCard.eyebrow}
            </Text>
          ) : null}
          {summaryCard.title ? <Text style={styles.summaryTitle}>{summaryCard.title}</Text> : null}
          {summaryCard.body ? <Text style={styles.summaryBody}>{summaryCard.body}</Text> : null}
          {snapshotItems.length ? (
            <View style={styles.snapshotRow}>
              {snapshotItems.map((item) => (
                <View key={item.key} style={styles.snapshotPill}>
                  <View style={[styles.snapshotIconWrap, role === 'donor' ? styles.snapshotIconWrapDonor : null]}>
                    <AppIcon name={item.icon} size="sm" state={role === 'donor' ? 'active' : 'muted'} />
                  </View>
                  <View style={styles.snapshotCopy}>
                    <Text style={styles.snapshotLabel}>{item.label}</Text>
                    <Text style={styles.snapshotValue}>{item.value}</Text>
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
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
  },
  summaryEyebrowDonor: {
    color: theme.colors.brandPrimary,
  },
  summaryTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  summaryBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
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
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  snapshotIconWrap: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  snapshotIconWrapDonor: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  snapshotCopy: {
    gap: 1,
  },
  snapshotLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  snapshotValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
});
