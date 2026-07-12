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

  return data;
}

export async function refreshSession() {
  const response = await fetch(`${OIDC_CONFIG.issuer}/auth/token`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-blocks-key': OIDC_CONFIG.tenantId,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token' }),
  });
  return response.ok;
}

export async function logout() {
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
