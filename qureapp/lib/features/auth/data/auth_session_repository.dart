import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/secure_key_value_store.dart';
import '../domain/patient_profile.dart';

final authSessionRepositoryProvider = Provider<AuthSessionRepository>((ref) {
  final store = ref.watch(secureKeyValueStoreProvider);
  return AuthSessionRepository(store);
});

class AuthSessionRepository {
  AuthSessionRepository(this._store);

  static const _tokenKey = 'patientAuthToken';
  static const _patientKey = 'patientProfile';

  final SecureKeyValueStore _store;

  Future<String?> readToken() => _store.readString(_tokenKey);

  Future<void> saveSession({
    required String token,
    required PatientProfile patient,
  }) async {
    await _store.writeString(_tokenKey, token);
    await _store.writeString(_patientKey, jsonEncode(_toJson(patient)));
  }

  Future<PatientProfile?> readPatientProfile() async {
    final raw = await _store.readString(_patientKey);
    if (raw == null || raw.isEmpty) return null;

    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return PatientProfile(
        id: map['id'] as String,
        fullName: map['fullName'] as String,
        email: map['email'] as String,
        phone: map['phone'] as String?,
        avatarUrl: map['avatarUrl'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> clearSession() async {
    await _store.delete(_tokenKey);
    await _store.delete(_patientKey);
  }

  Map<String, dynamic> _toJson(PatientProfile patient) {
    return {
      'id': patient.id,
      'fullName': patient.fullName,
      'email': patient.email,
      'phone': patient.phone,
      'avatarUrl': patient.avatarUrl,
    };
  }
}

