import { supabase } from '../api/supabase/client';
import { hairSubmissionStorageBucket } from './hairSubmission.constants';
import { resolveDatabaseUserId } from './profile/api/profile.api';
import { logAppError, logAppEvent } from '../utils/appErrors';

const hairSubmissionsTable = 'Hair_Submissions';
const hairSubmissionDetailsTable = 'Hair_Submission_Details';
const hairSubmissionImagesTable = 'Hair_Submission_Images';
const hairSubmissionLogisticsTable = 'Hair_Submission_Logistics';
const hairBundleTrackingHistoryTable = 'Hair_Bundle_Tracking_History';
const aiScreeningsTable = 'AI_Screenings';
const donorRecommendationsTable = 'Donor_Recommendations';
const donationRequirementsTable = 'Donation_Requirements';
const logisticsSettingsTable = 'Logistics_Settings';
const donationCertificatesTable = 'Donation_Certificates';

const hairSubmissionSelect = `
  submission_id:Submission_ID,
  user_id:User_ID,
  donation_drive_id:Donation_Drive_ID,
  submission_code:Submission_Code,
  donation_source:Donation_Source,
  donor_notes:Donor_Notes,
  status:Status,
  bundle_id:Bundle_ID,
  created_at:Created_At,
  updated_at:Updated_At
`;

const hairSubmissionDetailSelect = `
  submission_detail_id:Submission_Detail_ID,
  submission_id:Submission_ID,
  declared_length:Declared_Length,
  declared_color:Declared_Color,
  declared_texture:Declared_Texture,
  declared_density:Declared_Density,
  declared_condition:Declared_Condition,
  is_chemically_treated:Is_Chemically_Treated,
  is_colored:Is_Colored,
  is_bleached:Is_Bleached,
  is_rebonded:Is_Rebonded,
  detail_notes:Detail_Notes,
  status:Status,
  created_at:Created_At,
  updated_at:Updated_At
`;

const hairSubmissionImageSelect = `
  image_id:Image_ID,
  submission_detail_id:Submission_Detail_ID,
  file_path:File_Path,
  image_type:Image_Type,
  uploaded_at:Uploaded_At
`;

const aiScreeningSelect = `
  ai_screening_id:AI_Screening_ID,
  submission_id:Submission_ID,
  estimated_length:Estimated_Length,
  detected_color:Detected_Color,
  detected_texture:Detected_Texture,
  detected_density:Detected_Density,
  detected_condition:Detected_Condition,
  visible_damage_notes:Visible_Damage_Notes,
  confidence_score:Confidence_Score,
  shine_level:Shine_Level,
  frizz_level:Frizz_Level,
  dryness_level:Dryness_Level,
  oiliness_level:Oiliness_Level,
  damage_level:Damage_Level,
  decision:Decision,
  summary:Summary,
  created_at:Created_At
`;

const donorRecommendationSelect = `
  recommendation_id:Recommendation_ID,
  submission_id:Submission_ID,
  title:Title,
  recommendation_text:Recommendation_Text,
  priority_order:Priority_Order,
  created_at:Created_At
`;

const donationRequirementSelect = `
  donation_requirement_id:Donation_Requirement_ID,
  minimum_number_donor:Minimum_Number_Donor,
  minimum_hair_length:Minimum_Hair_Length,
  chemical_treatment_status:Chemical_Treatment_Status,
  colored_hair_status:Colored_Hair_Status,
  bleached_hair_status:Bleached_Hair_Status,
  rebonded_hair_status:Rebonded_Hair_Status,
  hair_texture_status:Hair_Texture_Status,
  notes:Notes,
  updated_at:Updated_At,
  updated_by:Updated_By
`;

const hairSubmissionLogisticsSelect = `
  submission_logistics_id:Submission_Logistics_ID,
  submission_id:Submission_ID,
  logistics_type:Logistics_Type,
  courier_name:Courier_Name,
  tracking_number:Tracking_Number,
  shipment_status:Shipment_Status,
  pickup_scheduled_at:Pickup_Scheduled_At,
  pickup_schedule_date:Pickup_Schedule_Date,
  pickup_approved_at:Pickup_Approved_At,
  received_by:Received_By,
  received_at:Received_At,
  notes:Notes,
  created_at:Created_At
`;

const trackingEntrySelect = `
  tracking_id:Tracking_ID,
  submission_id:Submission_ID,
  submission_detail_id:Submission_Detail_ID,
  status:Status,
  title:Title,
  description:Description,
  changed_by:Changed_By,
  updated_at:Updated_At
`;

const logisticsSettingsSelect = `
  logistics_settings_id:Logistics_Settings_ID,
  destination_name:Destination_Name,
  street:Street,
  region:Region,
  barangay:Barangay,
  city:City,
  province:Province,
  country:Country,
  contact_person:Contact_Person,
  contact_number:Contact_Number,
  longitude:Longitude,
  latitude:Latitude,
  updated_at:Updated_At
`;

const donationCertificateSelect = `
  certificate_id:Certificate_ID,
  user_id:User_ID,
  certificate_number:Certificate_Number,
  certificate_type:Certificate_Type,
  file_url:File_URL,
  issued_by:Issued_By,
  issued_at:Issued_At,
  remarks:Remarks,
  submission_id:Submission_ID
`;

const logHairQuery = (source, extras = {}) => {
  logAppEvent('hair_submission.query', 'Hair submission query started.', {
    source,
    ...extras,
  });
};

const getPhilippineDatabaseTimestamp = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

const normalizeSubmissionUserId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const resolveSubmissionUserId = async (userId, databaseUserId = null) => {
  const explicitDatabaseUserId = normalizeSubmissionUserId(databaseUserId);
  if (explicitDatabaseUserId) {
    return {
      userId: explicitDatabaseUserId,
      error: null,
    };
  }

  const directUserId = normalizeSubmissionUserId(userId);
  if (directUserId) {
    return {
      userId: directUserId,
      error: null,
    };
  }

  const result = await resolveDatabaseUserId(userId, { ensure: false });
  if (result.error || !result.data) {
    return {
      userId: null,
      error: result.error || new Error('The logged-in account is not linked to a donor record.'),
    };
  }

  return {
    userId: result.data,
    error: null,
  };
};

const normalizeAiScreening = (row) => ({
  id: row?.ai_screening_id || null,
  ai_screening_id: row?.ai_screening_id || null,
  submission_id: row?.submission_id || null,
  estimated_length: row?.estimated_length ?? null,
  detected_color: row?.detected_color || '',
  detected_texture: row?.detected_texture || '',
  detected_density: row?.detected_density || '',
  detected_condition: row?.detected_condition || '',
  visible_damage_notes: row?.visible_damage_notes || '',
  confidence_score: row?.confidence_score ?? null,
  shine_level: row?.shine_level ?? null,
  frizz_level: row?.frizz_level ?? null,
  dryness_level: row?.dryness_level ?? null,
  oiliness_level: row?.oiliness_level ?? null,
  damage_level: row?.damage_level ?? null,
  decision: row?.decision || '',
  summary: row?.summary || '',
  created_at: row?.created_at || null,
});

const normalizeDonorRecommendation = (row) => ({
  id: row?.recommendation_id || null,
  recommendation_id: row?.recommendation_id || null,
  submission_id: row?.submission_id || null,
  title: row?.title || '',
  recommendation_text: row?.recommendation_text || '',
  priority_order: row?.priority_order ?? null,
  created_at: row?.created_at || null,
});

const normalizeHairSubmission = (row) => ({
  id: row?.submission_id || null,
  submission_id: row?.submission_id || null,
  user_id: row?.user_id || null,
  donation_drive_id: row?.donation_drive_id || null,
  submission_code: row?.submission_code || '',
  donation_source: row?.donation_source || '',
  donor_notes: row?.donor_notes || '',
  bundle_id: row?.bundle_id || null,
  status: row?.status || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  ai_screenings: Array.isArray(row?.ai_screenings)
    ? row.ai_screenings.map(normalizeAiScreening)
    : row?.ai_screenings
      ? normalizeAiScreening(row.ai_screenings)
      : [],
  donor_recommendations: Array.isArray(row?.donor_recommendations)
    ? row.donor_recommendations.map(normalizeDonorRecommendation)
    : [],
  submission_details: Array.isArray(row?.submission_details)
    ? row.submission_details.map(normalizeHairSubmissionDetail)
    : [],
});

const normalizeHairSubmissionDetail = (row) => ({
  id: row?.submission_detail_id || null,
  submission_detail_id: row?.submission_detail_id || null,
  submission_id: row?.submission_id || null,
  declared_length: row?.declared_length ?? null,
  declared_color: row?.declared_color || '',
  declared_texture: row?.declared_texture || '',
  declared_density: row?.declared_density || '',
  declared_condition: row?.declared_condition || '',
  is_chemically_treated: Boolean(row?.is_chemically_treated),
  is_colored: Boolean(row?.is_colored),
  is_bleached: Boolean(row?.is_bleached),
  is_rebonded: Boolean(row?.is_rebonded),
  detail_notes: row?.detail_notes || '',
  status: row?.status || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || row?.created_at || null,
  images: Array.isArray(row?.images) ? row.images.map(normalizeHairSubmissionImage) : [],
});

const normalizeHairSubmissionImage = (row) => ({
  id: row?.image_id || null,
  image_id: row?.image_id || null,
  submission_detail_id: row?.submission_detail_id || null,
  file_path: row?.file_path || '',
  image_type: row?.image_type || '',
  uploaded_at: row?.uploaded_at || null,
});

const normalizeHairSubmissionLogistics = (row) => ({
  id: row?.submission_logistics_id || null,
  submission_logistics_id: row?.submission_logistics_id || null,
  submission_id: row?.submission_id || null,
  logistics_type: row?.logistics_type || '',
  courier_name: row?.courier_name || '',
  tracking_number: row?.tracking_number || '',
  shipment_status: row?.shipment_status || '',
  pickup_schedule_at: row?.pickup_scheduled_at || row?.pickup_schedule_at || null,
  pickup_schedule_date: row?.pickup_schedule_date || null,
  pickup_approved_at: row?.pickup_approved_at || null,
  received_by: row?.received_by || null,
  received_at: row?.received_at || null,
  notes: row?.notes || '',
  created_at: row?.created_at || null,
  updated_at: row?.received_at || row?.pickup_approved_at || row?.pickup_scheduled_at || row?.created_at || null,
});

const normalizeTrackingEntry = (row) => ({
  id: row?.tracking_id || null,
  tracking_id: row?.tracking_id || null,
  submission_id: row?.submission_id || null,
  submission_detail_id: row?.submission_detail_id || null,
  status: row?.status || '',
  title: row?.title || '',
  description: row?.description || '',
  changed_by: row?.changed_by || null,
  updated_at: row?.updated_at || null,
});

const normalizeDonationRequirement = (row) => ({
  id: row?.donation_requirement_id || null,
  donation_requirement_id: row?.donation_requirement_id || null,
  minimum_number_donor: row?.minimum_number_donor ?? null,
  minimum_hair_length: row?.minimum_hair_length ?? null,
  chemical_treatment_status: row?.chemical_treatment_status ?? null,
  colored_hair_status: row?.colored_hair_status ?? null,
  bleached_hair_status: row?.bleached_hair_status ?? null,
  rebonded_hair_status: row?.rebonded_hair_status ?? null,
  hair_texture_status: row?.hair_texture_status || '',
  notes: row?.notes || '',
  updated_at: row?.updated_at || null,
  updated_by: row?.updated_by || null,
});

const normalizeLogisticsSettings = (row) => ({
  id: row?.logistics_settings_id || null,
  logistics_settings_id: row?.logistics_settings_id || null,
  destination_name: row?.destination_name || '',
  street: row?.street || '',
  region: row?.region || '',
  barangay: row?.barangay || '',
  city: row?.city || '',
  province: row?.province || '',
  country: row?.country || '',
  contact_person: row?.contact_person || '',
  contact_number: row?.contact_number || '',
  longitude: row?.longitude ?? null,
  latitude: row?.latitude ?? null,
  updated_at: row?.updated_at || null,
});

const normalizeDonationCertificate = (row) => ({
  id: row?.certificate_id || null,
  certificate_id: row?.certificate_id || null,
  user_id: row?.user_id || null,
  certificate_number: row?.certificate_number || '',
  certificate_type: row?.certificate_type || '',
  file_url: row?.file_url || '',
  issued_by: row?.issued_by || null,
  issued_at: row?.issued_at || null,
  remarks: row?.remarks || '',
  submission_id: row?.submission_id || null,
});

export const createHairSubmission = async (payload) => {
  const { userId, error } = await resolveSubmissionUserId(payload?.user_id, payload?.database_user_id);
  if (error) {
    return { data: null, error };
  }

  logAppEvent('hair_submission.query', 'Numeric donor user id resolved for submission create.', {
    authUserId: payload?.user_id || null,
    databaseUserId: payload?.database_user_id || null,
    resolvedUserId: userId,
  });

  logHairQuery('createHairSubmission', {
    table: hairSubmissionsTable,
    phase: 'create',
    userId,
    columns: ['User_ID', 'Donation_Drive_ID', 'Submission_Code', 'Donation_Source', 'Donor_Notes', 'Status'],
  });

  const insertPayload = {
    User_ID: userId,
    Donation_Drive_ID: payload?.donation_drive_id || null,
    Submission_Code: payload?.submission_code || null,
    Donation_Source: payload?.donation_source || null,
    Donor_Notes: payload?.donor_notes || null,
    Status: payload?.status || null,
    Created_At: getPhilippineDatabaseTimestamp(),
    Updated_At: getPhilippineDatabaseTimestamp(),
  };

  const result = await supabase
    .from(hairSubmissionsTable)
    .insert([insertPayload])
    .select(hairSubmissionSelect)
    .single();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionDetail = async (payload) => {
  logHairQuery('createHairSubmissionDetail', {
    table: hairSubmissionDetailsTable,
    phase: 'create',
    filters: { Submission_ID: payload?.submission_id },
    columns: ['Submission_ID', 'Declared_Length', 'Declared_Texture', 'Declared_Density', 'Declared_Condition', 'Detail_Notes', 'Status'],
  });

  const result = await supabase
    .from(hairSubmissionDetailsTable)
    .insert([{
      Submission_ID: payload?.submission_id || null,
      Declared_Length: payload?.declared_length ?? null,
      Declared_Color: payload?.declared_color || null,
      Declared_Texture: payload?.declared_texture || null,
      Declared_Density: payload?.declared_density || null,
      Declared_Condition: payload?.declared_condition || null,
      Is_Chemically_Treated: payload?.is_chemically_treated ?? false,
      Is_Colored: payload?.is_colored ?? false,
      Is_Bleached: payload?.is_bleached ?? false,
      Is_Rebonded: payload?.is_rebonded ?? false,
      Detail_Notes: payload?.detail_notes || null,
      Status: payload?.status || null,
      Created_At: getPhilippineDatabaseTimestamp(),
      Updated_At: getPhilippineDatabaseTimestamp(),
    }])
    .select(hairSubmissionDetailSelect)
    .single();

  return {
    data: result.data ? normalizeHairSubmissionDetail(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionImages = async (rows) => {
  const insertRows = rows.map((row) => ({
    Submission_Detail_ID: row?.submission_detail_id || null,
    File_Path: row?.file_path || null,
    Image_Type: row?.image_type || null,
    Uploaded_At: getPhilippineDatabaseTimestamp(),
  }));

  logHairQuery('createHairSubmissionImages', {
    table: hairSubmissionImagesTable,
    phase: 'create',
    rowCount: insertRows.length,
    columns: ['Submission_Detail_ID', 'File_Path', 'Image_Type'],
  });

  return await supabase
    .from(hairSubmissionImagesTable)
    .insert(insertRows)
    .select(hairSubmissionImageSelect);
};

export const createAiScreening = async (payload) => {
  logHairQuery('createAiScreening', {
    table: aiScreeningsTable,
    phase: 'create',
    filters: { Submission_ID: payload?.submission_id },
    columns: ['Submission_ID', 'Estimated_Length', 'Detected_Color', 'Detected_Texture', 'Detected_Density', 'Detected_Condition', 'Visible_Damage_Notes', 'Confidence_Score', 'Shine_Level', 'Frizz_Level', 'Dryness_Level', 'Oiliness_Level', 'Damage_Level', 'Decision', 'Summary'],
  });

  const result = await supabase
    .from(aiScreeningsTable)
    .insert([{
      Submission_ID: payload?.submission_id || null,
      Estimated_Length: payload?.estimated_length ?? null,
      Detected_Color: payload?.detected_color || null,
      Detected_Texture: payload?.detected_texture || null,
      Detected_Density: payload?.detected_density || null,
      Detected_Condition: payload?.detected_condition || null,
      Visible_Damage_Notes: payload?.visible_damage_notes || null,
      Confidence_Score: payload?.confidence_score ?? null,
      Shine_Level: payload?.shine_level ?? null,
      Frizz_Level: payload?.frizz_level ?? null,
      Dryness_Level: payload?.dryness_level ?? null,
      Oiliness_Level: payload?.oiliness_level ?? null,
      Damage_Level: payload?.damage_level ?? null,
      Decision: payload?.decision || null,
      Summary: payload?.summary || null,
      Created_At: getPhilippineDatabaseTimestamp(),
    }])
    .select(aiScreeningSelect)
    .single();

  return {
    data: result.data ? normalizeAiScreening(result.data) : null,
    error: result.error,
  };
};

export const createDonorRecommendations = async (rows) => {
  const insertRows = rows.map((row) => ({
    Submission_ID: row?.submission_id || null,
    Title: row?.title || null,
    Recommendation_Text: row?.recommendation_text || null,
    Priority_Order: row?.priority_order ?? null,
    Created_At: getPhilippineDatabaseTimestamp(),
  }));

  logHairQuery('createDonorRecommendations', {
    table: donorRecommendationsTable,
    phase: 'create',
    rowCount: insertRows.length,
    columns: ['Submission_ID', 'Title', 'Recommendation_Text', 'Priority_Order'],
  });

  const result = await supabase
    .from(donorRecommendationsTable)
    .insert(insertRows)
    .select(donorRecommendationSelect);

  return {
    data: (result.data || []).map(normalizeDonorRecommendation),
    error: result.error,
  };
};

export const fetchLatestDonationRequirement = async () => {
  logHairQuery('fetchLatestDonationRequirement', {
    table: donationRequirementsTable,
    phase: 'read',
    columns: [
      'Donation_Requirement_ID',
      'Minimum_Number_Donor',
      'Minimum_Hair_Length',
      'Chemical_Treatment_Status',
      'Colored_Hair_Status',
      'Bleached_Hair_Status',
      'Rebonded_Hair_Status',
      'Hair_Texture_Status',
      'Notes',
      'Updated_At',
      'Updated_By',
    ],
  });

  const result = await supabase
    .from(donationRequirementsTable)
    .select(donationRequirementSelect)
    .order('Updated_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeDonationRequirement(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestLogisticsSettings = async () => {
  logHairQuery('fetchLatestLogisticsSettings', {
    table: logisticsSettingsTable,
    phase: 'read',
    columns: [
      'Logistics_Settings_ID',
      'Destination_Name',
      'Street',
      'Region',
      'Barangay',
      'City',
      'Province',
      'Country',
      'Contact_Person',
      'Contact_Number',
      'Longitude',
      'Latitude',
      'Updated_At',
    ],
  });

  const result = await supabase
    .from(logisticsSettingsTable)
    .select(logisticsSettingsSelect)
    .order('Updated_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeLogisticsSettings(result.data) : null,
    error: result.error,
  };
};

export const fetchUpcomingHaircutSchedules = async (limit = 3) => {
  logHairQuery('fetchUpcomingHaircutSchedules', {
    table: null,
    phase: 'read',
    columns: [],
    skipped: 'Haircut_Schedules is not present in the provided schema.',
    limit,
  });

  return { data: [], error: null };
};

export const fetchLatestHaircutReservationByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  logHairQuery('fetchLatestHaircutReservationByUserId', {
    table: null,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: [],
    skipped: 'Haircut_Reservations is not present in the provided schema.',
  });

  return { data: null, error: null };
};

export const fetchLatestDonationCertificateByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  logHairQuery('fetchLatestDonationCertificateByUserId', {
    table: donationCertificatesTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Certificate_ID', 'User_ID', 'Certificate_Number', 'Certificate_Type', 'File_URL', 'Issued_At', 'Submission_ID'],
  });

  const result = await supabase
    .from(donationCertificatesTable)
    .select(donationCertificateSelect)
    .eq('User_ID', resolvedUserId.userId)
    .order('Issued_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeDonationCertificate(result.data) : null,
    error: result.error,
  };
};

export const fetchDonationCertificatesByUserId = async (userId, limit = 20) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: [], error: resolvedUserId.error };
  }

  logHairQuery('fetchDonationCertificatesByUserId', {
    table: donationCertificatesTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Certificate_ID', 'User_ID', 'Certificate_Number', 'Certificate_Type', 'File_URL', 'Issued_At', 'Submission_ID'],
    limit,
  });

  const result = await supabase
    .from(donationCertificatesTable)
    .select(donationCertificateSelect)
    .eq('User_ID', resolvedUserId.userId)
    .order('Issued_At', { ascending: false })
    .limit(limit);

  return {
    data: (result.data || []).map(normalizeDonationCertificate),
    error: result.error,
  };
};

export const fetchDonorRecommendationsBySubmissionId = async (submissionId, limit = 5) => {
  logHairQuery('fetchDonorRecommendationsBySubmissionId', {
    table: donorRecommendationsTable,
    phase: 'read',
    filters: { Submission_ID: submissionId },
    columns: ['Recommendation_ID', 'Submission_ID', 'Title', 'Recommendation_Text', 'Priority_Order', 'Created_At'],
  });

  const result = await supabase
    .from(donorRecommendationsTable)
    .select(donorRecommendationSelect)
    .eq('Submission_ID', submissionId)
    .order('Priority_Order', { ascending: true })
    .limit(limit);

  return {
    data: (result.data || []).map(normalizeDonorRecommendation),
    error: result.error,
  };
};

export const fetchLatestDonorRecommendationByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  logHairQuery('fetchLatestDonorRecommendationByUserId', {
    table: donorRecommendationsTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Recommendation_ID', 'Submission_ID', 'Title', 'Recommendation_Text', 'Created_At'],
  });

  // First, get the latest submission
  const submissionResult = await supabase
    .from(hairSubmissionsTable)
    .select('Submission_ID')
    .eq('User_ID', resolvedUserId.userId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!submissionResult.data) {
    return { data: null, error: submissionResult.error };
  }

  // Then get the latest recommendation for that submission
  const result = await supabase
    .from(donorRecommendationsTable)
    .select(donorRecommendationSelect)
    .eq('Submission_ID', submissionResult.data.Submission_ID)
    .order('Priority_Order', { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeDonorRecommendation(result.data) : null,
    error: result.error,
  };
};

export const fetchHairSubmissionsByUserId = async (userId, limit = 10) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: [], error: resolvedUserId.error };
  }

  logHairQuery('fetchHairSubmissionsByUserId', {
    table: hairSubmissionsTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Submission_ID', 'User_ID', 'Donation_Drive_ID', 'Submission_Code', 'Donation_Source', 'Donor_Notes', 'Status', 'Bundle_ID', 'Created_At', 'Updated_At'],
  });

  const result = await supabase
    .from(hairSubmissionsTable)
    .select(hairSubmissionSelect)
    .eq('User_ID', resolvedUserId.userId)
    .order('Created_At', { ascending: false })
    .limit(limit);

  if (result.error || !(result.data || []).length) {
    return {
      data: (result.data || []).map(normalizeHairSubmission),
      error: result.error,
    };
  }

  const submissionIds = result.data.map((row) => row?.submission_id).filter(Boolean);

  const screeningsResult = await supabase
    .from(aiScreeningsTable)
    .select(aiScreeningSelect)
    .in('Submission_ID', submissionIds)
    .order('Created_At', { ascending: false });

  if (screeningsResult.error) {
    logAppError('hair_submission.query.fetchHairSubmissionsByUserId.screenings', screeningsResult.error, {
      table: aiScreeningsTable,
      phase: 'read',
      submissionIds,
    });
  }

  const screeningsBySubmissionId = new Map();
  (screeningsResult.data || []).forEach((row) => {
    const screening = normalizeAiScreening(row);
    const currentRows = screeningsBySubmissionId.get(screening.submission_id) || [];
    currentRows.push(screening);
    screeningsBySubmissionId.set(screening.submission_id, currentRows);
  });

  const detailsResult = await supabase
    .from(hairSubmissionDetailsTable)
    .select(hairSubmissionDetailSelect)
    .in('Submission_ID', submissionIds)
    .order('Created_At', { ascending: false });

  if (detailsResult.error) {
    logAppError('hair_submission.query.fetchHairSubmissionsByUserId.details', detailsResult.error, {
      table: hairSubmissionDetailsTable,
      phase: 'read',
      submissionIds,
    });
  }

  const normalizedDetails = (detailsResult.data || []).map(normalizeHairSubmissionDetail);
  const detailIds = normalizedDetails.map((detail) => detail.submission_detail_id).filter(Boolean);

  const imagesResult = detailIds.length
    ? await supabase
        .from(hairSubmissionImagesTable)
        .select(hairSubmissionImageSelect)
        .in('Submission_Detail_ID', detailIds)
        .order('Uploaded_At', { ascending: false })
    : { data: [], error: null };

  if (imagesResult.error) {
    logAppError('hair_submission.query.fetchHairSubmissionsByUserId.images', imagesResult.error, {
      table: hairSubmissionImagesTable,
      phase: 'read',
      detailIds,
    });
  }

  const imagesByDetailId = new Map();
  (imagesResult.data || []).forEach((row) => {
    const image = normalizeHairSubmissionImage(row);
    const currentRows = imagesByDetailId.get(image.submission_detail_id) || [];
    currentRows.push(image);
    imagesByDetailId.set(image.submission_detail_id, currentRows);
  });

  const detailsBySubmissionId = new Map();
  normalizedDetails.forEach((detail) => {
    const detailWithImages = {
      ...detail,
      images: imagesByDetailId.get(detail.submission_detail_id) || [],
    };
    const currentRows = detailsBySubmissionId.get(detail.submission_id) || [];
    currentRows.push(detailWithImages);
    detailsBySubmissionId.set(detail.submission_id, currentRows);
  });

  const recommendationsResult = await supabase
    .from(donorRecommendationsTable)
    .select(donorRecommendationSelect)
    .in('Submission_ID', submissionIds)
    .order('Priority_Order', { ascending: true });

  if (recommendationsResult.error) {
    logAppError('hair_submission.query.fetchHairSubmissionsByUserId.recommendations', recommendationsResult.error, {
      table: donorRecommendationsTable,
      phase: 'read',
      submissionIds,
    });
  }

  const recommendationsBySubmissionId = new Map();
  (recommendationsResult.data || []).forEach((row) => {
    const recommendation = normalizeDonorRecommendation(row);
    const currentRows = recommendationsBySubmissionId.get(recommendation.submission_id) || [];
    currentRows.push(recommendation);
    recommendationsBySubmissionId.set(recommendation.submission_id, currentRows);
  });

  return {
    data: (result.data || []).map((row) => normalizeHairSubmission({
      ...row,
      ai_screenings: screeningsBySubmissionId.get(row?.submission_id) || [],
      donor_recommendations: recommendationsBySubmissionId.get(row?.submission_id) || [],
      submission_details: detailsBySubmissionId.get(row?.submission_id) || [],
    })),
    error: result.error,
  };
};

export const getHairSubmissionImageSignedUrl = async (path, expiresIn = 3600) => {
  if (!path) {
    return { data: '', error: new Error('Image path is required.') };
  }

  const result = await supabase.storage
    .from(hairSubmissionStorageBucket)
    .createSignedUrl(path, expiresIn);

  return {
    data: result.data?.signedUrl || '',
    error: result.error,
  };
};

export const fetchLatestHairSubmissionByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  logHairQuery('fetchLatestHairSubmissionByUserId', {
    table: hairSubmissionsTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Submission_ID', 'User_ID', 'Donation_Drive_ID', 'Submission_Code', 'Donation_Source', 'Donor_Notes', 'Status', 'Bundle_ID', 'Created_At', 'Updated_At'],
  });

  const result = await supabase
    .from(hairSubmissionsTable)
    .select(hairSubmissionSelect)
    .eq('User_ID', resolvedUserId.userId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestHairSubmissionDetailBySubmissionId = async (submissionId) => {
  logHairQuery('fetchLatestHairSubmissionDetailBySubmissionId', {
    table: hairSubmissionDetailsTable,
    phase: 'read',
    filters: { Submission_ID: submissionId },
    columns: ['Submission_Detail_ID', 'Submission_ID', 'Declared_Length', 'Declared_Texture', 'Declared_Density', 'Declared_Condition', 'Detail_Notes', 'Status', 'Created_At'],
  });

  const result = await supabase
    .from(hairSubmissionDetailsTable)
    .select(hairSubmissionDetailSelect)
    .eq('Submission_ID', submissionId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionDetail(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionLogistics = async (payload) => {
  logHairQuery('createHairSubmissionLogistics', {
    table: hairSubmissionLogisticsTable,
    phase: 'create',
    filters: { Submission_ID: payload?.submission_id },
    columns: ['Submission_ID', 'Logistics_Type', 'Shipment_Status', 'Pickup_Schedule_Date', 'Notes'],
  });

  const result = await supabase
    .from(hairSubmissionLogisticsTable)
    .insert([{
      Submission_ID: payload?.submission_id || null,
      Logistics_Type: payload?.logistics_type || null,
      Courier_Name: payload?.courier_name || null,
      Tracking_Number: payload?.tracking_number || null,
      Shipment_Status: payload?.shipment_status || null,
      Pickup_Schedule_Date: payload?.pickup_schedule_date || null,
      Notes: payload?.notes || null,
    }])
    .select(hairSubmissionLogisticsSelect)
    .single();

  return {
    data: result.data ? normalizeHairSubmissionLogistics(result.data) : null,
    error: result.error,
  };
};

export const updateHairSubmissionById = async (submissionId, payload) => {
  if (!submissionId) {
    return { data: null, error: new Error('Submission ID is required.') };
  }

  logHairQuery('updateHairSubmissionById', {
    table: hairSubmissionsTable,
    phase: 'update',
    filters: { Submission_ID: submissionId },
    columns: ['Donation_Drive_ID', 'Submission_Code', 'Donation_Source', 'Donor_Notes', 'Status', 'Bundle_ID'],
  });

  const result = await supabase
    .from(hairSubmissionsTable)
    .update({
      Donation_Drive_ID: payload?.donation_drive_id ?? undefined,
      Submission_Code: payload?.submission_code ?? undefined,
      Donation_Source: payload?.donation_source ?? undefined,
      Donor_Notes: payload?.donor_notes ?? undefined,
      Bundle_ID: payload?.bundle_id ?? undefined,
      Status: payload?.status ?? undefined,
    })
    .eq('Submission_ID', submissionId)
    .select(hairSubmissionSelect)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const updateHairSubmissionLogisticsById = async (submissionLogisticsId, payload) => {
  if (!submissionLogisticsId) {
    return { data: null, error: new Error('Submission logistics ID is required.') };
  }

  logHairQuery('updateHairSubmissionLogisticsById', {
    table: hairSubmissionLogisticsTable,
    phase: 'update',
    filters: { Submission_Logistics_ID: submissionLogisticsId },
    columns: ['Logistics_Type', 'Courier_Name', 'Tracking_Number', 'Shipment_Status', 'Pickup_Schedule_Date', 'Notes'],
  });

  const result = await supabase
    .from(hairSubmissionLogisticsTable)
    .update({
      Logistics_Type: payload?.logistics_type || null,
      Courier_Name: payload?.courier_name || null,
      Tracking_Number: payload?.tracking_number || null,
      Shipment_Status: payload?.shipment_status || null,
      Pickup_Schedule_Date: payload?.pickup_schedule_date || null,
      Pickup_Scheduled_At: payload?.pickup_scheduled_at || null,
      Pickup_Approved_At: payload?.pickup_approved_at || null,
      Received_By: payload?.received_by || null,
      Received_At: payload?.received_at || null,
      Notes: payload?.notes || null,
    })
    .eq('Submission_Logistics_ID', submissionLogisticsId)
    .select(hairSubmissionLogisticsSelect)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionLogistics(result.data) : null,
    error: result.error,
  };
};

export const fetchHairSubmissionLogisticsBySubmissionId = async (submissionId) => {
  logHairQuery('fetchHairSubmissionLogisticsBySubmissionId', {
    table: hairSubmissionLogisticsTable,
    phase: 'read',
    filters: { Submission_ID: submissionId },
    columns: ['Submission_Logistics_ID', 'Submission_ID', 'Logistics_Type', 'Courier_Name', 'Tracking_Number', 'Shipment_Status', 'Pickup_Scheduled_At', 'Pickup_Schedule_Date', 'Pickup_Approved_At', 'Received_By', 'Received_At', 'Notes', 'Created_At'],
  });

  const result = await supabase
    .from(hairSubmissionLogisticsTable)
    .select(hairSubmissionLogisticsSelect)
    .eq('Submission_ID', submissionId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionLogistics(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestQaAssessmentBySubmissionDetailId = async (submissionDetailId) => {
  logHairQuery('fetchLatestQaAssessmentBySubmissionDetailId', {
    table: null,
    phase: 'read',
    filters: { Submission_Detail_ID: submissionDetailId },
    columns: [],
    skipped: 'QA_Assessments is not present in the provided schema.',
  });

  return { data: null, error: null };
};

export const fetchHairBundleTrackingHistory = async ({ submissionId, submissionDetailId, limit = 6 }) => {
  logHairQuery('fetchHairBundleTrackingHistory', {
    table: hairBundleTrackingHistoryTable,
    phase: 'read',
    filters: { Submission_ID: submissionId || null, Submission_Detail_ID: submissionDetailId || null },
    columns: ['Tracking_ID', 'Submission_ID', 'Submission_Detail_ID', 'Status', 'Title', 'Description', 'Changed_By', 'Updated_At'],
  });

  const query = supabase
    .from(hairBundleTrackingHistoryTable)
    .select(trackingEntrySelect)
    .order('Updated_At', { ascending: false })
    .limit(limit);

  if (submissionId && submissionDetailId) {
    const result = await query
      .eq('Submission_ID', submissionId)
      .or(`Submission_Detail_ID.eq.${submissionDetailId},Submission_Detail_ID.is.null`);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  if (submissionId) {
    const result = await query.eq('Submission_ID', submissionId);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  if (submissionDetailId) {
    const result = await query.eq('Submission_Detail_ID', submissionDetailId);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  return { data: [], error: null };
};

export const createHairBundleTrackingEntry = async (payload) => {
  logHairQuery('createHairBundleTrackingEntry', {
    table: hairBundleTrackingHistoryTable,
    phase: 'create',
    filters: {
      Submission_ID: payload?.submission_id || null,
      Submission_Detail_ID: payload?.submission_detail_id || null,
    },
    columns: ['Submission_ID', 'Submission_Detail_ID', 'Status', 'Title', 'Description', 'Changed_By'],
  });

  const result = await supabase
    .from(hairBundleTrackingHistoryTable)
    .insert([{
      Submission_ID: payload?.submission_id || null,
      Submission_Detail_ID: payload?.submission_detail_id || null,
      Status: payload?.status || null,
      Title: payload?.title || null,
      Description: payload?.description || null,
      Changed_By: payload?.changed_by || null,
    }])
    .select(trackingEntrySelect)
    .maybeSingle();

  return {
    data: result.data ? normalizeTrackingEntry(result.data) : null,
    error: result.error,
  };
};

export const uploadHairSubmissionImage = async ({ path, fileBody, contentType, bucket = hairSubmissionStorageBucket }) => (
  await supabase.storage
    .from(bucket)
    .upload(path, fileBody, {
      contentType,
      upsert: false,
    })
);

export const removeHairSubmissionImagesFromStorage = async ({ paths = [], bucket = hairSubmissionStorageBucket }) => (
  await supabase.storage
    .from(bucket)
    .remove(paths.filter(Boolean))
);

export const deleteHairSubmissionImagesByDetailId = async (submissionDetailId) => (
  await supabase
    .from(hairSubmissionImagesTable)
    .delete()
    .eq('Submission_Detail_ID', submissionDetailId)
);

export const deleteDonorRecommendationsBySubmissionId = async (submissionId) => (
  await supabase
    .from(donorRecommendationsTable)
    .delete()
    .eq('Submission_ID', submissionId)
);

export const deleteAiScreeningsBySubmissionId = async (submissionId) => (
  await supabase
    .from(aiScreeningsTable)
    .delete()
    .eq('Submission_ID', submissionId)
);

export const deleteHairSubmissionLogisticsBySubmissionId = async (submissionId) => (
  await supabase
    .from(hairSubmissionLogisticsTable)
    .delete()
    .eq('Submission_ID', submissionId)
);

export const deleteHairSubmissionDetailById = async (submissionDetailId) => (
  await supabase
    .from(hairSubmissionDetailsTable)
    .delete()
    .eq('Submission_Detail_ID', submissionDetailId)
);

export const deleteHairSubmissionById = async (submissionId) => (
  await supabase
    .from(hairSubmissionsTable)
    .delete()
    .eq('Submission_ID', submissionId)
);
