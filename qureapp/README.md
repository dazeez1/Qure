# Qure Patient (Flutter)

Patient-facing mobile app for the Qure multi-hospital queue management system.

## Getting Started

### Prerequisites

- Flutter SDK (Dart \(>= 3.11\))
- A running Qure backend API

### Configure API base URL

The app reads the backend base URL from a Dart define:

- **`API_BASE_URL`**: defaults to `http://localhost:5001/api`

Example:

```bash
flutter run --dart-define=API_BASE_URL="http://localhost:5000/api"
```

### Push notifications (FCM)

This app uses Firebase Cloud Messaging via `firebase_messaging`.

- Add Firebase to your iOS/Android apps and provide the platform config files:
  - **Android**: `android/app/google-services.json`
  - **iOS**: `ios/Runner/GoogleService-Info.plist`
- Ensure your backend is configured with `FIREBASE_SERVICE_ACCOUNT_JSON` (see `backend/.env.example`).

### Run

```bash
flutter pub get
flutter run
```

### Notes

- The app uses **JWT patient tokens** stored in secure storage.
- Read-only views support **offline caching**; write actions (e.g., queue cancel, feedback submit) require network.

### Troubleshooting

- If login works but other screens fail, verify `API_BASE_URL` and that the backend is reachable from the device/emulator.
- If push tokens are not registering, ensure Firebase is configured and the device has network access.
