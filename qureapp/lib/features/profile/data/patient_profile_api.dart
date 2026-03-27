import 'dart:io';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/offline_cache_store.dart';
import '../domain/patient_profile_models.dart';

final patientProfileApiProvider = Provider<PatientProfileApi>((ref) {
  final dio = ref.watch(dioProvider);
  final cache = ref.watch(offlineCacheStoreProvider);
  return PatientProfileApi(dio, cache);
});

class PatientProfileApi {
  PatientProfileApi(this._dio, this._cache);

  final Dio _dio;
  final OfflineCacheStore _cache;

  static const _meCacheKey = 'patientProfile.me';
  static const _notificationPrefsCacheKey = 'patientProfile.notificationPreferences';

  Future<PatientProfileDetails> getMe() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/patient/me');
      final body = response.data ?? const <String, dynamic>{};
      await _cache.write(_meCacheKey, jsonEncode(body));
      return _parseProfileFromBody(body);
    } on DioException catch (e) {
      final mapped = mapDioError(e);
      if (mapped.kind != ApiErrorKind.network) rethrow;

      final cached = await _cache.read(_meCacheKey);
      if (cached == null) throw mapped;

      final body = jsonDecode(cached.json) as Map<String, dynamic>;
      return _parseProfileFromBody(body);
    }
  }

  Future<void> updateProfile({
    String? phone,
    String? gender,
  }) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '/patient/profile',
        data: {
          ...?(phone == null ? null : {'phone': phone}),
          ...?(gender == null ? null : {'gender': gender}),
        },
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<String> uploadAvatar(File imageFile) async {
    try {
      final formData = FormData.fromMap({
        'avatar': await MultipartFile.fromFile(
          imageFile.path,
          filename: imageFile.path.split('/').last,
        ),
      });

      final response = await _dio.post<Map<String, dynamic>>(
        '/patient/avatar',
        data: formData,
        options: Options(
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        ),
      );

      final body = response.data;
      final data = body?['data'] as Map<String, dynamic>?;
      final avatarUrl = data?['avatarUrl'] as String?;
      if (avatarUrl == null || avatarUrl.isEmpty) {
        throw ApiException('Avatar upload failed.', kind: ApiErrorKind.unknown);
      }
      return avatarUrl;
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<({bool emailEnabled, bool pushEnabled})> getNotificationPreferences() async {
    try {
      final response =
          await _dio.get<Map<String, dynamic>>('/patient/notification-preferences');
      final body = response.data ?? const <String, dynamic>{};
      await _cache.write(_notificationPrefsCacheKey, jsonEncode(body));
      return _parseNotificationPreferencesFromBody(body);
    } on DioException catch (e) {
      final mapped = mapDioError(e);
      if (mapped.kind != ApiErrorKind.network) rethrow;

      final cached = await _cache.read(_notificationPrefsCacheKey);
      if (cached == null) throw mapped;

      final body = jsonDecode(cached.json) as Map<String, dynamic>;
      return _parseNotificationPreferencesFromBody(body);
    }
  }

  Future<void> setNotificationPreferences({
    bool? emailEnabled,
    bool? pushEnabled,
  }) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '/patient/notification-preferences',
        data: {
          ...?(emailEnabled == null ? null : {'emailNotificationsEnabled': emailEnabled}),
          ...?(pushEnabled == null ? null : {'pushNotificationsEnabled': pushEnabled}),
        },
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  PatientProfileDetails _parseProfile(Map<String, dynamic> map) {
    return PatientProfileDetails(
      id: map['id'] as String,
      fullName: map['fullName'] as String,
      email: map['email'] as String,
      phone: map['phone'] as String?,
      gender: map['gender'] as String?,
      dateOfBirth:
          map['dateOfBirth'] == null ? null : DateTime.parse(map['dateOfBirth'] as String),
      avatarUrl: map['avatarUrl'] as String?,
      emailNotificationsEnabled: true,
      pushNotificationsEnabled: true,
    );
  }

  PatientProfileDetails _parseProfileFromBody(Map<String, dynamic> body) {
    final data = body['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
    }
    return _parseProfile(data);
  }

  ({bool emailEnabled, bool pushEnabled}) _parseNotificationPreferencesFromBody(
    Map<String, dynamic> body,
  ) {
    final data = body['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
    }
    return (
      emailEnabled: (data['emailNotificationsEnabled'] as bool?) ?? true,
      pushEnabled: (data['pushNotificationsEnabled'] as bool?) ?? true,
    );
  }
}

