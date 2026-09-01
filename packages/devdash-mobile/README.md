# DevDash Mobile

React Native app (Expo SDK 57, development builds — not Expo Go) for iOS,
Android and iPad. Talks to the same API the web UI uses; the JWT lives in
`expo-secure-store`, never AsyncStorage.

Design source of truth: `docs/design/devdash-mobile-prototype.html`.
Contract: `docs/api/openapi.yaml`. Shared types: `@dialout/shared`.

## Run it on a phone (Expo Go)

Firebase is not wired yet, so Expo Go works. Open the QR **inside Expo Go**,
not with the Camera app (Camera says “no usable data found”). Opening
`http://…:8081` in a browser is the web preview — the 1–9 pad is the login PIN,
not the native app.

```bash
cd packages/devdash-mobile
npm install
npx expo start --go
```

1. Phone and computer on the same Wi‑Fi.
2. Open **Expo Go** (log in as `hello@dialout.dev` if you want; the account
   does not have to match the computer).
3. Tap **Scan QR code** in Expo Go and point it at the terminal QR.
4. If LAN is blocked, use a tunnel: `npx expo start --go --tunnel`.

You should see **DevDash** and “Email, then your PIN”. Type your DevDash email,
then the 4-digit PIN, then the authenticator code.

A development client (`npm run start:dev-client`) is only needed later, when
Firebase push is added. Expo Go cannot load that.

Default API is production (`https://www.dialout.dev`). Override with
`EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` if you want a local server. On a
phone, `localhost` is the phone — use the machine’s LAN IP, or production.

## Auth

Email + 4-digit PIN, then a 6-digit TOTP. Native login sends
`X-DevDash-Client: native` and stores the JWT from the body. The pending 2FA
step uses `pendingToken` in JSON (no cookie jar). Sliding refresh: persist
`X-DevDash-Session` whenever it appears — the client already does.

## Push (waiting on Firebase)

The subscribe path and Settings toggle are in place. Delivery is a no-op until
`FIREBASE_SERVICE_ACCOUNT` is set on the server and
`@react-native-firebase/messaging` is wired in the app. Until then, turning
alerts on explains that push is disabled, not broken. Deep links
(`devdash://session/{machineId}/{tmuxName}`, and `/ai/...` from a future
notification payload) work without Firebase.

## EAS

```bash
npx eas-cli login
npx eas-cli init          # fills expo.extra.eas.projectId
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile preview --platform android
```

App Store / Play submission is account work (`eas.json` already has a
`submit.production` stub). Default API is production
(`https://www.dialout.dev`).

Live-release checklist, iPhone signing facts, and what is still pending:
`docs/sessions/2026-08-30-mobile-app-release.md`.

## Layout

- Tabs: Sessions · Terminals · Projects · Settings
- Chat: `/session/{machineId}/{tmuxName}`
- Terminal: `/terminal/{id}?machineId=&name=`
- Project: `/project/{id}`
- Deep-link alias: `/ai/{machineId}/{tmuxName}` (matches the web/push path)
