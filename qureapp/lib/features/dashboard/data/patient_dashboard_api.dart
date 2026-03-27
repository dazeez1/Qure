import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/offline_cache_store.dart';
import '../domain/patient_dashboard_models.dart';

final patientDashboardApiProvider = Provider<PatientDashboardApi>((ref) {
  final dio = ref.watch(dioProvider);
  final cache = ref.watch(offlineCacheStoreProvider);
  return PatientDashboardApi(dio, cache);
});

final patientDashboardProvider =
    FutureProvider.autoDispose<PatientDashboardData>((ref) async {
  final api = ref.watch(patientDashboardApiProvider);
  return api.fetchDashboard();
});

class PatientDashboardApi {
  PatientDashboardApi(this._dio, this._cache);

  final Dio _dio;
  final OfflineCacheStore _cache;

  static const _cacheKey = 'patientDashboard';

  Future<PatientDashboardData> fetchDashboard() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/patient/dashboard');
      final body = response.data ?? const <String, dynamic>{};
      await _cache.write(_cacheKey, jsonEncode(body));
      return _parseDashboardFromBody(body);
    } on DioException catch (e) {
      final mapped = mapDioError(e);
      if (mapped.kind != ApiErrorKind.network) rethrow;

      final cached = await _cache.read(_cacheKey);
      if (cached == null) throw mapped;

      final body = jsonDecode(cached.json) as Map<String, dynamic>;
      return _parseDashboardFromBody(body);
    }
  }

  PatientDashboardData _parseDashboardFromBody(Map<String, dynamic> body) {
    final data = body['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
    }

    final currentQueue = data['currentQueue'];
    final currentQueueSummary =
        currentQueue == null ? null : _parseCurrentQueue(currentQueue as Map<String, dynamic>);

    final upcomingAppointmentsRaw = (data['upcomingAppointments'] as List<dynamic>? ?? []);
    final upcomingAppointments = upcomingAppointmentsRaw
        .whereType<Map<String, dynamic>>()
        .map(_parseAppointmentSummary)
        .toList(growable: false);

    final notificationsRaw = (data['notifications'] as List<dynamic>? ?? []);
    final notifications = notificationsRaw
        .whereType<Map<String, dynamic>>()
        .map(_parseNotificationSummary)
        .toList(growable: false);

    return PatientDashboardData(
      currentQueue: currentQueueSummary,
      upcomingAppointments: upcomingAppointments,
      notifications: notifications,
    );
  }

  CurrentQueueSummary _parseCurrentQueue(Map<String, dynamic> map) {
    final department = map['department'] as Map<String, dynamic>?;
    return CurrentQueueSummary(
      ticketNumber: (map['ticketNumber'] as String?) ?? '',
      status: (map['status'] as String?) ?? '',
      positionInQueue: map['positionInQueue'] is int ? map['positionInQueue'] as int : null,
      waitTimeDisplay: map['waitTimeDisplay'] as String?,
      estimatedWaitMinutes:
          map['estimatedWaitMinutes'] is int ? map['estimatedWaitMinutes'] as int : null,
      departmentName: department?['name'] as String?,
      hospitalId: (map['hospitalId'] as String?) ?? '',
    );
  }

  AppointmentSummary _parseAppointmentSummary(Map<String, dynamic> map) {
    final hospital = map['hospital'] as Map<String, dynamic>?;
    final department = map['department'] as Map<String, dynamic>?;
    return AppointmentSummary(
      id: map['id'] as String,
      appointmentDate: DateTime.parse(map['appointmentDate'] as String),
      status: map['status'] as String,
      reason: map['reason'] as String?,
      hospitalId: hospital?['id'] as String?,
      hospitalName: hospital?['name'] as String?,
      departmentName: department?['name'] as String?,
    );
  }

  PatientNotificationSummary _parseNotificationSummary(Map<String, dynamic> map) {
    return PatientNotificationSummary(
      id: map['id'] as String,
      title: (map['title'] as String?) ?? '',
      content: (map['content'] as String?) ?? '',
      isRead: (map['isRead'] as bool?) ?? false,
      createdAt: DateTime.parse(map['createdAt'] as String),
      category: map['category'] as String?,
      priority: map['priority'] as String?,
    );
  }
}

