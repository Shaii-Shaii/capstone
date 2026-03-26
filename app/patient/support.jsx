import React from 'react';
import { DashboardModuleScreen } from '../../src/components/layout/DashboardModuleScreen';
import { patientDashboardNavItems, patientPlaceholderModules } from '../../src/constants/dashboard';

export default function PatientSupportScreen() {
  return (
    <DashboardModuleScreen
      role="patient"
      navItems={patientDashboardNavItems}
      module={patientPlaceholderModules.support}
    />
  );
}
