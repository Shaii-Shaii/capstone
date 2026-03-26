export const profileFieldConfig = [
  {
    key: 'first_name',
    formKey: 'firstName',
    label: 'First Name',
    placeholder: 'Juan',
    helperText: 'Use the name you want shown in your account.',
  },
  {
    key: 'middle_name',
    formKey: 'middleName',
    label: 'Middle Name',
    placeholder: 'Santos',
    optional: true,
  },
  {
    key: 'last_name',
    formKey: 'lastName',
    label: 'Last Name',
    placeholder: 'Dela Cruz',
  },
  {
    key: 'phone',
    formKey: 'phone',
    label: 'Mobile Number',
    placeholder: '09123456789',
    keyboardType: 'phone-pad',
  },
  {
    key: 'city',
    formKey: 'city',
    label: 'City',
    placeholder: 'Quezon City',
    optional: true,
  },
  {
    key: 'province',
    formKey: 'province',
    label: 'Province',
    placeholder: 'Metro Manila',
    optional: true,
  },
];

export const passwordFieldConfig = [
  {
    key: 'currentPassword',
    label: 'Current Password',
    placeholder: 'Enter your current password',
    helperText: 'Used for confidence now and ready for Supabase reauthentication if required later.',
  },
  {
    key: 'newPassword',
    label: 'New Password',
    placeholder: 'Create a strong new password',
    helperText: 'Use at least 8 characters with uppercase, lowercase, and numbers.',
  },
  {
    key: 'confirmPassword',
    label: 'Confirm New Password',
    placeholder: 'Retype your new password',
  },
];

export const profileActionConfig = [
  {
    key: 'edit',
    icon: 'editProfile',
    title: 'Edit Profile',
    description: 'Update your name, contact details, and location information.',
  },
  {
    key: 'password',
    icon: 'changePassword',
    title: 'Change Password',
    description: 'Keep your account secure by setting a new password.',
  },
];

export const roleLabelMap = {
  donor: 'Donor',
  patient: 'Patient',
};

export const profileDisplayFields = [
  { key: 'phone', label: 'Phone', icon: 'phone' },
  { key: 'city', label: 'City', icon: 'city' },
  { key: 'province', label: 'Province', icon: 'province' },
];
