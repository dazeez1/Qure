import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final publicDirectoryApiProvider = Provider<PublicDirectoryApi>((ref) {
  return PublicDirectoryApi(ref.watch(dioProvider));
});

class PublicHospitalOption {
  const PublicHospitalOption({required this.id, required this.name});

  final String id;
  final String name;
}

class PublicDepartmentOption {
  const PublicDepartmentOption({required this.id, required this.name});

  final String id;
  final String name;
}

class PublicDirectoryApi {
  PublicDirectoryApi(this._dio);

  final Dio _dio;

  Future<List<PublicHospitalOption>> fetchHospitals() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/public/hospitals');
      final body = response.data ?? const <String, dynamic>{};
      final list = body['data'] as List<dynamic>? ?? [];
      return list
          .whereType<Map<String, dynamic>>()
          .map(
            (m) => PublicHospitalOption(
              id: m['id'] as String,
              name: (m['name'] as String?) ?? 'Hospital',
            ),
          )
          .toList(growable: false);
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<List<PublicDepartmentOption>> fetchDepartments(String hospitalId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/public/hospitals/$hospitalId/departments',
      );
      final body = response.data ?? const <String, dynamic>{};
      final list = body['data'] as List<dynamic>? ?? [];
      return list
          .whereType<Map<String, dynamic>>()
          .map(
            (m) => PublicDepartmentOption(
              id: m['id'] as String,
              name: (m['name'] as String?) ?? 'Department',
            ),
          )
          .toList(growable: false);
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}
