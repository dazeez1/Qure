import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../appointments/data/patient_appointments_api.dart';
import '../../dashboard/data/patient_dashboard_api.dart';
import '../../queue/data/patient_queue_api.dart';

/// Resolves a hospital the patient is currently associated with (queue, dashboard,
/// or recent appointments) for public hospital-scoped endpoints such as queue
/// preview and hospital feedback.
final patientResolvedHospitalIdProvider =
    FutureProvider.autoDispose<String?>((ref) async {
  try {
    final qs = await ref.watch(patientQueueStatusProvider.future);
    final hid = qs?.queueEntry?.hospitalId;
    if (hid != null && hid.isNotEmpty) {
      return hid;
    }
  } catch (_) {}

  try {
    final dash = await ref.watch(patientDashboardProvider.future);
    final cq = dash.currentQueue?.hospitalId;
    if (cq != null && cq.isNotEmpty) {
      return cq;
    }
    for (final a in dash.upcomingAppointments) {
      final id = a.hospitalId;
      if (id != null && id.isNotEmpty) {
        return id;
      }
    }
  } catch (_) {}

  try {
    final api = ref.read(patientAppointmentsApiProvider);
    for (final status in ['BOOKED', 'COMPLETED', 'CANCELLED']) {
      final page = await api.getAppointments(page: 1, limit: 15, status: status);
      for (final a in page.appointments) {
        if (a.hospitalId != null && a.hospitalId!.isNotEmpty) {
          return a.hospitalId;
        }
      }
    }
  } catch (_) {}

  return null;
});
