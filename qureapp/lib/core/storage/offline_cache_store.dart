import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

final offlineCacheStoreProvider = Provider<OfflineCacheStore>((ref) {
  return OfflineCacheStore();
});

class OfflineCacheStore {
  static const _boxName = 'offlineCache';

  Future<Box<dynamic>> _openBox() async {
    return Hive.openBox<dynamic>(_boxName);
  }

  Future<CachedPayload?> read(String key) async {
    final box = await _openBox();
    final raw = box.get(key);
    if (raw is Map) {
      final json = raw['json'];
      final storedAtMs = raw['storedAtMs'];
      if (json is String && storedAtMs is int) {
        return CachedPayload(json: json, storedAt: DateTime.fromMillisecondsSinceEpoch(storedAtMs));
      }
    }
    return null;
  }

  Future<void> write(String key, String json) async {
    final box = await _openBox();
    await box.put(key, {
      'json': json,
      'storedAtMs': DateTime.now().millisecondsSinceEpoch,
    });
  }
}

class CachedPayload {
  const CachedPayload({required this.json, required this.storedAt});

  final String json;
  final DateTime storedAt;
}

