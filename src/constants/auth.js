export const roleAuthConfig = {
  donor: {
    label: 'donor',
    signup: {
      title: 'Create your donor account',
      subtitle: 'Start your donor journey, manage preparation steps, and keep every appointment detail in one polished mobile flow.',
      eyebrow: 'Donor signup',
      buttonText: 'Create donor account',
      footerQuestion: 'Already have a donor account?',
      footerLink: 'Log in here',
    },
    login: {
      title: 'Welcome back, donor',
      subtitle: 'Review your giving journey, upcoming steps, and donor activity with a faster mobile sign-in.',
      eyebrow: 'Donor login',
      buttonText: 'Continue as donor',
      footerQuestion: 'Need a donor account?',
      footerLink: 'Sign up here',
    },
    routes: {
      signup: '/donor/signup',
      login: '/donor/login',
      home: '/donor/home',
    },
  },
  patient: {
    label: 'patient',
    signup: {
      title: 'Create your patient account',
      subtitle: 'Create a private patient account to manage support requests, updates, and care resources with confidence.',
      eyebrow: 'Patient signup',
      buttonText: 'Create patient account',
      footerQuestion: 'Already have a patient account?',
      footerLink: 'Log in here',
    },
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to review requests, support progress, and patient account details in one calm mobile experience.',
      eyebrow: 'Patient login',
      buttonText: 'Continue as patient',
      footerQuestion: 'Need a patient account?',
      footerLink: 'Sign up here',
    },
    routes: {
      signup: '/patient/signup',
      login: '/patient/login',
      home: '/patient/home',
    },
  },
};

export const authMessages = {
  signupFailed: 'Please try again.',
  loginFailed: 'Please check your credentials.',
  verifyPromptTitle: 'Email Not Verified',
  verifyPromptBody: 'Please verify your email address before logging in.',
};
