import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final secureKeyValueStoreProvider = Provider<SecureKeyValueStore>((ref) {
  return SecureKeyValueStore(const FlutterSecureStorage());
});

class SecureKeyValueStore {
  SecureKeyValueStore(this._storage);

  final FlutterSecureStorage _storage;

  Future<String?> readString(String key) => _storage.read(key: key);

  Future<void> writeString(String key, String value) =>
      _storage.write(key: key, value: value);

  Future<void> delete(String key) => _storage.delete(key: key);

  Future<void> deleteAll() => _storage.deleteAll();
}

