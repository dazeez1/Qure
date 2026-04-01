import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io';

import '../env/app_config.dart';
import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/data/auth_session_repository.dart';
import 'api_exception.dart';
import 'patient_auth_paths.dart';

final dioProvider = Provider<Dio>((ref) {
  final sessionRepository = ref.watch(authSessionRepositoryProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: _normalizeBaseUrl(AppConfig.apiBaseUrl),
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 20),
      headers: {
        'Content-Type': 'application/json',
      },
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await sessionRepository.readToken();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final response = error.response;
        final path = error.requestOptions.path;
        if (response?.statusCode == 401 && !isPatientAuthCredentialPath(path)) {
          // Expired/invalid token: clear session and sync auth state so GoRouter sends user to login.
          await ref.read(authControllerProvider.notifier).logout();
        }
        handler.next(error);
      },
    ),
  );

  return dio;
});

String _normalizeBaseUrl(String baseUrl) {
  // Android emulator cannot reach host machine via localhost/127.0.0.1.
  // 10.0.2.2 is the special alias to the host loopback.
  if (kIsWeb) return baseUrl;
  if (!Platform.isAndroid) return baseUrl;

  return baseUrl
      .replaceFirst('http://localhost', 'http://10.0.2.2')
      .replaceFirst('http://127.0.0.1', 'http://10.0.2.2')
      .replaceFirst('https://localhost', 'https://10.0.2.2')
      .replaceFirst('https://127.0.0.1', 'https://10.0.2.2');
}

ApiException mapDioError(DioException error) {
  final statusCode = error.response?.statusCode;
  final responseData = error.response?.data;

  String? backendMessage;
  if (responseData is Map<String, dynamic>) {
    final message = responseData['message'];
    if (message is String && message.isNotEmpty) {
      backendMessage = message;
    }
  }

  if (error.type == DioExceptionType.connectionTimeout ||
      error.type == DioExceptionType.sendTimeout ||
      error.type == DioExceptionType.receiveTimeout ||
      error.type == DioExceptionType.connectionError) {
    return ApiException(
      backendMessage ?? 'Network error. Please check your connection and try again.',
      kind: ApiErrorKind.network,
      statusCode: statusCode,
    );
  }

  if (statusCode == 401) {
    return ApiException(
      backendMessage ?? 'Session expired. Please log in again.',
      kind: ApiErrorKind.unauthorized,
      statusCode: statusCode,
    );
  }

  if (statusCode == 403) {
    return ApiException(
      backendMessage ?? 'Access denied.',
      kind: ApiErrorKind.forbidden,
      statusCode: statusCode,
    );
  }

  if (statusCode != null && statusCode >= 400 && statusCode < 500) {
    return ApiException(
      backendMessage ?? 'Request failed. Please review your input and try again.',
      kind: ApiErrorKind.validation,
      statusCode: statusCode,
    );
  }

  if (statusCode != null && statusCode >= 500) {
    return ApiException(
      backendMessage ?? 'Server error. Please try again later.',
      kind: ApiErrorKind.server,
      statusCode: statusCode,
    );
  }

  return ApiException(
    backendMessage ?? 'Unexpected error. Please try again.',
    kind: ApiErrorKind.unknown,
    statusCode: statusCode,
  );
}

