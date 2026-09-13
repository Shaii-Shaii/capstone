import { invokeEdgeFunction } from '../api/supabase/client';

const normalizeComparison = (value = null) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!source) return null;

  return {
    comparisonId: source.comparison_id || null,
    previousScreeningId: source.previous_screening_id || null,
    currentScreeningId: source.current_screening_id || null,
    outcome: String(source.outcome || '').trim(),
    summary: String(source.summary || '').trim(),
    details: source.details && typeof source.details === 'object' ? source.details : {},
    model: String(source.model || '').trim(),
    generationStatus: String(source.generation_status || '').trim(),
    createdAt: source.created_at || null,
  };
};

export const fetchLatestHairAnalysisComparison = async () => {
  const result = await invokeEdgeFunction('compare-hair-analyses', { body: {} });
  if (result.error) {
    return {
      data: null,
      error: new Error(result.error.message || 'Hair Analysis progress could not be loaded.'),
    };
  }

  return {
    data: normalizeComparison(result.data?.comparison),
    error: null,
    cached: result.data?.cached === true,
  };
};
