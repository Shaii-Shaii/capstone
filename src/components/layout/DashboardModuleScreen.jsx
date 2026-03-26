import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../providers/AuthProvider';
import { theme } from '../../design-system/theme';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { DashboardWidgetRail } from '../ui/DashboardWidgetRail';
import { DashboardFeatureCard } from '../ui/DashboardFeatureCard';
import { DashboardInfoCard } from '../ui/DashboardInfoCard';
import { AppCard } from '../ui/AppCard';

export function DashboardModuleScreen({ role, navItems, module }) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();

  const firstName = profile?.first_name || (role === 'donor' ? 'Donor' : 'Friend');
  const statusText = profile?.is_profile_completed ? 'Profile ready' : 'Profile in progress';
  const avatarInitials = `${profile?.first_name?.[0] || firstName[0] || ''}${profile?.last_name?.[0] || ''}`.trim() || 'SS';

  const handleNavPress = (item) => {
    if (!item.route) return;
    if (item.route === pathname) return;
    router.navigate(item.route);
  };

  const handleCardPress = async (item) => {
    if (!item.route || item.route === pathname) return;
    await Haptics.selectionAsync();
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavKey={module.activeNavKey}
      navVariant={role}
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title={module.title}
          subtitle={module.subtitle}
          summary={module.summary}
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant={role}
          statusChips={[role === 'donor' ? 'Donor journey' : 'Patient support', statusText, module.title]}
          searchPlaceholder={role === 'donor' ? 'Search donor tools, tracking, updates' : 'Search support, requests, updates'}
          quickTools={[
            {
              key: 'profile',
              label: 'Profile',
              icon: 'profile',
              onPress: () => router.navigate('/profile'),
            },
          ]}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: role === 'donor' ? '2' : '3',
              onPress: () => router.navigate(role === 'donor' ? '/donor/notifications' : '/patient/notifications'),
            },
          ]}
          onSearchPress={() => router.navigate(role === 'donor' ? '/donor/donations' : '/patient/requests')}
        />
      )}
    >
      <AppCard variant={role === 'donor' ? 'donorTint' : 'patientTint'} radius="xl" padding="xs">
        <Text style={styles.moduleEyebrow}>{role === 'donor' ? 'Signed-in module' : 'Support module'}</Text>
        <Text style={styles.moduleTitle}>{module.title}</Text>
        <Text style={styles.moduleBody}>{module.summary}</Text>
      </AppCard>

      <View style={styles.section}>
        <DashboardSectionHeader
          title={module.featured.title}
          description={module.featured.description}
        />
        <DashboardWidgetRail
          items={module.featured.items}
          renderItem={(item, index, width, scrollX) => (
            <DashboardFeatureCard
              key={item.key}
              width={width}
              index={index}
              scrollX={scrollX}
              variant={role}
              title={item.title}
              description={item.description}
              badgeText={item.badgeText}
              meta={item.meta}
              ctaLabel={item.ctaLabel}
              icon={item.icon}
              imageUrl={item.imageUrl}
              onPress={() => handleCardPress(item)}
            />
          )}
        />
      </View>

      <View style={styles.section}>
        <DashboardSectionHeader
          title={module.highlights.title}
          description={module.highlights.description}
        />
        <DashboardWidgetRail
          items={module.highlights.items}
          cardWidth={196}
          renderItem={(item, index, width, scrollX) => (
            <DashboardInfoCard
              key={item.key}
              width={width}
              index={index}
              scrollX={scrollX}
              variant={role}
              title={item.title}
              description={item.description}
              badgeText={item.badgeText}
              meta={item.meta}
              icon={item.icon}
              onPress={() => handleCardPress(item)}
            />
          )}
        />
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.xs,
  },
  moduleEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.xs,
  },
  moduleTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  moduleBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});
