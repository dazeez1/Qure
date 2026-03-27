import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../appointments/data/patient_appointments_api.dart';
import '../../appointments/domain/patient_appointment_models.dart';
import '../../patient/application/patient_hospital_context_provider.dart';

/// Completed appointments shown on Feedback, aligned with the patient’s active
/// hospital (queue / dashboard context, or a single-hospital upcoming list).
///
/// Avoids listing every historical [COMPLETED] row across all hospitals (e.g.
/// seed data) when the patient is clearly working in one facility.
final patientFeedbackAppointmentCandidatesProvider =
    FutureProvider.autoDispose<AppointmentListPage>((ref) async {
      final api = ref.watch(patientAppointmentsApiProvider);

      String? hospitalId;
      try {
        final hid = await ref.watch(patientResolvedHospitalIdProvider.future);
        if (hid != null && hid.trim().isNotEmpty) {
          hospitalId = hid.trim();
        }
      } catch (_) {}

      if (hospitalId == null) {
        final upcoming = await api.getAppointments(
          page: 1,
          limit: 40,
          status: null,
        );
        final hospitalIds = upcoming.appointments
            .map((a) => a.hospitalId)
            .whereType<String>()
            .where((id) => id.trim().isNotEmpty)
            .map((id) => id.trim())
            .toSet();
        if (hospitalIds.length == 1) {
          hospitalId = hospitalIds.first;
        }
      }

      return api.getAppointments(
        page: 1,
        limit: 50,
        status: 'COMPLETED',
        hospitalId: hospitalId,
      );
    });
