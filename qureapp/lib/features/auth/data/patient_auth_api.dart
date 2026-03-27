import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../domain/patient_profile.dart';

final patientAuthApiProvider = Provider<PatientAuthApi>((ref) {
  final dio = ref.watch(dioProvider);
  return PatientAuthApi(dio);
});

class PatientAuthApi {
  PatientAuthApi(this._dio);

  final Dio _dio;

  Future<PatientProfile> register({
    required String fullName,
    required String email,
    required String password,
    required String phone,
    required String gender,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/patient/auth/register',
        data: {
          'fullName': fullName,
          'email': email,
          'password': password,
          'phone': phone,
          'gender': gender,
        },
      );

      final data = response.data;
      final patient = data?['data'] as Map<String, dynamic>?;
      if (patient == null) {
        throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
      }

      return PatientProfile(
        id: patient['id'] as String,
        fullName: patient['fullName'] as String,
        email: patient['email'] as String,
        phone: phone,
        avatarUrl: null,
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({String token, PatientProfile patient})> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/patient/auth/login',
        data: {
          'email': email,
          'password': password,
        },
      );

      final body = response.data;
      final data = body?['data'] as Map<String, dynamic>?;
      if (data == null) {
        throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
      }

      final token = data['token'] as String?;
      final patientMap = data['patient'] as Map<String, dynamic>?;

      if (token == null || token.isEmpty || patientMap == null) {
        throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
      }

      final patient = PatientProfile(
        id: patientMap['id'] as String,
        fullName: patientMap['fullName'] as String,
        email: patientMap['email'] as String,
        phone: patientMap['phone'] as String?,
        avatarUrl: patientMap['avatarUrl'] as String?,
      );

      return (token: token, patient: patient);
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}

