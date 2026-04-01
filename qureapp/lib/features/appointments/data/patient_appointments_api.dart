import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/offline_cache_store.dart';
import '../../../core/utils/json_numbers.dart';
import '../domain/patient_appointment_models.dart';

final patientAppointmentsApiProvider = Provider<PatientAppointmentsApi>((ref) {
  final dio = ref.watch(dioProvider);
  final cache = ref.watch(offlineCacheStoreProvider);
  return PatientAppointmentsApi(dio, cache);
});

final patientAppointmentsProvider =
    FutureProvider.autoDispose.family<AppointmentListPage, String?>((ref, status) async {
  final api = ref.watch(patientAppointmentsApiProvider);
  return api.getAppointments(page: 1, limit: 20, status: status);
});

class PatientAppointmentsApi {
  PatientAppointmentsApi(this._dio, this._cache);

  final Dio _dio;
  final OfflineCacheStore _cache;

  static String _cacheScopeKey(String? status, String? hospitalId) {
    final s = status ?? 'BOOKED';
    final h =
        hospitalId != null && hospitalId.trim().isNotEmpty ? hospitalId.trim() : 'all';
    return 'patientAppointments.status=$s.hospital=$h';
  }

  Future<AppointmentListPage> getAppointments({
    required int page,
    required int limit,
    String? status,
    String? hospitalId,
  }) async {
    final scope = _cacheScopeKey(status, hospitalId);
    final cacheKey = 'patientAppointments.page=$page.limit=$limit.$scope';
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/patient/appointments',
        queryParameters: {
          'page': page,
          'limit': limit,
          ...?(status == null ? null : {'status': status}),
          ...?((hospitalId == null || hospitalId.trim().isEmpty)
              ? null
              : {'hospitalId': hospitalId.trim()}),
        },
      );

      final body = response.data ?? const <String, dynamic>{};
      await _cache.write(cacheKey, jsonEncode(body));
      return _parseAppointmentPageFromBody(body, fallbackPage: page, fallbackLimit: limit);
    } on DioException catch (e) {
      final mapped = mapDioError(e);
      if (mapped.kind != ApiErrorKind.network) throw mapped;

      final cached = await _cache.read(cacheKey);
      if (cached == null) throw mapped;

      final body = jsonDecode(cached.json) as Map<String, dynamic>;
      return _parseAppointmentPageFromBody(body, fallbackPage: page, fallbackLimit: limit);
    }
  }

  AppointmentListPage _parseAppointmentPageFromBody(
    Map<String, dynamic> body, {
    required int fallbackPage,
    required int fallbackLimit,
  }) {
    final data = body['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
    }

    final appointmentsRaw = (data['appointments'] as List<dynamic>? ?? []);
    final appointments = appointmentsRaw
        .whereType<Map<String, dynamic>>()
        .map(_parseAppointment)
        .toList(growable: false);

    final pagination = data['pagination'] as Map<String, dynamic>? ?? const {};

    return AppointmentListPage(
      appointments: appointments,
      currentPage: parseJsonIntWithDefault(pagination['currentPage'], fallbackPage),
      totalPages: parseJsonIntWithDefault(pagination['totalPages'], 1),
      total: parseJsonIntWithDefault(pagination['total'], appointments.length),
      limit: parseJsonIntWithDefault(pagination['limit'], fallbackLimit),
      hasNextPage: (pagination['hasNextPage'] as bool?) ?? false,
    );
  }

  Future<void> createAppointment({
    required String hospitalId,
    required String departmentId,
    required DateTime appointmentDate,
    String? reason,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/appointments',
        data: {
          'hospitalId': hospitalId,
          'departmentId': departmentId,
          'appointmentDate': appointmentDate.toUtc().toIso8601String(),
          ...?(reason == null || reason.trim().isEmpty ? null : {'reason': reason.trim()}),
        },
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> cancelAppointment(String appointmentId) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '/appointments/$appointmentId/cancel',
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> rescheduleAppointment({
    required String appointmentId,
    required DateTime appointmentDate,
  }) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '/appointments/$appointmentId/reschedule',
        data: {
          'appointmentDate': appointmentDate.toUtc().toIso8601String(),
        },
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  PatientAppointment _parseAppointment(Map<String, dynamic> map) {
    final hospital = map['hospital'] as Map<String, dynamic>?;
    final department = map['department'] as Map<String, dynamic>?;
    return PatientAppointment(
      id: map['id'] as String,
      appointmentDate: DateTime.parse(map['appointmentDate'] as String),
      status: map['status'] as String,
      reason: map['reason'] as String?,
      hospitalId: hospital?['id'] as String?,
      hospitalName: hospital?['name'] as String?,
      departmentName: department?['name'] as String?,
      hasFeedback: (map['hasFeedback'] as bool?) ?? false,
    );
  }
}

