import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/offline_cache_store.dart';
import '../domain/announcement_models.dart';

final patientAnnouncementsApiProvider = Provider<PatientAnnouncementsApi>((ref) {
  final dio = ref.watch(dioProvider);
  final cache = ref.watch(offlineCacheStoreProvider);
  return PatientAnnouncementsApi(dio, cache);
});

class PatientAnnouncementsApi {
  PatientAnnouncementsApi(this._dio, this._cache);

  final Dio _dio;
  final OfflineCacheStore _cache;

  static const _cacheKey = 'patientAnnouncements';

  Future<List<PatientAnnouncement>> getAnnouncements() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/patient/announcements');
      final body = response.data ?? const <String, dynamic>{};
      await _cache.write(_cacheKey, jsonEncode(body));
      return _parseAnnouncementsFromBody(body);
    } on DioException catch (e) {
      final mapped = mapDioError(e);
      if (mapped.kind != ApiErrorKind.network) rethrow;

      final cached = await _cache.read(_cacheKey);
      if (cached == null) throw mapped;

      final body = jsonDecode(cached.json) as Map<String, dynamic>;
      return _parseAnnouncementsFromBody(body);
    }
  }

  List<PatientAnnouncement> _parseAnnouncementsFromBody(Map<String, dynamic> body) {
    final data = body['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw ApiException('Unexpected response from server.', kind: ApiErrorKind.unknown);
    }

    final announcementsRaw = (data['announcements'] as List<dynamic>? ?? []);
    return announcementsRaw
        .whereType<Map<String, dynamic>>()
        .map(_parseAnnouncement)
        .toList(growable: false);
  }

  PatientAnnouncement _parseAnnouncement(Map<String, dynamic> map) {
    return PatientAnnouncement(
      id: map['id'] as String,
      title: (map['title'] as String?) ?? '',
      content: (map['content'] as String?) ?? '',
      createdAt: DateTime.parse(map['createdAt'] as String),
    );
  }
}

