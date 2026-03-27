## Release checklist (Patient mobile)

### Environments
- [ ] Dev/staging/prod API base URLs defined and tested (`API_BASE_URL`)
- [ ] Backend has production CORS allowlist for web (mobile uses no-origin requests)
- [ ] Backend has `FIREBASE_SERVICE_ACCOUNT_JSON` configured (prod only)

### Security
- [ ] No secrets in repo (`.env.example` uses placeholders only)
- [ ] JWT secret is strong and rotated for production
- [ ] Auth endpoints have rate limiting (recommended hardening)

### Stores
- [ ] iOS bundle ID set correctly, signing set up, TestFlight upload verified
- [ ] Android applicationId set correctly, Play internal testing verified
- [ ] Privacy disclosures completed (push tokens, personal info)

### Monitoring
- [ ] Crash reporting configured (recommended)
- [ ] Backend logs do not include PII or tokens

