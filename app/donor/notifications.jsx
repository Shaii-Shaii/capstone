import React from 'react';
import { DashboardModuleScreen } from '../../src/components/layout/DashboardModuleScreen';
import { donorDashboardNavItems, donorPlaceholderModules } from '../../src/constants/dashboard';

export default function DonorNotificationsScreen() {
  return (
    <DashboardModuleScreen
      role="donor"
      navItems={donorDashboardNavItems}
      module={donorPlaceholderModules.notifications}
    />
  );
}
