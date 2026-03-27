import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final patientFeedbackApiProvider = Provider<PatientFeedbackApi>((ref) {
  final dio = ref.watch(dioProvider);
  return PatientFeedbackApi(dio);
});

class PatientFeedbackApi {
  PatientFeedbackApi(this._dio);

  final Dio _dio;

  Future<void> submitFeedback({
    required String appointmentId,
    required int rating,
    String? comment,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/patient/feedback',
        data: {
          'appointmentId': appointmentId,
          'rating': rating,
          ...?(comment == null ? null : {'comment': comment}),
        },
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}

