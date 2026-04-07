import AsyncStorage from '@react-native-async-storage/async-storage';
import { linkPatientRecordByCode, saveAvatar, saveProfile } from '../../profile/services/profile.service';
import { calculateAgeFromBirthdate } from '../validators/auth.schema';

const SIGNUP_DRAFT_STORAGE_KEY = 'donivra.signupDrafts';

const normalizeEmailKey = (email) => email?.trim().toLowerCase() || '';

const sanitizeDraft = (draft = {}) => ({
  email: draft.email?.trim() || '',
  role: draft.role || '',
  isPatient: draft.isPatient || '',
  patientFlowMode: draft.patientFlowMode || '',
  firstName: draft.firstName?.trim() || '',
  middleName: draft.middleName?.trim?.() || '',
  lastName: draft.lastName?.trim() || '',
  suffix: draft.suffix?.trim?.() || '',
  phone: draft.phone?.trim() || '',
  birthdate: draft.birthdate?.trim?.() || '',
  gender: draft.gender?.trim?.() || '',
  joinedDate: draft.joinedDate?.trim?.() || new Date().toISOString().slice(0, 10),
  linkedPatientCode: draft.linkedPatientCode?.trim?.() || '',
  linkedPatientId: draft.linkedPatientId || '',
  linkedPatientHospitalId: draft.linkedPatientHospitalId || '',
  linkedPatientName: draft.linkedPatientName?.trim?.() || '',
  linkedPatientCondition: draft.linkedPatientCondition?.trim?.() || '',
  patientFirstName: draft.patientFirstName?.trim?.() || '',
  patientMiddleName: draft.patientMiddleName?.trim?.() || '',
  patientLastName: draft.patientLastName?.trim?.() || '',
  patientSuffix: draft.patientSuffix?.trim?.() || '',
  patientAge: draft.patientAge?.toString?.().trim?.() || '',
  patientGender: draft.patientGender?.trim?.() || '',
  patientMedicalCondition: draft.patientMedicalCondition?.trim?.() || '',
  patientPicture: draft.patientPicture?.trim?.() || '',
  patientMedicalDocument: draft.patientMedicalDocument?.trim?.() || '',
  street: draft.street?.trim() || '',
  barangay: draft.barangay?.trim() || '',
  city: draft.city?.trim() || '',
  province: draft.province?.trim() || '',
  region: draft.region?.trim() || '',
  country: draft.country?.trim() || 'Philippines',
  latitude: draft.latitude?.trim?.() || '',
  longitude: draft.longitude?.trim?.() || '',
  profilePhoto: draft.profilePhoto?.trim?.() || '',
});

const readDraftMap = async () => {
  try {
    const raw = await AsyncStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const writeDraftMap = async (draftMap) => {
  await AsyncStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(draftMap));
};

export const savePendingSignupDraft = async (draft) => {
  const emailKey = normalizeEmailKey(draft?.email);
  if (!emailKey) return;

  const draftMap = await readDraftMap();
  draftMap[emailKey] = sanitizeDraft(draft);
  await writeDraftMap(draftMap);
};

export const getPendingSignupDraft = async (email) => {
  const emailKey = normalizeEmailKey(email);
  if (!emailKey) return null;

  const draftMap = await readDraftMap();
  return draftMap[emailKey] || null;
};

export const clearPendingSignupDraft = async (email) => {
  const emailKey = normalizeEmailKey(email);
  if (!emailKey) return;

  const draftMap = await readDraftMap();
  if (!(emailKey in draftMap)) return;
  delete draftMap[emailKey];
  await writeDraftMap(draftMap);
};

export const syncPendingSignupDraft = async ({ userId, email, role }) => {
  try {
    if (!userId || !email) {
      return { success: false, error: 'Missing signup sync context.' };
    }

    const draft = await getPendingSignupDraft(email);
    if (!draft) {
      return { success: true, synced: false, error: null };
    }

    const manualPatientRoleSpecific = draft.isPatient === 'yes' && draft.patientFlowMode === 'manual'
      ? {
          first_name: draft.patientFirstName || draft.firstName,
          middle_name: draft.patientMiddleName,
          last_name: draft.patientLastName || draft.lastName,
          suffix: draft.patientSuffix,
          age: calculateAgeFromBirthdate(draft.birthdate),
          gender: draft.patientGender,
          medical_condition: draft.patientMedicalCondition,
          patient_picture: draft.patientPicture || draft.profilePhoto || '',
          medical_document: draft.patientMedicalDocument || '',
        }
      : null;

    const result = await saveProfile(userId, {
      first_name: draft.firstName,
      middle_name: draft.middleName,
      last_name: draft.lastName,
      suffix: draft.suffix,
      phone: draft.phone,
      birthdate: draft.birthdate,
      gender: draft.gender,
      street: draft.street,
      barangay: draft.barangay,
      region: draft.region,
      country: draft.country,
      city: draft.city,
      province: draft.province,
      joined_date: draft.joinedDate,
      roleSpecific: manualPatientRoleSpecific,
    }, role);

    if (result.error) {
      return { success: false, synced: false, error: result.error };
    }

    if (draft.profilePhoto) {
      const avatarResult = await saveAvatar(userId, draft.profilePhoto);
      if (avatarResult.error) {
        return { success: false, synced: false, error: avatarResult.error };
      }
    }

    if (draft.isPatient === 'yes' && draft.patientFlowMode === 'linked' && draft.linkedPatientCode) {
      const patientLinkResult = await linkPatientRecordByCode({
        userId,
        patientCode: draft.linkedPatientCode,
        patientPicture: draft.patientPicture || draft.profilePhoto || '',
      });

      if (patientLinkResult.error) {
        return { success: false, synced: false, error: patientLinkResult.error };
      }
    }

    await clearPendingSignupDraft(email);
    return { success: true, synced: true, error: null };
  } catch (error) {
    return { success: false, synced: false, error: error.message || 'Failed to save signup details.' };
  }
};
