import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final patientPushTokenApiProvider = Provider<PatientPushTokenApi>((ref) {
  final dio = ref.watch(dioProvider);
  return PatientPushTokenApi(dio);
});

class PatientPushTokenApi {
  PatientPushTokenApi(this._dio);

  final Dio _dio;

  Future<void> registerToken({
    required String token,
    required String platform,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/patient/push-tokens',
        data: {
          'token': token,
          'platform': platform,
        },
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}

