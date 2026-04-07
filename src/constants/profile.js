export const profileFieldConfig = [
  {
    key: 'first_name',
    formKey: 'firstName',
    label: 'First Name',
    placeholder: 'Juan',
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
    key: 'suffix',
    formKey: 'suffix',
    label: 'Suffix',
    placeholder: 'Jr.',
    optional: true,
  },
  {
    key: 'birthdate',
    formKey: 'birthdate',
    label: 'Birthdate',
    placeholder: 'YYYY-MM-DD',
    optional: true,
  },
  {
    key: 'gender',
    formKey: 'gender',
    label: 'Gender',
    placeholder: 'Female',
    optional: true,
  },
  {
    key: 'phone',
    formKey: 'phone',
    label: 'Mobile Number',
    placeholder: '09123456789',
    keyboardType: 'phone-pad',
  },
  {
    key: 'street',
    formKey: 'street',
    label: 'Street',
    placeholder: 'Street address',
    optional: true,
  },
  {
    key: 'barangay',
    formKey: 'barangay',
    label: 'Barangay',
    placeholder: 'Barangay',
    optional: true,
  },
  {
    key: 'region',
    formKey: 'region',
    label: 'Region',
    placeholder: 'Region',
    optional: true,
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
  {
    key: 'country',
    formKey: 'country',
    label: 'Country',
    placeholder: 'Philippines',
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
  { key: 'first_name', label: 'First name', icon: 'profile' },
  { key: 'middle_name', label: 'Middle name', icon: 'profile' },
  { key: 'last_name', label: 'Last name', icon: 'profile' },
  { key: 'suffix', label: 'Suffix', icon: 'profile' },
  { key: 'birthdate', label: 'Birthdate', icon: 'profile' },
  { key: 'gender', label: 'Gender', icon: 'profile' },
  { key: 'phone', label: 'Phone', icon: 'phone' },
  { key: 'street', label: 'Street', icon: 'profile' },
  { key: 'barangay', label: 'Barangay', icon: 'profile' },
  { key: 'region', label: 'Region', icon: 'profile' },
  { key: 'city', label: 'City', icon: 'city' },
  { key: 'province', label: 'Province', icon: 'province' },
  { key: 'country', label: 'Country', icon: 'profile' },
  { key: 'joined_date', label: 'Joined date', icon: 'profile' },
];
