import { supabase } from '../api/supabase/client';
import { resolveDatabaseUserId } from './profile/api/profile.api';
import { logAppError, logAppEvent } from '../utils/appErrors';

export const DONOR_PERMISSION_REASONS = {
  profileIncomplete: 'PROFILE_INCOMPLETE',
  guardianConsentRequired: 'GUARDIAN_CONSENT_REQUIRED',
  databaseFailure: 'DATABASE_FAILURE',
};

export const GUARDIAN_CONSENT_TEXT = 'I confirm that I am the parent or legal guardian of this minor donor. I allow the minor donor to participate in the hair donation process through Donivra. I understand that the system may collect and process the minor donor’s profile information, hair donation details, and submitted hair images for AI-assisted initial screening, donation tracking, and coordination with authorized personnel. I understand that final acceptance of donated hair will still be reviewed by authorized personnel.';

const activeLegalDocumentTypes = ['Terms and Conditions'];
const legalDocumentsTable = 'legal_documents';
const userLegalAgreementsTable = 'user_legal_agreements';
const guardianConsentsTable = 'guardian_consents';
const legalDocumentsBucket = 'legal-documents';

const normalizeStoragePath = (path = '', bucket = '') => {
  const normalizedPath = String(path || '').trim().replace(/^\/+/, '');
  const normalizedBucket = String(bucket || '').trim();

  if (normalizedBucket && normalizedPath.startsWith(`${normalizedBucket}/`)) {
    return normalizedPath.slice(normalizedBucket.length + 1);
  }

  return normalizedPath;
};

const normalizeLegalDocument = (row = null) => {
  if (!row) return null;
  const fileUrl = row.Document_File_URL || row.document_file_url || row.File_URL || row.file_url || row.Pdf_URL || row.pdf_url || '';
  const rawFilePath = row.File_Path || row.file_path || row.Document_File_Path || row.document_file_path || row.Pdf_Path || row.pdf_path || '';
  const fileBucket = row.Document_File_Bucket || row.document_file_bucket || row.File_Bucket || row.file_bucket || row.Pdf_Bucket || row.pdf_bucket || legalDocumentsBucket;

  return {
    legal_document_id: row.Legal_Document_ID || row.legal_document_id || null,
    document_type: row.Document_Type || row.document_type || '',
    title: row.Title || row.title || '',
    version: row.Version || row.version || '',
    summary: row.Summary || row.summary || '',
    content: row.Content || row.content || '',
    file_url: fileUrl,
    file_path: normalizeStoragePath(rawFilePath, fileBucket),
    file_bucket: fileBucket,
    is_active: row.Is_Active ?? row.is_active ?? false,
  };
};

const isFilled = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(value);
};

const normalizeDatabaseUserId = async (userIdentifier) => {
  if (!userIdentifier) {
    return { data: null, error: new Error('User account is required.') };
  }

  if (typeof userIdentifier === 'number' || /^\d+$/.test(String(userIdentifier))) {
    return { data: Number(userIdentifier), error: null };
  }

  const result = await resolveDatabaseUserId(userIdentifier, { ensure: false });
  return { data: result.data || null, error: result.error || null };
};

export const calculateAge = (birthdate) => {
  if (!birthdate) return null;

  const parsedDate = new Date(`${String(birthdate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - parsedDate.getFullYear();
  const monthDelta = today.getMonth() - parsedDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < parsedDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

export const getDonorCategory = (age) => {
  if (!Number.isFinite(Number(age))) return null;
  if (Number(age) >= 18) return 'Adult';
  if (Number(age) >= 13) return 'Minor';
  return 'Guardian-Managed Minor';
};

export const getDonorProfileBadge = ({ birthdate, guardianConsent = null }) => {
  if (!String(birthdate || '').trim()) {
    return null;
  }

  const age = calculateAge(birthdate);
  const category = getDonorCategory(age);
  const hasConsent = Boolean(guardianConsent?.guardian_consent_id || guardianConsent?.Guardian_Consent_ID);

  if (!category) return null;
  if (category === 'Adult') return { label: 'Adult Donor', tone: 'success', age, category };
  if (category === 'Minor') {
    return {
      label: hasConsent ? 'Minor Donor - Guardian Consent Completed' : 'Minor Donor - Guardian Consent Required',
      tone: hasConsent ? 'success' : 'warning',
      age,
      category,
    };
  }

  return {
    label: hasConsent
      ? 'Guardian-Managed Minor - Guardian Consent Completed'
      : 'Guardian-Managed Minor - Guardian Consent Required',
    tone: hasConsent ? 'success' : 'warning',
    age,
    category,
  };
};

export const mapDonationPermissionError = (reason) => {
  if (reason === DONOR_PERMISSION_REASONS.profileIncomplete) {
    return 'Please complete your donor profile, including birthdate, before continuing.';
  }
  if (reason === DONOR_PERMISSION_REASONS.guardianConsentRequired) {
    return 'Since the donor is below 18 years old, parent or guardian consent is required before hair donation submission.';
  }
  return 'We could not verify donation permissions right now. Please try again.';
};

export const fetchActiveGuardianConsent = async (userIdentifier) => {
  try {
    const userIdResult = await normalizeDatabaseUserId(userIdentifier);
    if (userIdResult.error || !userIdResult.data) {
      throw userIdResult.error || new Error('User account is required.');
    }

    const result = await supabase
      .from(guardianConsentsTable)
      .select(`
        guardian_consent_id,
        user_id,
        guardian_full_name,
        guardian_relationship,
        guardian_email,
        guardian_contact_number,
        consent_status,
        minor_donation_allowed,
        ai_image_processing_allowed,
        public_posting_allowed,
        consented_at
      `)
      .eq('user_id', userIdResult.data)
      .eq('consent_status', 'Active')
      .eq('minor_donation_allowed', true)
      .eq('ai_image_processing_allowed', true)
      .order('consented_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) throw result.error;

    return { data: result.data || null, error: null };
  } catch (error) {
    logAppError('guardian_consent.fetch_active', error, {
      userIdentifier: userIdentifier || null,
    });
    return { data: null, error };
  }
};

export const saveGuardianConsent = async ({
  userId,
  guardianFullName,
  guardianRelationship,
  guardianEmail = '',
  guardianContactNumber,
  publicPostingAllowed = false,
}) => {
  try {
    const userIdResult = await normalizeDatabaseUserId(userId);
    if (userIdResult.error || !userIdResult.data) {
      throw userIdResult.error || new Error('User account is required.');
    }

    const payload = {
      user_id: userIdResult.data,
      guardian_full_name: String(guardianFullName || '').trim(),
      guardian_relationship: String(guardianRelationship || '').trim(),
      guardian_email: String(guardianEmail || '').trim() || null,
      guardian_contact_number: String(guardianContactNumber || '').trim(),
      consent_status: 'Active',
      consent_method: 'Electronic Checkbox',
      consent_text_snapshot: GUARDIAN_CONSENT_TEXT,
      minor_donation_allowed: true,
      ai_image_processing_allowed: true,
      public_posting_allowed: Boolean(publicPostingAllowed),
      consented_at: new Date().toISOString(),
    };

    const result = await supabase
      .from(guardianConsentsTable)
      .insert([payload])
      .select('guardian_consent_id')
      .single();

    if (result.error) throw result.error;

    logAppEvent('guardian_consent.save', 'Guardian consent saved.', {
      databaseUserId: userIdResult.data,
      guardianConsentId: result.data?.guardian_consent_id || null,
      publicPostingAllowed: Boolean(publicPostingAllowed),
    });

    return { data: result.data || null, error: null };
  } catch (error) {
    logAppError('guardian_consent.save', error, {
      databaseUserId: userId || null,
    });
    return { data: null, error: new Error('Guardian consent could not be saved. Please try again.') };
  }
};

export const recordAcceptedLegalAgreements = async ({ databaseUserId, authUserId = null }) => {
  try {
    if (!databaseUserId) {
      throw new Error('User account is required.');
    }

    const documentResult = await supabase
      .from(legalDocumentsTable)
      .select(`
        legal_document_id,
        document_type,
        title,
        version,
        content
      `)
      .in('document_type', activeLegalDocumentTypes)
      .eq('is_active', true);

    if (documentResult.error) throw documentResult.error;

    const documents = documentResult.data || [];
    if (documents.length < activeLegalDocumentTypes.length) {
      throw new Error('Legal documents are not ready. Please contact support.');
    }

    const acceptedAt = new Date().toISOString();
    const agreementLookup = await supabase
      .from(userLegalAgreementsTable)
      .select('legal_document_id')
      .eq('user_id', databaseUserId)
      .in('legal_document_id', documents.map((document) => document.legal_document_id));

    if (agreementLookup.error) throw agreementLookup.error;

    const acceptedDocumentIds = new Set((agreementLookup.data || []).map((row) => row.legal_document_id));
    const rows = documents
      .filter((document) => !acceptedDocumentIds.has(document.legal_document_id))
      .map((document) => ({
      user_id: databaseUserId,
      legal_document_id: document.legal_document_id,
      is_accepted: true,
      accepted_at: acceptedAt,
      user_agent: authUserId ? `auth_user_id:${authUserId}` : null,
    }));

    if (!rows.length) {
      return { success: true, error: null };
    }

    const insertResult = await supabase
      .from(userLegalAgreementsTable)
      .insert(rows);

    if (insertResult.error) throw insertResult.error;

    return { success: true, error: null };
  } catch (error) {
    logAppError('legal_agreement.save', error, {
      databaseUserId: databaseUserId || null,
      authUserId: authUserId || null,
    });
    return { success: false, error: new Error('Legal agreement could not be saved. Please try again.') };
  }
};

export const fetchActiveLegalDocument = async (documentType = 'Terms and Conditions') => {
  try {
    const result = await supabase
      .from(legalDocumentsTable)
      .select('*')
      .eq('document_type', documentType)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) throw result.error;

    const document = normalizeLegalDocument(result.data);
    if (!document?.legal_document_id) {
      throw new Error(`${documentType} document is not available yet.`);
    }

    let pdfUrl = document.file_url || '';
    if (!pdfUrl && document.file_bucket && document.file_path) {
      const signedResult = await supabase.storage
        .from(document.file_bucket)
        .createSignedUrl(document.file_path, 60 * 10);

      if (signedResult.error) throw signedResult.error;
      pdfUrl = signedResult.data?.signedUrl || '';
    }

    return {
      data: {
        ...document,
        pdf_url: pdfUrl,
      },
      error: null,
    };
  } catch (error) {
    logAppError('legal_document.fetch_active', error, {
      documentType,
    });
    return {
      data: null,
      error: new Error('Terms and Conditions could not be loaded. Please try again.'),
    };
  }
};

export const canSubmitHairDonation = async (userId) => {
  try {
    const userIdResult = await normalizeDatabaseUserId(userId);
    if (userIdResult.error || !userIdResult.data) {
      return {
        allowed: false,
        reason: DONOR_PERMISSION_REASONS.profileIncomplete,
        donorAge: null,
        guardianConsentId: null,
        donorCategory: null,
      };
    }

    const detailsResult = await supabase
      .from('user_details')
      .select('user_id, first_name, last_name, birthdate, contact_number')
      .eq('user_id', userIdResult.data)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (detailsResult.error) throw detailsResult.error;

    const details = detailsResult.data || null;
    const age = calculateAge(details?.birthdate);
    const donorCategory = getDonorCategory(age);

    if (
      !details
      || !isFilled(details.first_name)
      || !isFilled(details.last_name)
      || !isFilled(details.contact_number)
      || age === null
    ) {
      return {
        allowed: false,
        reason: DONOR_PERMISSION_REASONS.profileIncomplete,
        donorAge: age,
        guardianConsentId: null,
        donorCategory,
      };
    }

    if (age >= 18) {
      return {
        allowed: true,
        reason: null,
        donorAge: age,
        guardianConsentId: null,
        donorCategory,
      };
    }

    const consentResult = await fetchActiveGuardianConsent(userIdResult.data);
    if (consentResult.error || !consentResult.data?.guardian_consent_id) {
      return {
        allowed: false,
        reason: DONOR_PERMISSION_REASONS.guardianConsentRequired,
        donorAge: age,
        guardianConsentId: null,
        donorCategory,
      };
    }

    return {
      allowed: true,
      reason: null,
      donorAge: age,
      guardianConsentId: consentResult.data.guardian_consent_id,
      donorCategory,
    };
  } catch (error) {
    logAppError('donor_permission.can_submit', error, {
      userId: userId || null,
    });

    return {
      allowed: false,
      reason: DONOR_PERMISSION_REASONS.databaseFailure,
      donorAge: null,
      guardianConsentId: null,
      donorCategory: null,
    };
  }
};
