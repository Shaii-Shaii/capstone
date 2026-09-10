export const HAIR_ANALYSIS_INTERVAL_DAYS = 7;
export const HAIR_ANALYSIS_INTERVAL_MS = HAIR_ANALYSIS_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
export const HAIR_ANALYSIS_TIME_ZONE = 'Asia/Manila';

export const getHairAnalysisAvailability = (latestCreatedAt, now = Date.now()) => {
  const latestAtMs = latestCreatedAt ? new Date(latestCreatedAt).getTime() : NaN;
  if (!Number.isFinite(latestAtMs) || latestAtMs <= 0) {
    return { hasPreviousCheck: false, isLocked: false, lastCheckAt: null, nextCheckAt: null };
  }

  const nextCheckAt = new Date(latestAtMs + HAIR_ANALYSIS_INTERVAL_MS);
  return {
    hasPreviousCheck: true,
    isLocked: Number(now) < nextCheckAt.getTime(),
    lastCheckAt: new Date(latestAtMs),
    nextCheckAt,
  };
};

export const formatHairAnalysisDateTime = (value, locale = 'en-PH') => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: HAIR_ANALYSIS_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};
