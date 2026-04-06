export const createAppError = (title, message) => ({
  title,
  message,
});

export const getErrorMessage = (error, fallback = '') => {
  if (typeof error === 'string') return error;
  if (error && typeof error.message === 'string') return error.message;
  return fallback;
};

export const logAppError = (scope, error, extras) => {
  const technicalMessage = getErrorMessage(error, 'Unknown error');

  console.log(`[${scope}] ${technicalMessage}`, {
    error,
    extras,
  });
};
