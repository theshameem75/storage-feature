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
  clientSecret:
    import.meta.env.VITE_OIDC_CLIENT_SECRET || import.meta.env.VITE_CLIENT_SECRET || '',
  redirectUri:
    import.meta.env.VITE_OIDC_REDIRECT_URI ||
    import.meta.env.VITE_REDIRECT_URI ||
    `${window.location.origin}/callback`,
  scope: import.meta.env.VITE_OIDC_SCOPE || 'openid profile email',
};

function assertAuthConfig() {
  const missingKeys = [];

  if (!OIDC_CONFIG.tenantId) {
    missingKeys.push('VITE_OIDC_TENANT_ID or VITE_X_BLOCKS_KEY');
  }

  if (!OIDC_CONFIG.clientId) {
    missingKeys.push('VITE_OIDC_CLIENT_ID');
  }

  if (!OIDC_CONFIG.clientSecret) {
    missingKeys.push('VITE_OIDC_CLIENT_SECRET');
  }

  if (!OIDC_CONFIG.redirectUri) {
    missingKeys.push('VITE_OIDC_REDIRECT_URI');
  }

  if (missingKeys.length > 0) {
    throw new Error(`Missing OIDC configuration: ${missingKeys.join(', ')}`);
  }
}

function base64UrlEncode(input) {
  let binary = '';
  input.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  return Array.from(randomBytes, (byte) => chars[byte % chars.length]).join('');
}

async function sha256Bytes(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

function normalizeAuthUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const issuerUrl = new URL(OIDC_CONFIG.issuer);
    const issuerBasePath = issuerUrl.pathname.replace(/\/$/, '');

    if (url.origin === issuerUrl.origin) {
      let pathname = url.pathname;

      if (pathname.startsWith(`${issuerBasePath}/`) || pathname === issuerBasePath) {
        pathname = pathname.slice(issuerBasePath.length) || '/';
      }

      return `${OIDC_CONFIG.iamUrl}${pathname}${url.search}${url.hash}`;
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export async function startAuthorization() {
  assertAuthConfig();

  const nonce = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = base64UrlEncode(await sha256Bytes(codeVerifier));
  const state = generateRandomString(32);

  sessionStorage.setItem('oidc_nonce', nonce);
  sessionStorage.setItem('oidc_code_verifier', codeVerifier);
  sessionStorage.setItem('oidc_state', state);

  const initiateUrl = new URL(`${OIDC_CONFIG.issuer}/idp/initiate`);
  initiateUrl.searchParams.set('x-blocks-key', OIDC_CONFIG.tenantId);
  initiateUrl.searchParams.set('clientId', OIDC_CONFIG.clientId);
  initiateUrl.searchParams.set('redirectUri', OIDC_CONFIG.redirectUri);
  initiateUrl.searchParams.set('state', state);
  initiateUrl.searchParams.set('nonce', nonce);
  initiateUrl.searchParams.set('codeChallenge', codeChallenge);
  initiateUrl.searchParams.set('codeChallengeMethod', 'S256');
  initiateUrl.searchParams.set('scope', OIDC_CONFIG.scope);

  try {
    const response = await fetch(initiateUrl.toString(), {
      method: 'GET',
      headers: {
        accept: '*/*',
        origin: window.location.origin,
        referer: `${window.location.origin}/`,
        'x-blocks-key': OIDC_CONFIG.tenantId,
      },
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);
      const rawAuthUrl =
        data?.authorizationUrl || data?.url || data?.authorization_url || data?.redirectUrl;

      if (rawAuthUrl) {
        const authUrl = normalizeAuthUrl(rawAuthUrl);

        try {
          const stateFromUrl = new URL(authUrl).searchParams.get('state');

          if (stateFromUrl) {
            sessionStorage.setItem('oidc_state', stateFromUrl);
          }
        } catch {
          /* ignore state sync for non-URL initiate responses */
        }

        window.location.href = authUrl;
        return;
      }
    }
  } catch (error) {
    console.warn('IDP initiate call failed, falling back to direct authorize:', error);
  }

  const params = new URLSearchParams({
    client_id: OIDC_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: OIDC_CONFIG.redirectUri,
    scope: OIDC_CONFIG.scope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    tenant_id: OIDC_CONFIG.tenantId,
  });

  window.location.href = `${OIDC_CONFIG.iamUrl}/oidc/login?${params.toString()}`;
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
    throw new Error('Missing code or state');
  }

  const savedState = sessionStorage.getItem('oidc_state');
  const codeVerifier = sessionStorage.getItem('oidc_code_verifier');

  if (state !== savedState) {
    throw new Error('State mismatch - possible CSRF attack');
  }

  if (!codeVerifier) {
    throw new Error('Missing code verifier');
  }

  sessionStorage.removeItem('oidc_state');
  sessionStorage.removeItem('oidc_nonce');
  sessionStorage.removeItem('oidc_code_verifier');

  const tokenUrl = `${OIDC_CONFIG.issuer}/oidc/token?tenant_id=${encodeURIComponent(
    OIDC_CONFIG.tenantId,
  )}`;
  const basicAuth = btoa(`${OIDC_CONFIG.clientId}:${OIDC_CONFIG.clientSecret}`);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
      'x-blocks-key': OIDC_CONFIG.tenantId,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OIDC_CONFIG.redirectUri,
      code_verifier: codeVerifier,
      client_id: OIDC_CONFIG.clientId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${await response.text()}`);
  }

  const tokens = await response.json();

  localStorage.setItem('access_token', tokens.access_token);
  if (tokens.id_token) {
    localStorage.setItem('id_token', tokens.id_token);
  }
  if (tokens.refresh_token) {
    localStorage.setItem('refresh_token', tokens.refresh_token);
  }
  if (tokens.expires_in) {
    localStorage.setItem('token_expiry', String(Date.now() + tokens.expires_in * 1000));
  }

  return tokens;
}

export async function logout() {
  const idToken = localStorage.getItem('id_token');

  if (idToken && OIDC_CONFIG.tenantId && OIDC_CONFIG.clientId && OIDC_CONFIG.clientSecret) {
    try {
      const revokeUrl = `${OIDC_CONFIG.issuer}/oidc/revoke?tenant_id=${encodeURIComponent(
        OIDC_CONFIG.tenantId,
      )}`;
      const basicAuth = btoa(`${OIDC_CONFIG.clientId}:${OIDC_CONFIG.clientSecret}`);

      await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
          'x-blocks-key': OIDC_CONFIG.tenantId,
        },
        body: new URLSearchParams({
          token: idToken,
          token_type_hint: 'id_token',
          client_id: OIDC_CONFIG.clientId,
        }),
      });
    } catch (error) {
      console.warn('Token revocation failed:', error);
    }
  }

  localStorage.removeItem('access_token');
  localStorage.removeItem('id_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token_expiry');
  sessionStorage.removeItem('oidc_state');
  sessionStorage.removeItem('oidc_nonce');
  sessionStorage.removeItem('oidc_code_verifier');
}

export function isAuthenticated() {
  const expiry = localStorage.getItem('token_expiry');
  return Boolean(expiry && Date.now() < Number.parseInt(expiry, 10));
}
