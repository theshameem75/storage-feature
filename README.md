# Construct Console

A developer reference app demonstrating how a consumer application integrates **Blocks OS** (SELISE) — IAM (OIDC login, multi‑tenant orgs, users, roles & permissions), Data Gateway, Storage, and Notification. It's two screens: an OIDC **login gate** and a single **console** where each service is a live, interactive slice with an "api trace & platform notes" panel.

---

## Why HTTPS on a custom domain is required

Login uses Blocks OIDC with secure, cross‑site session cookies (`SameSite=None; Secure`). The app must therefore be served over **HTTPS** on the **exact domain registered as your OIDC redirect origin** — plain `http://localhost` cannot complete the auth flow. The steps below run Vite locally and put an HTTPS proxy in front of it on your Blocks subdomain.

---

## Prerequisites

- Node.js 18+ and npm
- A **Blocks OS** project (see <https://docs.seliseblocks.com/os/category/os-2>)
- A TLS certificate + key for your `*.slsblx.com` subdomain. This repo ships `dbsgim.slsblx.com.pem` / `dbsgim.slsblx.com-key.pem` as an example — generate your own for your subdomain (e.g. with [mkcert](https://github.com/FiloSottile/mkcert)).

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

| Variable | Value |
| --- | --- |
| `VITE_BLOCKS_API_URL` | `https://blocksapi.slsblx.com` |
| `VITE_X_BLOCKS_KEY` | Your **project key**, from Blocks OS |
| `VITE_OIDC_CLIENT_ID` | The **client id** of an OIDC client you create in Blocks OS (step 3) |
| `VITE_OIDC_REDIRECT_URI` | `https://<your-subdomain>.slsblx.com/callback` |

### 3. Register an OIDC client

Create a new OIDC client in Blocks OS to obtain the client id used above, and set its **redirect URI** to `https://<your-subdomain>.slsblx.com/callback` (it must match `VITE_OIDC_REDIRECT_URI`).

Guide: <https://docs.seliseblocks.com/os/category/os-2>

### 4. Map your subdomain to localhost

1. Find your subdomain on the **Overview** page of your app in Blocks OS.
2. Point it at your machine in your hosts file:

   ```
   127.0.0.1   <your-subdomain>.slsblx.com
   ```

   - macOS / Linux: `/etc/hosts`
   - Windows: `C:\Windows\System32\drivers\etc\hosts`
3. Add the subdomain to `allowedHosts` in `vite.config.js`:

   ```js
   server: { allowedHosts: ['<your-subdomain>.slsblx.com'] }
   ```

### 5. Run the app over HTTPS

Start Vite (defaults to port **5173**):

```bash
npm run dev
```

In a second terminal, put an HTTPS proxy in front of it on port 443:

```bash
npx local-ssl-proxy \
  --source 443 \
  --target 5173 \
  --cert <your-subdomain>.slsblx.com.pem \
  --key  <your-subdomain>.slsblx.com-key.pem
```

Then open **`https://<your-subdomain>.slsblx.com`**.

> `local-ssl-proxy` is just one way to serve the app over HTTPS locally — any method works (Caddy, a Vite `https` config, etc.). Whatever you use, `--target` must match the port Vite is actually running on (5173 unless it was taken).

---

## Create a user to log in with

You need an **active user** in your project before you can log in.

1. Invite a user through Blocks OS IAM (**Access Manager → Add a user**). The invitation is sent by Blocks' IAM service.
   Guide: <https://docs.seliseblocks.com/os/iam/access-manager#add-a-user>
2. **Keep this app running** when you click the activation link in the invitation email — activation completes against the running app, so if it isn't up the email activation will fail.

Once activated, open the app and click **`login --oidc`**. (The SSO buttons are UI‑only; captcha is optional and off by default.)

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
