import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { theme } from '../../design-system/theme';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { DashboardWidgetRail } from '../ui/DashboardWidgetRail';
import { DashboardFeatureCard } from '../ui/DashboardFeatureCard';
import { DashboardInfoCard } from '../ui/DashboardInfoCard';

export function DashboardModuleScreen({ role, navItems, module }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const { unreadCount } = useNotifications({ role, userId: user?.id, databaseUserId: profile?.user_id });

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

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
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate(role === 'donor' ? '/donor/notifications' : '/patient/notifications'),
            },
          ]}
          onSearchPress={() => router.navigate(role === 'donor' ? '/donor/donations' : '/patient/requests')}
        />
      )}
    >
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
});
