import { supabase } from '../../../api/supabase/client';

/**
 * Low-level Supabase Profile calls
 */

export const fetchProfileById = async (userId) => {
  return await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
};

export const createProfile = async (profileData) => {
  return await supabase
    .from('profiles')
    .insert([profileData])
    .select()
    .single();
};

export const updateProfile = async (userId, updates) => {
  return await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
};

export const fetchOptionalRoleProfile = async (tableName, userId) => {
  return await supabase
    .from(tableName)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
};

export const updateOptionalRoleProfile = async (tableName, userId, updates) => {
  return await supabase
    .from(tableName)
    .update(updates)
    .eq('user_id', userId)
    .select()
    .maybeSingle();
};
