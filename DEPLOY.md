# Deploying FYRO

Stack: **Vercel** (Next.js client) + **Render** (Express server) + **MongoDB Atlas** (database).
All free-tier. You create the accounts — I can't sign up on your behalf.

## 1. MongoDB Atlas (database)

1. [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) — free account.
2. Create a free **M0** cluster (any region near you, e.g. Mumbai).
3. **Database Access** → add a database user (username + password, "Read and write to any database").
4. **Network Access** → add IP `0.0.0.0/0` (allow from anywhere — Render's outbound IPs aren't static on the free plan).
5. **Connect** → "Drivers" → copy the connection string. It looks like:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/fyro?retryWrites=true&w=majority`
   Fill in your real username/password, keep `/fyro` as the database name.

## 2. Render (backend)

1. [render.com](https://render.com) → sign up, connect your GitHub account, grant access to the `SIH-2026` repo.
2. **New → Web Service** → pick the repo. Render should detect `render.yaml` at the repo root and prefill everything (Node runtime, build/start commands). If it doesn't, set manually:
   - **Root Directory:** leave blank (repo root)
   - **Build Command:** `npm install && npm run build:server`
   - **Start Command:** `node server/dist/server.js`
3. Fill in the environment variables it asks for (the ones marked `sync: false` in `render.yaml`):
   - `CLIENT_ORIGIN` — your Vercel URL once you have it (step 3) — e.g. `https://fyro.vercel.app`. Update this after deploying the client, then redeploy.
   - `MONGODB_URI` — the Atlas connection string from step 1.
   - `ADMIN_PHONE` / `ADMIN_PASSWORD` — your choice, this becomes the admin login.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — Render auto-generates these (`generateValue: true`), no action needed.
4. Deploy. Once live, note the URL — something like `https://fyro-server.onrender.com`.
5. **Seed the admin account** — Render's dashboard has a **Shell** tab on the service; run:
   ```bash
   npm run seed:admin --workspace server
   npm run seed:demo --workspace server
   ```
   (the second one seeds the demo customer/driver/hamali/mutha accounts you've been testing with, `Demo1234!`).

Free-tier note: Render's free web services spin down after 15 minutes idle and take ~30-60s to wake on the next request — expect a slow first load after inactivity. Fine for a demo/SIH submission, not for a real launch.

## 3. Vercel (frontend)

1. [vercel.com](https://vercel.com) → sign up, "Import Project" from the same GitHub repo.
2. **Root Directory:** set to `client` (Vercel auto-detects the npm workspace monorepo and still runs install from the repo root, which triggers the `postinstall` script that builds `@fyro/shared` — if the build fails looking for `@fyro/shared`, override **Install Command** to `cd .. && npm install`).
3. **Framework Preset:** Next.js (auto-detected).
4. **Environment Variable:**
   - `NEXT_PUBLIC_API_BASE` = your Render URL from step 2 (e.g. `https://fyro-server.onrender.com`, no trailing slash).
5. Deploy. You get a URL like `https://fyro-xyz.vercel.app`.
6. **Go back to Render** and update `CLIENT_ORIGIN` to this exact Vercel URL, then manually redeploy the Render service (env var changes need a redeploy to take effect) — the server's CORS config only allows requests from `CLIENT_ORIGIN`, so this step isn't optional.

## 4. Verify

Visit your Vercel URL, log in with the admin phone/password you set, or a demo account (`9000000010` / `Demo1234!` for customer, etc — see `server/src/scripts/seedDemoAccounts.ts` for the full list) once you've run the seed script.

## What's still mocked in this deployment

- **Payments** — `MOCK_EXTERNAL_SERVICES=true` means Razorpay is simulated (`/mock-capture`), no real money moves. Wiring real Razorpay needs `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` env vars and switching that flag off.
- **Photo uploads** (KYC docs, proof photos, avatars) — same flag controls Cloudinary; without `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, uploads return a fake `mock.cloudinary.local` URL instead of a real hosted image.
- **Masked phone calling** — no telephony vendor integrated at all (see the commit that removed raw phone numbers from the socket payload) — in-app chat is the real contact channel right now.

Give me real Cloudinary/Razorpay credentials as env vars whenever you're ready to flip those on — no code changes needed, `MOCK_EXTERNAL_SERVICES=false` and the four Cloudinary/Razorpay vars is the whole switch.

## Turning on live AI agents (Phase 4)

The six agents in `server/src/agents/` (pricing/quote, demand forecast, dispute
triage, document precheck, market insights, support) run in mock mode —
deterministic, clearly labeled `DEMO MODE` in the UI — until a real Anthropic
key is configured. This is **independent of `MOCK_EXTERNAL_SERVICES`**
on purpose: that flag also gates `otp.service.ts`'s SMS sending, which
throws in real mode with no SMS provider wired up, so reusing it for agents
would break the phone-change flow the moment agents went live.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).
   **Never paste it into a chat, commit it to a file, or put it in `render.yaml`** — it's a
   live credential; treat it like a password.
2. Render dashboard → your `fyro-server` service → **Environment** → add
   `ANTHROPIC_API_KEY` with that value → Save. Render redeploys automatically.
3. Verify live in the browser: open a page with an agent card (e.g.
   `/customer/book` for the Pricing & Quote Agent) and confirm the
   **"DEMO MODE"** badge is gone — `AgentResultCard.tsx` only renders it when
   the API response has `mock:true`. You can also check the raw response
   directly (e.g. via the network tab, or `curl`) for `"mock":false`.

If a key is ever pasted somewhere it shouldn't be (chat, a commit, a log),
revoke it immediately in the console above and generate a new one — don't
just remove it from wherever it was pasted, the old value has to be killed.
