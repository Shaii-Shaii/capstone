export const roleAuthConfig = {
  signup: {
    label: 'signup',
    signup: {
      title: 'Create account',
      subtitle: '',
      eyebrow: '',
      buttonText: 'Create account',
      footerQuestion: 'Already have an account?',
      footerLink: 'Log in',
    },
    routes: {
      signup: '/auth/signup',
      login: '/auth/access',
      landing: '/',
    },
  },
  access: {
    label: 'account',
    login: {
      title: 'Log in',
      subtitle: '',
      eyebrow: '',
      buttonText: 'Log in',
      footerQuestion: 'Need a new account?',
      footerLink: 'Sign up',
    },
    routes: {
      login: '/auth/access',
      signup: '/auth/signup',
      landing: '/',
    },
  },
  donor: {
    label: 'donor',
    signup: {
      title: 'Create your donor account',
      subtitle: 'Start your donor journey, manage preparation steps, and keep every appointment detail in one calm mobile flow built for giving.',
      eyebrow: 'Donor signup',
      buttonText: 'Create donor account',
      footerQuestion: 'Already have an account?',
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
      signup: '/auth/signup',
      login: '/donor/login',
      home: '/donor/home',
    },
  },
  patient: {
    label: 'patient',
    signup: {
      title: 'Create your patient account',
      subtitle: 'Create a private patient account to manage support requests, updates, and care resources with clarity and care.',
      eyebrow: 'Patient signup',
      buttonText: 'Create patient account',
      footerQuestion: 'Already have an account?',
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
      signup: '/auth/signup',
      login: '/patient/login',
      home: '/patient/home',
    },
  },
};

export const getHomeRouteForRole = (role) => roleAuthConfig[role]?.routes?.home || '/';

export const authMessages = {
  signupFailed: 'Please try again.',
  loginFailed: 'Something went wrong. Please try again.',
  roleNotFound: 'We could not find your account details.',
  verifyPromptTitle: 'Email Not Verified',
  verifyPromptBody: 'Please verify your email address before logging in.',
};
