import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';

final authPasswordApiProvider = Provider<AuthPasswordApi>((ref) {
  final dio = ref.watch(dioProvider);
  return AuthPasswordApi(dio);
});

class AuthPasswordApi {
  AuthPasswordApi(this._dio);

  final Dio _dio;

  /// Requests a password reset email. Backend returns the same success message
  /// whether or not the email exists (security).
  Future<String> requestPasswordReset({required String email}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/forgot-password',
        data: {'email': email.trim()},
      );

      final body = response.data;
      final message = body?['message'] as String?;
      if (message != null && message.isNotEmpty) {
        return message;
      }
      return 'If an account exists with that email, a password reset link has been sent.';
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}
