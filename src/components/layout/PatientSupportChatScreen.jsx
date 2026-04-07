import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { useNotifications } from '../../hooks/useNotifications';
import { theme } from '../../design-system/theme';
import { patientDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';

export function PatientSupportChatScreen() {
  const router = useRouter();
  const { user, profile, patientProfile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'patient', userId: user?.id, databaseUserId: profile?.user_id });

  const firstName = profile?.first_name || patientProfile?.first_name || '';
  const lastName = profile?.last_name || patientProfile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/patient/support') return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="support"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title={firstName || 'Account'}
          subtitle=""
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="patient"
          minimal={true}
          showAvatar={false}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/patient/notifications'),
            },
          ]}
        />
      )}
    >
      <View style={styles.actionWrap}>
        <Text style={styles.helpText}>Use the chat bubble for help.</Text>
        <View style={styles.actionRow}>
          <AppButton
            title="Open Wig Requests"
            fullWidth={false}
            onPress={() => router.navigate('/patient/requests')}
            leading={<AppIcon name="requests" state="inverse" />}
          />
          <AppButton
            title="View Notifications"
            variant="secondary"
            fullWidth={false}
            onPress={() => router.navigate('/patient/notifications')}
            leading={<AppIcon name="notifications" state="muted" />}
          />
        </View>
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  actionWrap: {
    gap: theme.spacing.md,
  },
  helpText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
