export const wigRequestStatuses = {
  pending: 'pending',
};

export const wigRequestSource = 'mobile_app';

export const wigGenerationFunctionName = process.env.EXPO_PUBLIC_WIG_GENERATION_FUNCTION || 'generate-wig-preview';

export const wigReferenceStorageBucket =
  process.env.EXPO_PUBLIC_WIG_REQUEST_PREVIEWS_BUCKET
  || 'wig_request_previews';
