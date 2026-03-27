import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final patientNotificationsApiProvider = Provider<PatientNotificationsApi>((ref) {
  final dio = ref.watch(dioProvider);
  return PatientNotificationsApi(dio);
});

class PatientNotificationsApi {
  PatientNotificationsApi(this._dio);

  final Dio _dio;

  Future<void> markAsRead(String notificationId) async {
    await _dio.patch<Map<String, dynamic>>('/patient/notifications/$notificationId/read');
  }

  Future<void> markAllAsRead() async {
    await _dio.patch<Map<String, dynamic>>('/patient/notifications/read-all');
  }

  Future<void> clearAllRead() async {
    await _dio.delete<Map<String, dynamic>>('/patient/notifications/clear-all');
  }
}

