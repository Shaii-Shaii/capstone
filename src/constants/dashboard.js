export const dashboardSampleImages = {
  donorProgram: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=1200&q=80',
  donorGuidelines: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80',
  donorAppointment: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=80',
  donorNotifications: 'https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1200&q=80',
  patientSupport: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
  patientRequest: 'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=1200&q=80',
  patientResources: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80',
  patientNotifications: 'https://images.unsplash.com/photo-1516302752625-fcc3c50ae61f?auto=format&fit=crop&w=1200&q=80',
};

export const donorDashboardContent = {
  header: {
    greeting: 'hello',
    subtitle: 'Donation home',
    summary: '',
    utilityActions: [
      { key: 'notifications', icon: 'notifications', badge: '2', route: '/donor/notifications' },
    ],
    quickTools: [],
  },
  summaryCard: null,
  snapshotItems: [],
  quickActions: {
    title: 'Main Actions',
    description: 'Open the next donor step.',
    items: [
      {
        key: 'status',
        title: 'Track',
        description: 'Review status and milestones.',
        badgeText: 'Live',
        meta: 'Status',
        icon: 'donations',
        route: '/donor/status',
      },
      {
        key: 'prepare',
        title: 'Prepare',
        description: 'Open donation prep notes.',
        badgeText: 'Guide',
        meta: 'Checklist',
        icon: 'support',
        route: '/donor/donations',
      },
      {
        key: 'appointment',
        title: 'Visit',
        description: 'Manage your salon step.',
        badgeText: 'Book',
        meta: 'Appointment',
        icon: 'appointment',
        route: '/donor/appointment',
      },
      {
        key: 'profile',
        title: 'Profile',
        description: 'Manage account and password.',
        badgeText: 'Me',
        meta: 'Account',
        icon: 'profile',
        route: '/profile',
      },
    ],
  },
  progress: {
    title: 'Next Steps',
    description: 'Latest donor steps.',
    items: [
      {
        key: 'prep',
        title: 'Hair Preparation',
        description: 'Make sure donated hair is clean, dry, and tied before handoff.',
        badgeText: 'Next',
        meta: 'Prep in 1 day',
        icon: 'success',
        route: '/donor/donations',
      },
      {
        key: 'visit',
        title: 'Appointment Ready',
        description: 'Confirm the next salon or collection step before your donation visit.',
        badgeText: 'Visit',
        meta: 'Scheduling step',
        icon: 'appointment',
        route: '/donor/appointment',
      },
      {
        key: 'review',
        title: 'Program Review',
        description: 'Read how Donivra guides donated hair toward real support journeys.',
        badgeText: 'Read',
        meta: '2 min',
        icon: 'shield',
      },
    ],
  },
  account: {
    title: 'Account',
    description: 'Profile tools.',
    items: [
      {
        key: 'profile',
        title: 'Profile & Security',
        description: 'Manage account details and password settings.',
        badgeText: 'Profile',
        meta: 'Account center',
        icon: 'profile',
        route: '/profile',
      },
      {
        key: 'journey',
        title: 'Journey Notes',
        description: 'Return to donor progress and preparation details whenever you need them.',
        badgeText: 'Guide',
        meta: 'Donor tools',
        icon: 'donations',
        route: '/donor/donations',
      },
    ],
  },
  sections: [
    {
      key: 'quick-actions',
      kind: 'grid',
      dataKey: 'quickActions',
    },
    {
      key: 'progress',
      kind: 'info',
      dataKey: 'progress',
      cardWidth: 184,
    },
    {
      key: 'account',
      kind: 'actions',
      dataKey: 'account',
      compact: false,
      cardWidth: 188,
    },
  ],
};

export const patientDashboardContent = {
  header: {
    greeting: 'welcome',
    subtitle: 'Support home',
    summary: '',
    utilityActions: [
      { key: 'notifications', icon: 'notifications', badge: '3', route: '/patient/notifications' },
    ],
    quickTools: [],
  },
  summaryCard: null,
  snapshotItems: [],
  quickActions: {
    title: 'Main Actions',
    description: 'Open the next patient step.',
    items: [
      {
        key: 'submit',
        title: 'Request',
        description: 'Open request intake.',
        badgeText: 'Start',
        meta: 'Status',
        icon: 'requests',
        route: '/patient/requests',
      },
      {
        key: 'resources',
        title: 'Resources',
        description: 'Browse support materials.',
        badgeText: 'Care',
        meta: 'Hub',
        icon: 'support',
        route: '/patient/support',
      },
      {
        key: 'status',
        title: 'Status',
        description: 'Track request progress.',
        badgeText: 'Live',
        meta: 'Timeline',
        icon: 'requests',
        route: '/patient/requests',
      },
      {
        key: 'profile',
        title: 'Profile',
        description: 'Manage personal details and password.',
        badgeText: 'Me',
        meta: 'Account',
        icon: 'profile',
        route: '/profile',
      },
    ],
  },
  requestStatus: {
    title: 'Next Steps',
    description: 'Latest patient steps.',
    items: [
      {
        key: 'readiness',
        title: 'Profile Ready',
        description: 'Current contact details help support updates reach you clearly.',
        badgeText: 'Ready',
        meta: 'Account health',
        icon: 'success',
        route: '/profile',
      },
      {
        key: 'care',
        title: 'Support Notes',
        description: 'Review the practical information you may need before the next update.',
        badgeText: 'Tip',
        meta: 'Guidance',
        icon: 'shield',
        route: '/patient/support',
      },
      {
        key: 'timeline',
        title: 'Next Update',
        description: 'Return to your request progress to keep the support timeline visible.',
        badgeText: 'Status',
        meta: 'Request timeline',
        icon: 'requests',
        route: '/patient/requests',
      },
    ],
  },
  account: {
    title: 'Account',
    description: 'Profile tools.',
    items: [
      {
        key: 'profile',
        title: 'Profile & Security',
        description: 'Manage your details, password, and account info.',
        badgeText: 'Profile',
        meta: 'Account center',
        icon: 'profile',
        route: '/profile',
      },
      {
        key: 'support-center',
        title: 'Support Center',
        description: 'Revisit support guidance and request-related resources from your patient home.',
        badgeText: 'Care',
        meta: 'Support tools',
        icon: 'support',
        route: '/patient/support',
      },
    ],
  },
  sections: [
    {
      key: 'quick-actions',
      kind: 'grid',
      dataKey: 'quickActions',
    },
    {
      key: 'request-status',
      kind: 'info',
      dataKey: 'requestStatus',
      cardWidth: 184,
    },
    {
      key: 'account',
      kind: 'actions',
      dataKey: 'account',
      compact: false,
      cardWidth: 188,
    },
  ],
};

export const donorDashboardNavItems = [
  {
    key: 'home',
    label: 'Home',
    icon: 'home',
    activeIcon: 'homeActive',
    route: '/donor/home',
    accessibilityLabel: 'Donor home tab',
    role: 'donor',
  },
  {
    key: 'donations',
    label: 'Donations',
    icon: 'donations',
    activeIcon: 'donationsActive',
    route: '/donor/donations',
    accessibilityLabel: 'Donations tab',
    role: 'donor',
  },
  {
    key: 'appointment',
    label: 'Appointment',
    icon: 'appointment',
    activeIcon: 'appointmentActive',
    route: '/donor/appointment',
    accessibilityLabel: 'Appointment tab',
    role: 'donor',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'profile',
    activeIcon: 'profileActive',
    route: '/profile',
    accessibilityLabel: 'Profile tab',
    role: 'donor',
  },
];

export const patientDashboardNavItems = [
  {
    key: 'home',
    label: 'Home',
    icon: 'home',
    activeIcon: 'homeActive',
    route: '/patient/home',
    accessibilityLabel: 'Patient home tab',
    role: 'patient',
  },
  {
    key: 'requests',
    label: 'Requests',
    icon: 'requests',
    activeIcon: 'requestsActive',
    route: '/patient/requests',
    accessibilityLabel: 'Requests tab',
    role: 'patient',
  },
  {
    key: 'support',
    label: 'Support',
    icon: 'support',
    activeIcon: 'supportActive',
    route: '/patient/support',
    accessibilityLabel: 'Support tab',
    role: 'patient',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'profile',
    activeIcon: 'profileActive',
    route: '/profile',
    accessibilityLabel: 'Profile tab',
    role: 'patient',
  },
];

export const donorPlaceholderModules = {
  donations: {
    activeNavKey: 'donations',
    title: 'Donations',
    subtitle: 'Monitor donor progress, preparation steps, and future milestone tracking in one place.',
    summary: 'This donor module is ready for richer tracking flows while already fitting into your signed-in dashboard structure.',
    featured: {
      title: 'Donation Focus',
      description: 'Swipe through the donor-facing areas that will expand here next.',
      items: [
        {
          key: 'overview',
          title: 'Donation Timeline',
          description: 'Future tracking will highlight intake, review, and handoff milestones.',
          badgeText: 'Soon',
          meta: 'Timeline module',
          ctaLabel: 'View roadmap',
          icon: 'donations',
          imageUrl: dashboardSampleImages.donorProgram,
        },
        {
          key: 'readiness',
          title: 'Preparation Check',
          description: 'Hair preparation reminders and review checkpoints will surface here.',
          badgeText: 'Guide',
          meta: 'Preparation flow',
          ctaLabel: 'See checklist',
          icon: 'support',
          imageUrl: dashboardSampleImages.donorGuidelines,
        },
      ],
    },
    highlights: {
      title: 'Quick Notes',
      description: 'Compact cards keep this placeholder useful until the full module lands.',
      items: [
        { key: 'one', title: 'Tracking Ready', description: 'This route is live and prepared for donor status widgets.', badgeText: 'Live', meta: 'Scalable route', icon: 'success' },
        { key: 'two', title: 'Shared Layout', description: 'The same signed-in shell, tabs, and safe-area handling already apply.', badgeText: 'Shared', meta: 'Reusable architecture', icon: 'shield' },
      ],
    },
  },
  appointment: {
    activeNavKey: 'appointment',
    title: 'Appointment',
    subtitle: 'Keep salon coordination, preferred schedules, and future partner booking tools together.',
    summary: 'This area is ready for real donor appointment workflows while already behaving like a complete signed-in destination.',
    featured: {
      title: 'Appointment Hub',
      description: 'Swipe through the future booking and scheduling surfaces prepared for donor appointments.',
      items: [
        { key: 'calendar', title: 'Booking View', description: 'Partner salon slots and booking windows will live here.', badgeText: 'Soon', meta: 'Scheduling flow', ctaLabel: 'Preview layout', icon: 'appointment', imageUrl: dashboardSampleImages.donorAppointment },
        { key: 'visit', title: 'Visit Notes', description: 'Preparation details, arrival reminders, and cut guidance can be added here next.', badgeText: 'Next', meta: 'Visit support', ctaLabel: 'Read notes', icon: 'support', imageUrl: dashboardSampleImages.donorGuidelines },
      ],
    },
    highlights: {
      title: 'Why This Route Exists',
      description: 'A real route now exists so donor tabs are complete instead of dead placeholders.',
      items: [
        { key: 'one', title: 'Future Booking', description: 'Ready for actual booking widgets and salon partner integrations.', badgeText: 'Ready', meta: 'Scalable module', icon: 'appointment' },
        { key: 'two', title: 'Mobile Safe', description: 'Uses the same premium tab shell and safe-area handling as the rest of the app.', badgeText: 'Safe', meta: 'Shared behavior', icon: 'shield' },
      ],
    },
  },
  notifications: {
    activeNavKey: 'notifications',
    title: 'Notifications',
    subtitle: 'See reminders, status changes, and future donor alerts in a dedicated signed-in space.',
    summary: 'This route is already part of the donor tab system so notification flows can be added cleanly later.',
    featured: {
      title: 'Notification Focus',
      description: 'Swipe through the alert groupings that can grow into a full donor inbox.',
      items: [
        { key: 'alerts', title: 'Donor Alerts', description: 'Reminder cards, milestones, and partner notes will appear here.', badgeText: 'Alerts', meta: 'Notification stream', ctaLabel: 'See preview', icon: 'notifications', imageUrl: dashboardSampleImages.donorNotifications },
        { key: 'digest', title: 'Weekly Digest', description: 'A future digest view can summarize all donation-related progress in one glance.', badgeText: 'Digest', meta: 'Summary module', ctaLabel: 'Open digest', icon: 'updates', imageUrl: dashboardSampleImages.donorProgram },
      ],
    },
    highlights: {
      title: 'Preview Cards',
      description: 'Clean preview content keeps the route intentional until live alerts are connected.',
      items: [
        { key: 'one', title: 'Tab Ready', description: 'The donor notification tab is fully connected and navigable.', badgeText: 'Live', meta: 'No dead tab', icon: 'success' },
        { key: 'two', title: 'Future Badges', description: 'Badge counts can stay config-driven as real notifications arrive.', badgeText: 'Badge', meta: 'Config-driven', icon: 'notifications' },
      ],
    },
  },
};

export const patientPlaceholderModules = {
  requests: {
    activeNavKey: 'requests',
    title: 'Requests',
    subtitle: 'Track request progress, milestones, and future intake flows in a dedicated patient route.',
    summary: 'This patient route is already active inside the tab system, ready for real request modules when they are built.',
    featured: {
      title: 'Request Focus',
      description: 'Swipe through the request-specific spaces prepared for patient use.',
      items: [
        { key: 'intake', title: 'Request Intake', description: 'New submission forms and follow-up prompts can expand here next.', badgeText: 'Start', meta: 'Intake flow', ctaLabel: 'See intake', icon: 'requests', imageUrl: dashboardSampleImages.patientRequest },
        { key: 'progress', title: 'Request Timeline', description: 'Milestones and support checkpoints will have a dedicated home here.', badgeText: 'Status', meta: 'Timeline module', ctaLabel: 'Track status', icon: 'updates', imageUrl: dashboardSampleImages.patientSupport },
      ],
    },
    highlights: {
      title: 'Request Notes',
      description: 'Compact cards help this route feel complete while staying ready for future work.',
      items: [
        { key: 'one', title: 'Dedicated Route', description: 'Requests now live on a real patient tab instead of a dead destination.', badgeText: 'Live', meta: 'Working tab', icon: 'success' },
        { key: 'two', title: 'Future Tracking', description: 'This route can grow into a full request status module cleanly.', badgeText: 'Scalable', meta: 'Shared shell', icon: 'shield' },
      ],
    },
  },
  support: {
    activeNavKey: 'support',
    title: 'Support',
    subtitle: 'Keep care resources, practical guidance, and future support tools together in one patient space.',
    summary: 'The support tab is in place now so future patient help modules can grow without changing the navigation model.',
    featured: {
      title: 'Support Hub',
      description: 'Swipe through the support surfaces already prepared for patient journeys.',
      items: [
        { key: 'resources', title: 'Helpful Resources', description: 'Care references, support materials, and practical reminders can expand here.', badgeText: 'Care', meta: 'Resource hub', ctaLabel: 'Open support', icon: 'support', imageUrl: dashboardSampleImages.patientSupport },
        { key: 'account', title: 'Profile & Support', description: 'Your account details and support readiness stay close to the rest of the care journey.', badgeText: 'Profile', meta: 'Support setup', ctaLabel: 'Open profile', icon: 'profile', imageUrl: dashboardSampleImages.patientResources, route: '/profile' },
      ],
    },
    highlights: {
      title: 'Support Notes',
      description: 'Small, calm cards keep this section useful until deeper tools are connected.',
      items: [
        { key: 'one', title: 'Patient-Focused', description: 'This route is tailored to support and resource browsing, not donor actions.', badgeText: 'Role-based', meta: 'Patient tab', icon: 'support' },
        { key: 'two', title: 'Future Care Tools', description: 'New support flows can slot into this route without changing navigation.', badgeText: 'Ready', meta: 'Scalable route', icon: 'shield' },
      ],
    },
  },
  notifications: {
    activeNavKey: 'notifications',
    title: 'Notifications',
    subtitle: 'Keep reminders, support updates, and future patient alerts in one dedicated route.',
    summary: 'This patient notification tab is already connected so alerts can be added without redesigning the app shell.',
    featured: {
      title: 'Notification Center',
      description: 'Swipe through the alert and update surfaces prepared for future patient messaging.',
      items: [
        { key: 'alerts', title: 'Patient Alerts', description: 'Support reminders, request changes, and care updates can appear here.', badgeText: 'Alerts', meta: 'Notification feed', ctaLabel: 'Preview alerts', icon: 'notifications', imageUrl: dashboardSampleImages.patientNotifications },
        { key: 'digest', title: 'Care Summary', description: 'A digest view can summarize request changes and support notes in one place.', badgeText: 'Digest', meta: 'Summary module', ctaLabel: 'Open summary', icon: 'updates', imageUrl: dashboardSampleImages.patientSupport },
      ],
    },
    highlights: {
      title: 'Preview Cards',
      description: 'Reusable cards keep the route useful even before live data is connected.',
      items: [
        { key: 'one', title: 'Real Destination', description: 'This tab is navigable and safe to expand with real patient alerts later.', badgeText: 'Live', meta: 'Working route', icon: 'success' },
        { key: 'two', title: 'Badge Ready', description: 'Badge counts remain config-driven and can become data-driven later.', badgeText: 'Badge', meta: 'Scalable config', icon: 'notifications' },
      ],
    },
  },
};
