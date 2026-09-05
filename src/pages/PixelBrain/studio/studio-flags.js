function envFlag(name, fallback) {
  const value = import.meta.env?.[name];
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

export const PIXELBRAIN_STUDIO_V1 = envFlag('VITE_PIXELBRAIN_STUDIO_V1', true);
export const PIXELBRAIN_STUDIO_LEGACY_REDIRECT = envFlag('VITE_PIXELBRAIN_STUDIO_LEGACY_REDIRECT', true);
