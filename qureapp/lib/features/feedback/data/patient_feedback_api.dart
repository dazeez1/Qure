import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

import '../domain/public_feedback_item.dart';

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

  /// Public hospital feedback (no auth). Same data shown on the web feedback wall.
  Future<List<PublicFeedbackItem>> fetchHospitalFeedback(String hospitalId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/feedback/hospital/$hospitalId',
      );
      final body = response.data ?? const <String, dynamic>{};
      final list = body['data'] as List<dynamic>? ?? [];
      return list
          .whereType<Map<String, dynamic>>()
          .map(PublicFeedbackItem.fromJson)
          .toList(growable: false);
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}

