import React from 'react';
import { DashboardModuleScreen } from '../../src/components/layout/DashboardModuleScreen';
import { donorDashboardNavItems, donorPlaceholderModules } from '../../src/constants/dashboard';

export default function DonorAppointmentScreen() {
  return (
    <DashboardModuleScreen
      role="donor"
      navItems={donorDashboardNavItems}
      module={donorPlaceholderModules.appointment}
    />
  );
}
