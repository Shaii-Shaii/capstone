import React from 'react';
import { useAuth } from '../../src/providers/AuthProvider';
import { RoleDashboardHome } from '../../src/components/layout/RoleDashboardHome';
import { patientDashboardContent, patientDashboardNavItems } from '../../src/constants/dashboard';

export default function PatientHomeScreen() {
  const { profile } = useAuth();

  return (
    <RoleDashboardHome
      role="patient"
      profile={profile}
      navItems={patientDashboardNavItems}
      content={patientDashboardContent}
    />
  );
}
