import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../patient/application/patient_hospital_context_provider.dart';
import 'patient_feedback_api.dart';
import '../domain/public_feedback_item.dart';

final hospitalPublicFeedbackProvider =
    FutureProvider.autoDispose<List<PublicFeedbackItem>>((ref) async {
  final hid = await ref.watch(patientResolvedHospitalIdProvider.future);
  if (hid == null || hid.isEmpty) {
    return [];
  }
  return ref.watch(patientFeedbackApiProvider).fetchHospitalFeedback(hid);
});
