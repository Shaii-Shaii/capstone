import { supabase } from '../api/supabase/client';
import { wigReferenceStorageBucket } from './wigRequest.constants';

const firstRelation = (value) => (Array.isArray(value) ? value[0] || null : value || null);

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
  const result = await supabase
    .from('wig_requests')
    .insert([{
      patient_id: payload?.patient_id || null,
      status: payload?.status || null,
      request_date: payload?.request_date || new Date().toISOString(),
      requested_by: payload?.requested_by || null,
      approved_by: payload?.approved_by || null,
      approved_at: payload?.approved_at || null,
      updated_at: new Date().toISOString(),
      pdf_url: payload?.pdf_url || null,
      status_reason: payload?.status_reason || null,
    }])
    .select(`
      req_id,
      patient_id,
      status,
      request_date,
      requested_by,
      approved_by,
      approved_at,
      updated_at,
      pdf_url,
      status_reason
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
    .upsert([{
      req_id: payload?.wig_request_id || payload?.req_id || null,
      preferred_color: payload?.preferred_color || null,
      preferred_length: payload?.preferred_length || null,
      hair_texture: payload?.hair_texture || null,
      cap_size: payload?.cap_size || null,
      style_preference: payload?.style_preference || null,
      special_notes: payload?.notes || payload?.special_notes || null,
      ai_wig_preview_url: payload?.ai_wig_preview_url || null,
    }], {
      onConflict: 'req_id',
    })
    .select(`
      req_spec_id,
      req_id,
      preferred_color,
      preferred_length,
      hair_texture,
      cap_size,
      style_preference,
      special_notes,
      ai_wig_preview_url
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
      patient_id,
      status,
      request_date,
      requested_by,
      approved_by,
      approved_at,
      updated_at,
      pdf_url,
      status_reason,
      wig_request_specifications (
        special_notes,
        ai_wig_preview_url
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
      ai_wig_preview_url,
      wig_requests (
        req_id,
        patient_id,
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
    .from('wig_allocations')
    .select(`
      allocation_id,
      wig_id,
      patient_id,
      wig_request_id,
      allocated_by,
      allocated_at,
      release_status,
      released_at,
      notes,
      wigs (
        wig_id,
        wig_code,
        wig_name,
        wig_status,
        production_notes,
        completed_at,
        updated_at,
        wig_physical_specifications (
          color,
          length,
          hair_texture,
          cap_size,
          style,
          notes
        )
      ),
      wig_requests!inner (
        req_id,
        patient_id,
        status,
        request_date,
        wig_request_specifications (
          special_notes,
          ai_wig_preview_url
        )
      )
    `)
    .eq('patient_id', patientId)
    .order('allocated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeWigAllocation(result.data) : null,
    error: result.error,
  };
};
