import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../domain/queue_preview_models.dart';

final queuePreviewApiProvider = Provider<QueuePreviewApi>((ref) {
  return QueuePreviewApi(ref.watch(dioProvider));
});

class QueuePreviewApi {
  QueuePreviewApi(this._dio);

  final Dio _dio;

  Future<List<QueuePreviewEntry>> fetchPreview({required String hospitalId}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/queue/preview',
        queryParameters: {'hospitalId': hospitalId},
      );
      final body = response.data ?? const <String, dynamic>{};
      final list = body['data'] as List<dynamic>? ?? [];
      return list
          .whereType<Map<String, dynamic>>()
          .map(QueuePreviewEntry.fromJson)
          .toList(growable: false);
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }
}
