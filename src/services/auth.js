const blocksApiUrl = import.meta.env.VITE_BLOCKS_API_URL || 'https://api.seliseblocks.com';

const OIDC_CONFIG = {
  issuer:
    import.meta.env.VITE_OIDC_API_URL ||
    import.meta.env.VITE_API_URL ||
    `${blocksApiUrl.replace(/\/$/, '')}/iam/v4`,
  iamUrl:
    import.meta.env.VITE_OIDC_IAM_URL ||
    import.meta.env.VITE_IAM_URL ||
    'https://iam.seliseblocks.com',
  tenantId:
    import.meta.env.VITE_OIDC_TENANT_ID ||
    import.meta.env.VITE_TENANT_ID ||
    import.meta.env.VITE_X_BLOCKS_KEY ||
    '',
  clientId: import.meta.env.VITE_OIDC_CLIENT_ID || import.meta.env.VITE_CLIENT_ID || '',
  redirectUri:
    import.meta.env.VITE_OIDC_REDIRECT_URI ||
    import.meta.env.VITE_REDIRECT_URI ||
    `${window.location.origin}/callback`,
};

const TOKEN_STORAGE_KEY = 'blocks-os-token';

function assertAuthConfig() {
  const missingKeys = [];

  if (!OIDC_CONFIG.tenantId) {
    missingKeys.push('VITE_OIDC_TENANT_ID or VITE_X_BLOCKS_KEY');
  }

  if (!OIDC_CONFIG.clientId) {
    missingKeys.push('VITE_OIDC_CLIENT_ID');
  }

  if (!OIDC_CONFIG.redirectUri) {
    missingKeys.push('VITE_OIDC_REDIRECT_URI');
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing OIDC configuration: ${missingKeys.join(', ')}`);
  }
}

function extractToken(data) {
  if (!data || typeof data !== 'object') return null;
  // Check top-level fields
  const top =
    data.access_token ||
    data.accessToken ||
    data.token ||
    data.id_token ||
    data.sessionToken ||
    data.jwt ||
    null;
  if (top) return top;
  // Check one level deep (e.g. { data: { access_token } })
  const nested = data.data;
  if (nested && typeof nested === 'object') {
    return (
      nested.access_token ||
      nested.accessToken ||
      nested.token ||
      nested.id_token ||
      nested.sessionToken ||
      nested.jwt ||
      null
    );
  }
  return null;
}

// Fetches the current session's access token using the HttpOnly session cookie.
// Called after login and when a 401 is received on an IAM management call.
export async function refreshAccessToken() {
  try {
    const response = await fetch(`${OIDC_CONFIG.issuer}/oidc/token`, {
      credentials: 'include',
      headers: { 'x-blocks-key': OIDC_CONFIG.tenantId },
    });

    console.log('[auth] refreshAccessToken status:', response.status);
    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    console.log('[auth] refreshAccessToken body:', data);
    const token = extractToken(data);

    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }

    return token;
  } catch (e) {
    console.log('[auth] refreshAccessToken error:', e);
    return null;
  }
}

export async function startAuthorization() {
  assertAuthConfig();

  const params = new URLSearchParams({
    'x-blocks-key': OIDC_CONFIG.tenantId,
    clientId: OIDC_CONFIG.clientId,
    redirectUri: OIDC_CONFIG.redirectUri,
  });

  const response = await fetch(`${OIDC_CONFIG.issuer}/idp/initiate?${params}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'x-blocks-key': OIDC_CONFIG.tenantId,
    },
  });

  if (!response.ok) {
    throw new Error(`Login initiation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json().catch(() => null);
  const redirectUrl =
    data?.redirect_uri ||
    data?.authorizationUrl ||
    data?.url ||
    data?.authorization_url ||
    data?.redirectUrl;

  if (!redirectUrl) {
    throw new Error('Login initiation response did not contain a redirect URL');
  }

  window.location.href = redirectUrl;
}

export async function handleAuthorizationCallback() {
  assertAuthConfig();

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');
  const errorDescription = urlParams.get('error_description');

  if (error) {
    throw new Error(errorDescription || error);
  }

  if (!code || !state) {
    throw new Error('Missing code or state in callback');
  }

  const callbackParams = new URLSearchParams({ code, state });
  const callbackUrl = `${OIDC_CONFIG.issuer}/idp/callback?${callbackParams}`;

  const response = await fetch(callbackUrl, {
    method: 'GET',
    credentials: 'include',
    headers: { 'x-blocks-key': OIDC_CONFIG.tenantId },
  });

  if (!response.ok) {
    throw new Error(`Auth callback failed: ${await response.text()}`);
  }

  const data = await response.json().catch(() => null);
  console.log('[auth] callback response body:', data);
  console.log('[auth] cookies after callback:', document.cookie);

  // The callback returns an id_token (identity only) — not usable as Bearer for management APIs.
  // Get the actual access token from the session cookie via the token endpoint.
  await refreshAccessToken();

  return data;
}

export async function logout() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);

  await fetch(`${OIDC_CONFIG.iamUrl}/api/idp/logout`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'x-blocks-key': OIDC_CONFIG.tenantId },
  }).catch(() => null);
}

export async function isAuthenticated() {
  try {
    const response = await fetch(`${OIDC_CONFIG.issuer}/oidc/session`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'x-blocks-key': OIDC_CONFIG.tenantId },
    });
    return response.ok;
  } catch {
    return false;
  }
}
