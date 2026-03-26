import React from 'react';
import { useAuth } from '../../src/providers/AuthProvider';
import { RoleDashboardHome } from '../../src/components/layout/RoleDashboardHome';
import { donorDashboardContent, donorDashboardNavItems } from '../../src/constants/dashboard';

export default function DonorHomeScreen() {
  const { profile } = useAuth();

  return (
    <RoleDashboardHome
      role="donor"
      profile={profile}
      navItems={donorDashboardNavItems}
      content={donorDashboardContent}
    />
  );
}
