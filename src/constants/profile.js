export const profileFieldConfig = [
  {
    key: 'first_name',
    formKey: 'firstName',
    label: 'First Name',
    placeholder: 'Juan',
    editable: true,
    helperText: 'Required.',
  },
  {
    key: 'middle_name',
    formKey: 'middleName',
    label: 'Middle Name',
    placeholder: 'Santos',
    optional: true,
    editable: true,
    helperText: 'Optional.',
  },
  {
    key: 'last_name',
    formKey: 'lastName',
    label: 'Last Name',
    placeholder: 'Dela Cruz',
    editable: true,
    helperText: 'Required.',
  },
  {
    key: 'suffix',
    formKey: 'suffix',
    label: 'Suffix',
    placeholder: 'Jr.',
    optional: true,
    editable: true,
    helperText: 'Optional.',
  },
  {
    key: 'birthdate',
    formKey: 'birthdate',
    label: 'Birthdate',
    placeholder: 'Select birthdate',
    optional: true,
    editable: true,
    helperText: 'Required.',
  },
  {
    key: 'gender',
    formKey: 'gender',
    label: 'Gender',
    placeholder: 'Select gender',
    optional: true,
    editable: true,
    helperText: 'Required.',
  },
  {
    key: 'phone',
    formKey: 'phone',
    label: 'Mobile Number',
    placeholder: '09123456789',
    keyboardType: 'phone-pad',
    editable: true,
    helperText: 'Editable.',
  },
  {
    key: 'street',
    formKey: 'street',
    label: 'Street',
    placeholder: 'Street address',
    optional: true,
    editable: true,
    helperText: 'Editable.',
  },
  {
    key: 'barangay',
    formKey: 'barangay',
    label: 'Barangay',
    placeholder: 'Barangay',
    optional: true,
    editable: true,
    helperText: 'Editable.',
  },
  {
    key: 'region',
    formKey: 'region',
    label: 'Region',
    placeholder: 'Region',
    optional: true,
    editable: true,
    helperText: 'Editable.',
  },
  {
    key: 'city',
    formKey: 'city',
    label: 'City',
    placeholder: 'Quezon City',
    optional: true,
    editable: true,
    helperText: 'Editable.',
  },
  {
    key: 'province',
    formKey: 'province',
    label: 'Province',
    placeholder: 'Metro Manila',
    optional: true,
    editable: true,
    helperText: 'Editable.',
  },
  {
    key: 'country',
    formKey: 'country',
    label: 'Country',
    placeholder: 'Philippines',
    optional: true,
    editable: true,
    helperText: 'Editable.',
  },
];

export const profileGenderOptions = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Prefer not to say', value: 'Prefer not to say' },
];

export const guardianRelationshipOptions = [
  { label: 'Mother', value: 'Mother' },
  { label: 'Father', value: 'Father' },
  { label: 'Aunt', value: 'Aunt' },
  { label: 'Sister', value: 'Sister' },
  { label: 'Brother', value: 'Brother' },
  { label: 'Guardian', value: 'Guardian' },
  { label: 'Other', value: 'Other' },
];

export const profileCompletionFieldLabels = {
  photo_path: 'Photo',
  first_name: 'First name',
  last_name: 'Last name',
  birthdate: 'Birthdate',
  gender: 'Gender',
  contact_number: 'Mobile number',
  street: 'Street',
  barangay: 'Barangay',
  city: 'City',
  province: 'Province',
  region: 'Region',
  country: 'Country',
};

export const profileCompletionSections = [
  {
    key: 'name',
    label: 'Add your name',
    shortLabel: 'Name',
    fields: ['first_name', 'last_name'],
  },
  {
    key: 'details',
    label: 'Add your personal details',
    shortLabel: 'Details',
    fields: ['birthdate', 'gender', 'contact_number'],
  },
  {
    key: 'address',
    label: 'Add your address',
    shortLabel: 'Address',
    fields: ['street', 'barangay', 'city', 'province', 'region', 'country'],
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
    description: 'Complete or update your personal details.',
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
  tentative: 'Pending setup',
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
