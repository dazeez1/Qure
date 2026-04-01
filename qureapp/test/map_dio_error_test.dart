import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qureapp/core/network/api_client.dart';
import 'package:qureapp/core/network/api_exception.dart';

DioException _badResponse({
  required int statusCode,
  Map<String, dynamic>? data,
}) {
  return DioException(
    requestOptions: RequestOptions(path: '/patient/me'),
    response: Response<Map<String, dynamic>>(
      requestOptions: RequestOptions(path: '/patient/me'),
      statusCode: statusCode,
      data: data,
    ),
    type: DioExceptionType.badResponse,
  );
}

void main() {
  group('mapDioError', () {
    test('401 maps to unauthorized with backend message when present', () {
      final mapped = mapDioError(
        _badResponse(
          statusCode: 401,
          data: {'message': 'Invalid token'},
        ),
      );
      expect(mapped.kind, ApiErrorKind.unauthorized);
      expect(mapped.statusCode, 401);
      expect(mapped.message, 'Invalid token');
    });

    test('401 uses default session message when body has no message', () {
      final mapped = mapDioError(_badResponse(statusCode: 401));
      expect(mapped.kind, ApiErrorKind.unauthorized);
      expect(
        mapped.message,
        'Session expired. Please log in again.',
      );
    });

    test('timeout maps to network kind', () {
      final mapped = mapDioError(
        DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.connectionTimeout,
        ),
      );
      expect(mapped.kind, ApiErrorKind.network);
    });
  });
}
