import { supabase } from '../api/supabase/client';
import { wigReferenceStorageBucket } from './wigRequest.constants';
import { logAppError, logAppEvent } from '../utils/appErrors';

const wigRequestsTable = 'Wig_Requests';
const wigRequestSpecificationsTable = 'Wig_Request_Specifications';
const wigAllocationsTable = 'Wig_Allocations';
const wigsTable = 'Wigs';
const wigPhysicalSpecificationsTable = 'Wig_Physical_Specifications';
const patientsTable = 'Patients';

const wigRequestSelect = `
  req_id:Req_ID,
  patient_id:Patient_ID,
  status:Status,
  request_date:Request_Date,
  requested_by:Requested_By,
  approved_by:Approved_By,
  approved_at:Approved_At,
  updated_at:Updated_At,
  pdf_url:Pdf_Url,
  status_reason:Status_Reason,
  hospital_id:Hospital_ID
`;

const wigSpecificationSelect = `
  req_spec_id:Req_Spec_ID,
  req_id:Req_ID,
  preferred_color:Preferred_Color,
  preferred_length:Preferred_Length,
  hair_texture:Hair_Texture,
  cap_size:Cap_Size,
  style_preference:Style_Preference,
  special_notes:Special_Notes,
  ai_wig_preview_url:AI_Wig_Preview_URL
`;

const wigAllocationSelect = `
  allocation_id:Allocation_ID,
  wig_id:Wig_ID,
  patient_id:Patient_ID,
  wig_request_id:Wig_Request_ID,
  allocated_by:Allocated_By,
  allocated_at:Allocated_At,
  release_status:Release_Status,
  released_at:Released_At,
  notes:Notes
`;

const wigSelect = `
  wig_id:Wig_ID,
  wig_code:Wig_Code,
  wig_name:Wig_Name,
  wig_status:Wig_Status,
  production_notes:Production_Notes,
  completed_at:Completed_At,
  updated_at:Updated_At
`;

const wigPhysicalSpecificationSelect = `
  color:Color,
  length:Length,
  hair_texture:Hair_Texture,
  cap_size:Cap_Size,
  style:Style,
  notes:Notes
`;

const patientPictureSelect = `
  patient_picture:Patient_Picture
`;

const firstRelation = (value) => (Array.isArray(value) ? value[0] || null : value || null);

const logWigQuery = (source, extras = {}) => {
  logAppEvent('wig_request.query', 'Wig request query started.', {
    source,
    ...extras,
  });
};

const normalizeWigRequest = (row) => {
  const specification = firstRelation(row?.wig_request_specifications);

  return {
    id: row?.req_id || null,
    req_id: row?.req_id || null,
    patient_id: row?.patient_id || null,
    status: row?.status || '',
    request_date: row?.request_date || null,
    requested_by: row?.requested_by || null,
    approved_by: row?.approved_by || null,
    approved_at: row?.approved_at || null,
    updated_at: row?.updated_at || null,
    pdf_url: row?.pdf_url || '',
    status_reason: row?.status_reason || '',
    notes: specification?.special_notes || '',
    ai_wig_preview_url: specification?.ai_wig_preview_url || '',
  };
};

const normalizeWigSpecification = (row) => {
  const wigRequest = firstRelation(row?.wig_requests);
  const patient = firstRelation(wigRequest?.patients);

  return {
    id: row?.req_spec_id || null,
    req_spec_id: row?.req_spec_id || null,
    req_id: row?.req_id || null,
    wig_request_id: row?.req_id || null,
    preferred_color: row?.preferred_color || '',
    preferred_length: row?.preferred_length || '',
    hair_texture: row?.hair_texture || '',
    cap_size: row?.cap_size || '',
    style_preference: row?.style_preference || '',
    notes: row?.special_notes || '',
    special_notes: row?.special_notes || '',
    ai_wig_preview_url: row?.ai_wig_preview_url || '',
    patient_picture: patient?.patient_picture || '',
    updated_at: wigRequest?.updated_at || null,
  };
};

const normalizeWigAllocation = (row) => {
  const wig = firstRelation(row?.wigs);
  const wigRequest = firstRelation(row?.wig_requests);
  const physicalSpec = firstRelation(wig?.wig_physical_specifications);
  const requestSpecification = firstRelation(wigRequest?.wig_request_specifications);

  return {
    id: row?.allocation_id || null,
    allocation_id: row?.allocation_id || null,
    wig_id: row?.wig_id || null,
    patient_id: row?.patient_id || null,
    wig_request_id: row?.wig_request_id || null,
    allocated_by: row?.allocated_by || null,
    allocated_at: row?.allocated_at || null,
    release_status: row?.release_status || '',
    released_at: row?.released_at || null,
    notes: row?.notes || '',
    wigs: wig
      ? {
          id: wig?.wig_id || null,
          wig_id: wig?.wig_id || null,
          wig_code: wig?.wig_code || '',
          wig_name: wig?.wig_name || physicalSpec?.style || 'Assigned Wig',
          wig_status: wig?.wig_status || '',
          completed_at: wig?.completed_at || null,
          updated_at: wig?.updated_at || null,
          production_notes: wig?.production_notes || '',
          physical_specification: physicalSpec
            ? {
                color: physicalSpec?.color || '',
                length: physicalSpec?.length || '',
                hair_texture: physicalSpec?.hair_texture || '',
                cap_size: physicalSpec?.cap_size || '',
                style: physicalSpec?.style || '',
                notes: physicalSpec?.notes || '',
              }
            : null,
        }
      : null,
    wig_requests: wigRequest
      ? {
          id: wigRequest?.req_id || null,
          req_id: wigRequest?.req_id || null,
          patient_id: wigRequest?.patient_id || null,
          status: wigRequest?.status || '',
          request_date: wigRequest?.request_date || null,
          notes: requestSpecification?.special_notes || '',
          ai_wig_preview_url: requestSpecification?.ai_wig_preview_url || '',
        }
      : null,
  };
};

export const createWigRequest = async (payload) => {
  logWigQuery('createWigRequest', {
    table: wigRequestsTable,
    phase: 'create',
    filters: { Patient_ID: payload?.patient_id || null },
    columns: ['Patient_ID', 'Status', 'Request_Date', 'Requested_By', 'Approved_By', 'Approved_At', 'Updated_At', 'Pdf_Url', 'Status_Reason', 'Hospital_ID'],
  });

  const result = await supabase
    .from(wigRequestsTable)
    .insert([{
      Patient_ID: payload?.patient_id || null,
      Status: payload?.status || null,
      Request_Date: payload?.request_date || new Date().toISOString(),
      Requested_By: payload?.requested_by || null,
      Approved_By: payload?.approved_by || null,
      Approved_At: payload?.approved_at || null,
      Updated_At: new Date().toISOString(),
      Pdf_Url: payload?.pdf_url || null,
      Status_Reason: payload?.status_reason || null,
      Hospital_ID: payload?.hospital_id || null,
    }])
    .select(wigRequestSelect)
    .single();

  return {
    data: result.data ? normalizeWigRequest(result.data) : null,
    error: result.error,
  };
};

export const createWigSpecification = async (payload) => {
  logWigQuery('createWigSpecification', {
    table: wigRequestSpecificationsTable,
    phase: 'create',
    filters: { Req_ID: payload?.wig_request_id || payload?.req_id || null },
    columns: ['Req_ID', 'Preferred_Color', 'Preferred_Length', 'Hair_Texture', 'Cap_Size', 'Style_Preference', 'Special_Notes', 'AI_Wig_Preview_URL'],
  });

  const result = await supabase
    .from(wigRequestSpecificationsTable)
    .upsert([{
      Req_ID: payload?.wig_request_id || payload?.req_id || null,
      Preferred_Color: payload?.preferred_color || null,
      Preferred_Length: payload?.preferred_length || null,
      Hair_Texture: payload?.hair_texture || null,
      Cap_Size: payload?.cap_size || null,
      Style_Preference: payload?.style_preference || null,
      Special_Notes: payload?.notes || payload?.special_notes || null,
      AI_Wig_Preview_URL: payload?.ai_wig_preview_url || null,
    }], {
      onConflict: 'Req_ID',
    })
    .select(wigSpecificationSelect)
    .single();

  return {
    data: result.data ? normalizeWigSpecification(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestWigRequestByPatientDetailsId = async (patientId) => {
  logWigQuery('fetchLatestWigRequestByPatientDetailsId', {
    table: wigRequestsTable,
    phase: 'read',
    filters: { Patient_ID: patientId },
    columns: ['Req_ID', 'Patient_ID', 'Status', 'Request_Date', 'Requested_By', 'Approved_By', 'Approved_At', 'Updated_At', 'Pdf_Url', 'Status_Reason'],
  });

  const result = await supabase
    .from(wigRequestsTable)
    .select(wigRequestSelect)
    .eq('Patient_ID', patientId)
    .order('Updated_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error || !result.data?.req_id) {
    return {
      data: result.data ? normalizeWigRequest(result.data) : null,
      error: result.error,
    };
  }

  const specificationResult = await supabase
    .from(wigRequestSpecificationsTable)
    .select(wigSpecificationSelect)
    .eq('Req_ID', result.data.req_id)
    .maybeSingle();

  if (specificationResult.error) {
    logAppError('wig_request.query.fetchLatestWigRequestByPatientDetailsId.specification', specificationResult.error, {
      table: wigRequestSpecificationsTable,
      phase: 'read',
      filters: { Req_ID: result.data.req_id },
    });
  }

  return {
    data: result.data ? normalizeWigRequest({
      ...result.data,
      wig_request_specifications: specificationResult.data ? [specificationResult.data] : [],
    }) : null,
    error: result.error,
  };
};

export const fetchLatestWigSpecificationByRequestId = async (wigRequestId) => {
  logWigQuery('fetchLatestWigSpecificationByRequestId', {
    table: wigRequestSpecificationsTable,
    phase: 'read',
    filters: { Req_ID: wigRequestId },
    columns: ['Req_Spec_ID', 'Req_ID', 'Preferred_Color', 'Preferred_Length', 'Hair_Texture', 'Cap_Size', 'Style_Preference', 'Special_Notes', 'AI_Wig_Preview_URL'],
  });

  const result = await supabase
    .from(wigRequestSpecificationsTable)
    .select(wigSpecificationSelect)
    .eq('Req_ID', wigRequestId)
    .maybeSingle();

  if (result.error || !result.data) {
    return {
      data: result.data ? normalizeWigSpecification(result.data) : null,
      error: result.error,
    };
  }

  const wigRequestResult = await supabase
    .from(wigRequestsTable)
    .select(`
      req_id:Req_ID,
      patient_id:Patient_ID,
      updated_at:Updated_At
    `)
    .eq('Req_ID', wigRequestId)
    .maybeSingle();

  if (wigRequestResult.error) {
    logAppError('wig_request.query.fetchLatestWigSpecificationByRequestId.request', wigRequestResult.error, {
      table: wigRequestsTable,
      phase: 'read',
      filters: { Req_ID: wigRequestId },
    });
  }

  const patientResult = wigRequestResult.data?.patient_id
    ? await supabase
      .from(patientsTable)
      .select(patientPictureSelect)
      .eq('Patient_ID', wigRequestResult.data.patient_id)
      .maybeSingle()
    : { data: null, error: null };

  if (patientResult.error) {
    logAppError('wig_request.query.fetchLatestWigSpecificationByRequestId.patient', patientResult.error, {
      table: patientsTable,
      phase: 'read',
      filters: { Patient_ID: wigRequestResult.data?.patient_id || null },
    });
  }

  return {
    data: result.data ? normalizeWigSpecification({
      ...result.data,
      wig_requests: wigRequestResult.data
        ? [{
            ...wigRequestResult.data,
            patients: patientResult.data ? [patientResult.data] : [],
          }]
        : [],
    }) : null,
    error: result.error,
  };
};

export const uploadWigReferenceImage = async ({ path, fileBody, contentType, bucket = wigReferenceStorageBucket }) => {
  logAppEvent('wig_request.storage.upload_started', 'Wig preview upload started.', {
    table: 'storage',
    bucket,
    filePath: path,
    fileType: 'wig_request_preview',
    contentType: contentType || 'image/jpeg',
  });

  const result = await supabase.storage
    .from(bucket)
    .upload(path, fileBody, {
      contentType,
      upsert: false,
    });

  if (result.error) {
    logAppError('wig_request.storage.upload_failed', result.error, {
      table: 'storage',
      bucket,
      filePath: path,
      fileType: 'wig_request_preview',
      contentType: contentType || 'image/jpeg',
    });
    return result;
  }

  logAppEvent('wig_request.storage.upload_succeeded', 'Wig preview upload succeeded.', {
    table: 'storage',
    bucket,
    filePath: path,
    fileType: 'wig_request_preview',
  });

  return result;
};

export const getStoragePublicUrl = ({ path, bucket = wigReferenceStorageBucket }) => (
  supabase.storage
    .from(bucket)
    .getPublicUrl(path)
);

export const fetchLatestWigAllocationByPatientDetailsId = async (patientId) => {
  logWigQuery('fetchLatestWigAllocationByPatientDetailsId', {
    table: wigAllocationsTable,
    phase: 'read',
    filters: { Patient_ID: patientId },
    columns: ['Allocation_ID', 'Wig_ID', 'Patient_ID', 'Wig_Request_ID', 'Allocated_By', 'Allocated_At', 'Release_Status', 'Released_At', 'Notes'],
  });

  const result = await supabase
    .from(wigAllocationsTable)
    .select(wigAllocationSelect)
    .eq('Patient_ID', patientId)
    .order('Allocated_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error || !result.data) {
    return {
      data: result.data ? normalizeWigAllocation(result.data) : null,
      error: result.error,
    };
  }

  const wigResult = result.data.wig_id
    ? await supabase
      .from(wigsTable)
      .select(wigSelect)
      .eq('Wig_ID', result.data.wig_id)
      .maybeSingle()
    : { data: null, error: null };

  if (wigResult.error) {
    logAppError('wig_request.query.fetchLatestWigAllocationByPatientDetailsId.wig', wigResult.error, {
      table: wigsTable,
      phase: 'read',
      filters: { Wig_ID: result.data.wig_id || null },
    });
  }

  const physicalSpecResult = wigResult.data?.wig_id
    ? await supabase
      .from(wigPhysicalSpecificationsTable)
      .select(wigPhysicalSpecificationSelect)
      .eq('Wig_ID', wigResult.data.wig_id)
      .maybeSingle()
    : { data: null, error: null };

  if (physicalSpecResult.error) {
    logAppError('wig_request.query.fetchLatestWigAllocationByPatientDetailsId.physical_spec', physicalSpecResult.error, {
      table: wigPhysicalSpecificationsTable,
      phase: 'read',
      filters: { Wig_ID: wigResult.data?.wig_id || null },
    });
  }

  const wigRequestResult = result.data.wig_request_id
    ? await supabase
      .from(wigRequestsTable)
      .select(wigRequestSelect)
      .eq('Req_ID', result.data.wig_request_id)
      .maybeSingle()
    : { data: null, error: null };

  if (wigRequestResult.error) {
    logAppError('wig_request.query.fetchLatestWigAllocationByPatientDetailsId.request', wigRequestResult.error, {
      table: wigRequestsTable,
      phase: 'read',
      filters: { Req_ID: result.data.wig_request_id || null },
    });
  }

  const requestSpecificationResult = wigRequestResult.data?.req_id
    ? await supabase
      .from(wigRequestSpecificationsTable)
      .select(wigSpecificationSelect)
      .eq('Req_ID', wigRequestResult.data.req_id)
      .maybeSingle()
    : { data: null, error: null };

  if (requestSpecificationResult.error) {
    logAppError('wig_request.query.fetchLatestWigAllocationByPatientDetailsId.specification', requestSpecificationResult.error, {
      table: wigRequestSpecificationsTable,
      phase: 'read',
      filters: { Req_ID: wigRequestResult.data?.req_id || null },
    });
  }

  return {
    data: result.data ? normalizeWigAllocation({
      ...result.data,
      wigs: wigResult.data
        ? [{
            ...wigResult.data,
            wig_physical_specifications: physicalSpecResult.data ? [physicalSpecResult.data] : [],
          }]
        : [],
      wig_requests: wigRequestResult.data
        ? [{
            ...wigRequestResult.data,
            wig_request_specifications: requestSpecificationResult.data ? [requestSpecificationResult.data] : [],
          }]
        : [],
    }) : null,
    error: result.error,
  };
};
