import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/offline_cache_store.dart';
import '../domain/patient_appointment_models.dart';

final patientAppointmentsApiProvider = Provider<PatientAppointmentsApi>((ref) {
  final dio = ref.watch(dioProvider);
  final cache = ref.watch(offlineCacheStoreProvider);
  return PatientAppointmentsApi(dio, cache);
});

class PatientAppointmentsApi {
  PatientAppointmentsApi(this._dio, this._cache);

  final Dio _dio;
  final OfflineCacheStore _cache;

  Future<AppointmentListPage> getAppointments({
    required int page,
    required int limit,
    String? status,
  }) async {
    final cacheKey = 'patientAppointments.page=$page.limit=$limit.status=${status ?? 'BOOKED'}';
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/patient/appointments',
        queryParameters: {
          'page': page,
          'limit': limit,
          ...?(status == null ? null : {'status': status}),
        },
      );

      final body = response.data ?? const <String, dynamic>{};
      await _cache.write(cacheKey, jsonEncode(body));
      return _parseAppointmentPageFromBody(body, fallbackPage: page, fallbackLimit: limit);
    } on DioException catch (e) {
      final mapped = mapDioError(e);
      if (mapped.kind != ApiErrorKind.network) rethrow;

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
      currentPage: (pagination['currentPage'] as int?) ?? fallbackPage,
      totalPages: (pagination['totalPages'] as int?) ?? 1,
      total: (pagination['total'] as int?) ?? appointments.length,
      limit: (pagination['limit'] as int?) ?? fallbackLimit,
      hasNextPage: (pagination['hasNextPage'] as bool?) ?? false,
    );
  }

  PatientAppointment _parseAppointment(Map<String, dynamic> map) {
    final hospital = map['hospital'] as Map<String, dynamic>?;
    final department = map['department'] as Map<String, dynamic>?;
    return PatientAppointment(
      id: map['id'] as String,
      appointmentDate: DateTime.parse(map['appointmentDate'] as String),
      status: map['status'] as String,
      reason: map['reason'] as String?,
      hospitalName: hospital?['name'] as String?,
      departmentName: department?['name'] as String?,
      hasFeedback: (map['hasFeedback'] as bool?) ?? false,
    );
  }
}

