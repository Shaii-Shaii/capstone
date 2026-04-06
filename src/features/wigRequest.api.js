import { supabase } from '../api/supabase/client';
import { wigReferenceStorageBucket } from './wigRequest.constants';

const firstRelation = (value) => (Array.isArray(value) ? value[0] || null : value || null);

const normalizeWigRequest = (row) => {
  const specification = firstRelation(row?.wig_request_specifications);
  return {
    id: row?.req_id || null,
    patient_details_id: row?.patient_id || null,
    hospital_id: row?.hospital_id || null,
    status: row?.status || '',
    notes: specification?.special_notes || '',
    request_date: row?.request_date || null,
    requested_by: row?.requested_by || null,
    approved_by: row?.approved_by || null,
    approved_at: row?.approved_at || null,
    updated_at: row?.updated_at || null,
  };
};

const normalizeWigSpecification = (row) => {
  const wigRequest = firstRelation(row?.wig_requests);
  const patient = firstRelation(wigRequest?.patients);
  return {
    id: row?.req_spec_id || null,
    wig_request_id: row?.req_id || null,
    preferred_color: row?.preferred_color || '',
    preferred_length: row?.preferred_length || '',
    hair_texture: row?.hair_texture || '',
    cap_size: row?.cap_size || '',
    style_preference: row?.style_preference || '',
    notes: row?.special_notes || '',
    ai_picture_sample_url: patient?.patient_picture || '',
    updated_at: wigRequest?.updated_at || null,
  };
};

const normalizeWigAllocation = (row) => {
  const wigRequest = firstRelation(row?.wig_requests);
  const physicalSpec = firstRelation(row?.wig_physical_specifications);
  const requestSpecification = firstRelation(wigRequest?.wig_request_specifications);
  return {
    id: row?.wig_id || null,
    wig_id: row?.wig_id || null,
    patient_details_id: wigRequest?.patient_id || null,
    allocated_at: row?.allocated_at || null,
    release_status: row?.status || '',
    released_at: null,
    notes: row?.notes || '',
    wigs: {
      id: row?.wig_id || null,
      wig_code: row?.wig_id ? `WIG-${row.wig_id}` : '',
      wig_name: physicalSpec?.style || physicalSpec?.length || 'Assigned Wig',
      wig_status: row?.status || '',
      completed_at: null,
      updated_at: row?.updated_at || null,
    },
    wig_requests: wigRequest
      ? {
          id: wigRequest.req_id || null,
          status: wigRequest.status || '',
          request_date: wigRequest.request_date || null,
          notes: requestSpecification?.special_notes || '',
        }
      : null,
  };
};

export const createWigRequest = async (payload) => {
  const result = await supabase
    .from('wig_requests')
    .insert([{
      hospital_id: payload?.hospital_id || null,
      patient_id: payload?.patient_details_id || payload?.patient_id || null,
      status: payload?.status || null,
      request_date: payload?.request_date || new Date().toISOString(),
      requested_by: payload?.requested_by || null,
      approved_by: payload?.approved_by || null,
      approved_at: payload?.approved_at || null,
      updated_at: new Date().toISOString(),
    }])
    .select(`
      req_id,
      hospital_id,
      patient_id,
      status,
      request_date,
      requested_by,
      approved_by,
      approved_at,
      updated_at
    `)
    .single();

  return {
    data: result.data ? normalizeWigRequest(result.data) : null,
    error: result.error,
  };
};

export const createWigSpecification = async (payload) => {
  const result = await supabase
    .from('wig_request_specifications')
    .insert([{
      req_id: payload?.wig_request_id || payload?.req_id || null,
      preferred_color: payload?.preferred_color || null,
      preferred_length: payload?.preferred_length || null,
      hair_texture: payload?.hair_texture || null,
      cap_size: payload?.cap_size || null,
      style_preference: payload?.style_preference || null,
      special_notes: payload?.notes || payload?.special_notes || null,
    }])
    .select(`
      req_spec_id,
      req_id,
      preferred_color,
      preferred_length,
      hair_texture,
      cap_size,
      style_preference,
      special_notes
    `)
    .single();

  return {
    data: result.data ? normalizeWigSpecification(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestWigRequestByPatientDetailsId = async (patientId) => {
  const result = await supabase
    .from('wig_requests')
    .select(`
      req_id,
      hospital_id,
      patient_id,
      status,
      request_date,
      requested_by,
      approved_by,
      approved_at,
      updated_at,
      wig_request_specifications (
        special_notes
      )
    `)
    .eq('patient_id', patientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeWigRequest(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestWigSpecificationByRequestId = async (wigRequestId) => {
  const result = await supabase
    .from('wig_request_specifications')
    .select(`
      req_spec_id,
      req_id,
      preferred_color,
      preferred_length,
      hair_texture,
      cap_size,
      style_preference,
      special_notes,
      wig_requests (
        updated_at,
        patients (
          patient_picture
        )
      )
    `)
    .eq('req_id', wigRequestId)
    .maybeSingle();

  return {
    data: result.data ? normalizeWigSpecification(result.data) : null,
    error: result.error,
  };
};

export const uploadWigReferenceImage = async ({ path, fileBody, contentType, bucket = wigReferenceStorageBucket }) => (
  await supabase.storage
    .from(bucket)
    .upload(path, fileBody, {
      contentType,
      upsert: false,
    })
);

export const getStoragePublicUrl = ({ path, bucket = wigReferenceStorageBucket }) => (
  supabase.storage
    .from(bucket)
    .getPublicUrl(path)
);

export const fetchLatestWigAllocationByPatientDetailsId = async (patientId) => {
  const result = await supabase
    .from('wigs')
    .select(`
      wig_id,
      req_id,
      status,
      allocated_at,
      added_at,
      updated_at,
      notes,
      wig_physical_specifications (
        color,
        length,
        hair_texture,
        cap_size,
        style,
        notes
      ),
      wig_requests!inner (
        req_id,
        patient_id,
        status,
        request_date,
        wig_request_specifications (
          special_notes
        )
      )
    `)
    .eq('wig_requests.patient_id', patientId)
    .order('allocated_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeWigAllocation(result.data) : null,
    error: result.error,
  };
};
