## QA checklist (Patient mobile)

### Authentication
- [ ] Register works (validations + error messages)
- [ ] Login works and persists after app restart
- [ ] Expired/invalid token returns to login cleanly

### Dashboard
- [ ] Queue status loads and refresh works
- [ ] Upcoming appointments render correctly
- [ ] Notifications list renders and “mark as read” works

### Appointments
- [ ] Upcoming list loads
- [ ] Completed list loads (requires backend status filtering)
- [ ] Feedback submit works only for completed appointments and prevents duplicates

### Queue
- [ ] Cancel queue entry works when status allows it
- [ ] Cancel is blocked in consultation (shows a clear error)

### Announcements
- [ ] Announcements load and refresh

### Profile
- [ ] Profile loads (`/api/patient/me`)
- [ ] Phone/gender update works and validates server-side errors
- [ ] Avatar upload works (jpeg/png, max size)
- [ ] Email/push notification preference toggles work

### Offline / poor network
- [ ] Dashboard/appointments/announcements/profile show cached data when offline
- [ ] Write actions fail gracefully with a clear message (no silent failures)

### Push notifications
- [ ] App requests permission and registers a token
- [ ] Backend receives token via `/api/patient/push-tokens`
- [ ] Appointment reminder notifications arrive on device (requires backend Firebase config)

