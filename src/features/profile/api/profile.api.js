import { supabase } from '../../../api/supabase/client';

const isUuid = (value) => typeof value === 'string' && value.includes('-');
const buildMissingSystemUserError = () => new Error('The logged-in account is not linked to an app user record.');

const normalizeSystemUser = (row, details = null) => ({
  id: row?.auth_user_id || '',
  user_id: row?.user_id || null,
  auth_user_id: row?.auth_user_id || '',
  email: row?.email || '',
  role: row?.role || '',
  is_active: row?.is_active ?? true,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  first_name: details?.first_name || '',
  middle_name: details?.middle_name || '',
  last_name: details?.last_name || '',
  suffix: details?.suffix || '',
  birthdate: details?.birthdate || null,
  gender: details?.gender || '',
  street: details?.street || '',
  region: details?.region || '',
  barangay: details?.barangay || '',
  city: details?.city || '',
  province: details?.province || '',
  country: details?.country || '',
  phone: details?.contact_number || '',
  contact_number: details?.contact_number || '',
  avatar_url: details?.photo_path || '',
  photo_path: details?.photo_path || '',
  joined_date: details?.joined_date || null,
});

const normalizePatient = (row) => ({
  id: row?.patient_id || null,
  patient_id: row?.patient_id || null,
  user_id: row?.user_id || null,
  hospital_id: row?.hospital_id || null,
  patient_code: row?.patient_code || '',
  first_name: row?.first_name || '',
  middle_name: row?.middle_name || '',
  last_name: row?.last_name || '',
  suffix: row?.suffix || '',
  age: row?.age ?? null,
  gender: row?.gender || '',
  medical_condition: row?.medical_condition || '',
  patient_picture: row?.patient_picture || '',
  medical_document: row?.medical_document || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
});

const normalizeHospitalStaff = (row) => ({
  id: row?.link_id || null,
  link_id: row?.link_id || null,
  hospital_id: row?.hospital_id || null,
  user_id: row?.user_id || null,
  assigned_date: row?.assigned_date || null,
});

const normalizePatientLinkPreview = (row) => ({
  id: row?.patient_id || null,
  patient_id: row?.patient_id || null,
  patient_code: row?.patient_code || '',
  hospital_id: row?.hospital_id || null,
  first_name: row?.first_name || '',
  middle_name: row?.middle_name || '',
  last_name: row?.last_name || '',
  suffix: row?.suffix || '',
  age: row?.age ?? null,
  gender: row?.gender || '',
  medical_condition: row?.medical_condition || '',
  patient_picture: row?.patient_picture || '',
  user_id: row?.user_id || null,
});

const getCurrentAuthMetadata = async () => {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
};

export const fetchSystemUserByAuthUserId = async (authUserId) => {
  return await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
};

export const createSystemUser = async ({ authUserId, email, role }) => {
  return await supabase
    .from('users')
    .insert([{
      auth_user_id: authUserId,
      email: email || null,
      role: role || null,
      is_active: true,
    }])
    .select()
    .single();
};

export const ensureSystemUserByAuthUserId = async (authUserId) => {
  if (!authUserId) {
    return { data: null, error: new Error('Auth user ID is required.') };
  }

  const existing = await fetchSystemUserByAuthUserId(authUserId);
  if (existing.data?.user_id) {
    return existing;
  }

  if (existing.error) {
    return existing;
  }

  const authUser = await getCurrentAuthMetadata();
  const createResult = await createSystemUser({
    authUserId,
    email: authUser?.email || null,
    role: authUser?.user_metadata?.role || null,
  });

  if (!createResult.error) {
    return createResult;
  }

  const createErrorMessage = String(createResult.error?.message || '').toLowerCase();
  if (createErrorMessage.includes('duplicate') || createErrorMessage.includes('already exists')) {
    return await fetchSystemUserByAuthUserId(authUserId);
  }

  return createResult;
};

export const fetchUserDetailsBySystemUserId = async (systemUserId) => {
  return await supabase
    .from('user_details')
    .select('*')
    .eq('user_id', systemUserId)
    .maybeSingle();
};

export const ensureUserDetailsBySystemUserId = async (systemUser) => {
  if (!systemUser?.user_id) {
    return { data: null, error: new Error('System user is required.') };
  }

  const existing = await fetchUserDetailsBySystemUserId(systemUser.user_id);
  if (existing.data?.user_details_id) {
    return existing;
  }

  if (existing.error) {
    return existing;
  }

  const authUser = await getCurrentAuthMetadata();
  const metadata = authUser?.user_metadata || {};
  const createResult = await supabase
    .from('user_details')
    .insert([{
      user_id: systemUser.user_id,
      first_name: metadata.first_name || '',
      middle_name: metadata.middle_name || '',
      last_name: metadata.last_name || '',
      suffix: metadata.suffix || '',
      birthdate: metadata.birthdate || null,
      gender: metadata.gender || '',
      contact_number: metadata.phone || '',
      street: metadata.street || '',
      barangay: metadata.barangay || '',
      city: metadata.city || '',
      province: metadata.province || '',
      region: metadata.region || '',
      country: metadata.country || 'Philippines',
      joined_date: metadata.joined_date || new Date().toISOString().slice(0, 10),
    }])
    .select()
    .single();

  if (!createResult.error) {
    return createResult;
  }

  const createErrorMessage = String(createResult.error?.message || '').toLowerCase();
  if (createErrorMessage.includes('duplicate') || createErrorMessage.includes('already exists')) {
    return await fetchUserDetailsBySystemUserId(systemUser.user_id);
  }

  return createResult;
};

export const resolveSystemUser = async (userIdentifier, options = {}) => {
  const { ensure = true } = options;

  if (!userIdentifier && userIdentifier !== 0) {
    return { data: null, error: new Error('User ID is required.') };
  }

  if (!isUuid(userIdentifier)) {
    const result = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userIdentifier)
      .maybeSingle();

    if (!result.data && !result.error) {
      return { data: null, error: buildMissingSystemUserError() };
    }

    return result;
  }

  if (ensure) {
    return await ensureSystemUserByAuthUserId(userIdentifier);
  }

  const result = await fetchSystemUserByAuthUserId(userIdentifier);
  if (!result.data && !result.error) {
    return { data: null, error: buildMissingSystemUserError() };
  }

  return result;
};

export const resolveDatabaseUserId = async (userIdentifier, options = {}) => {
  const systemUserResult = await resolveSystemUser(userIdentifier, options);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return {
      data: null,
      error: systemUserResult.error || buildMissingSystemUserError(),
    };
  }

  return {
    data: systemUserResult.data.user_id,
    error: null,
  };
};

export const fetchProfileById = async (authUserId) => {
  const systemUserResult = await ensureSystemUserByAuthUserId(authUserId);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const userDetailsResult = await ensureUserDetailsBySystemUserId(systemUserResult.data);
  if (userDetailsResult.error && userDetailsResult.error.code !== 'PGRST116') {
    return { data: null, error: userDetailsResult.error };
  }

  return {
    data: normalizeSystemUser(systemUserResult.data, userDetailsResult.data),
    error: null,
  };
};

export const updateProfile = async (authUserId, updates) => {
  const systemUserResult = await ensureSystemUserByAuthUserId(authUserId);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  await ensureUserDetailsBySystemUserId(systemUserResult.data);

  const payload = {
    first_name: updates.first_name ?? undefined,
    middle_name: updates.middle_name ?? undefined,
    last_name: updates.last_name ?? undefined,
    suffix: updates.suffix ?? undefined,
    birthdate: updates.birthdate ?? undefined,
    gender: updates.gender ?? undefined,
    contact_number: updates.phone ?? updates.contact_number ?? undefined,
    city: updates.city ?? undefined,
    province: updates.province ?? undefined,
    street: updates.street ?? undefined,
    barangay: updates.barangay ?? undefined,
    region: updates.region ?? undefined,
    country: updates.country ?? undefined,
    joined_date: updates.joined_date ?? undefined,
    photo_path: updates.avatar_url ?? updates.photo_path ?? undefined,
    updated_at: new Date().toISOString(),
  };

  const filteredPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  const result = await supabase
    .from('user_details')
    .update(filteredPayload)
    .eq('user_id', systemUserResult.data.user_id)
    .select()
    .maybeSingle();

  if (result.error) {
    return result;
  }

  return {
    data: normalizeSystemUser(systemUserResult.data, result.data),
    error: null,
  };
};

export const fetchDonorProfileByUserId = async (userId) => {
  const profileResult = await fetchProfileById(userId);
  return {
    data: profileResult.data,
    error: profileResult.error,
  };
};

export const updateDonorProfile = async (userId, updates) => (
  await updateProfile(userId, updates)
);

export const fetchPatientDetailsByUserId = async (userIdentifier) => {
  const systemUserResult = await resolveSystemUser(userIdentifier, { ensure: false });
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const result = await supabase
    .from('patients')
    .select('*')
    .eq('user_id', systemUserResult.data.user_id)
    .maybeSingle();

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const fetchHospitalStaffByUserId = async (userIdentifier) => {
  const systemUserResult = await resolveSystemUser(userIdentifier, { ensure: false });
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const result = await supabase
    .from('hospital_staff')
    .select('*')
    .eq('user_id', systemUserResult.data.user_id)
    .maybeSingle();

  return {
    data: result.data ? normalizeHospitalStaff(result.data) : null,
    error: result.error,
  };
};

export const fetchPatientDetailsByCode = async (patientCode) => {
  const normalizedCode = patientCode?.trim()?.toUpperCase();
  if (!normalizedCode) {
    return { data: null, error: new Error('Patient code is required.') };
  }

  const result = await supabase
    .from('patients')
    .select('*')
    .ilike('patient_code', normalizedCode)
    .maybeSingle();

  return {
    data: result.data ? normalizePatientLinkPreview(result.data) : null,
    error: result.error,
  };
};

export const createPatientDetails = async (payload) => {
  const systemUserResult = await resolveSystemUser(payload?.user_id);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const profileResult = await fetchProfileById(systemUserResult.data.auth_user_id);
  const profile = profileResult.data;

  const result = await supabase
    .from('patients')
    .insert([{
      user_id: systemUserResult.data.user_id,
      hospital_id: payload?.hospital_id || null,
      first_name: payload?.first_name || profile?.first_name || '',
      middle_name: payload?.middle_name || profile?.middle_name || '',
      last_name: payload?.last_name || profile?.last_name || '',
      suffix: payload?.suffix || profile?.suffix || '',
      age: payload?.age ?? null,
      gender: payload?.gender || profile?.gender || '',
      patient_picture: payload?.patient_picture || profile?.photo_path || null,
      medical_condition: payload?.medical_condition || null,
      medical_document: payload?.medical_document || null,
    }])
    .select()
    .single();

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const updatePatientPictureByPatientId = async (patientId, patientPicture) => {
  const result = await supabase
    .from('patients')
    .update({
      patient_picture: patientPicture,
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', patientId)
    .select()
    .single();

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const updatePatientDetails = async (userIdentifier, updates) => {
  const patientResult = await fetchPatientDetailsByUserId(userIdentifier);
  if (patientResult.error) {
    return { data: null, error: patientResult.error };
  }

  if (!patientResult.data?.patient_id) {
    const createResult = await createPatientDetails({
      user_id: userIdentifier,
      ...updates,
    });
    if (createResult.error) {
      return createResult;
    }
  }

  const refreshedPatient = await fetchPatientDetailsByUserId(userIdentifier);
  if (refreshedPatient.error || !refreshedPatient.data?.patient_id) {
    return { data: null, error: refreshedPatient.error || new Error('Patient record is not available.') };
  }

  const result = await supabase
    .from('patients')
    .update({
      hospital_id: updates.hospital_id ?? undefined,
      first_name: updates.first_name ?? undefined,
      middle_name: updates.middle_name ?? undefined,
      last_name: updates.last_name ?? undefined,
      suffix: updates.suffix ?? undefined,
      age: updates.age ?? undefined,
      gender: updates.gender ?? undefined,
      medical_condition: updates.medical_condition ?? undefined,
      patient_picture: updates.patient_picture ?? updates.avatar_url ?? undefined,
      medical_document: updates.medical_document ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', refreshedPatient.data.patient_id)
    .select()
    .single();

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const linkPatientDetailsToUserByCode = async ({
  userIdentifier,
  patientCode,
  patientPicture,
}) => {
  const systemUserResult = await resolveSystemUser(userIdentifier);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const patientResult = await fetchPatientDetailsByCode(patientCode);
  if (patientResult.error || !patientResult.data?.patient_id) {
    return { data: null, error: patientResult.error || new Error('Patient record was not found.') };
  }

  if (patientResult.data.user_id && patientResult.data.user_id !== systemUserResult.data.user_id) {
    return { data: null, error: new Error('This patient code is already linked to another account.') };
  }

  const updates = {
    user_id: systemUserResult.data.user_id,
    updated_at: new Date().toISOString(),
  };

  if (patientPicture) {
    updates.patient_picture = patientPicture;
  }

  const result = await supabase
    .from('patients')
    .update(updates)
    .eq('patient_id', patientResult.data.patient_id)
    .select()
    .single();

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};
