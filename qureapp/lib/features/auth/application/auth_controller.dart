import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_session_repository.dart';
import '../data/patient_auth_api.dart';
import '../domain/patient_profile.dart';
import '../../../core/network/api_exception.dart';
import '../../push/application/push_token_registrar.dart';

final authControllerProvider = NotifierProvider<AuthController, AuthStateSnapshot>(
  AuthController.new,
);

class AuthStateSnapshot {
  const AuthStateSnapshot({
    required this.isLoading,
    required this.isAuthenticated,
    required this.patient,
    required this.changes,
  });

  final bool isLoading;
  final bool isAuthenticated;
  final PatientProfile? patient;

  /// Emits when auth changes; used to refresh routing decisions.
  final Stream<void> changes;
}

class AuthController extends Notifier<AuthStateSnapshot> {
  late final AuthSessionRepository _sessionRepository;
  late final PatientAuthApi _authApi;
  late final StreamController<void> _changesController;

  @override
  AuthStateSnapshot build() {
    _sessionRepository = ref.watch(authSessionRepositoryProvider);
    _authApi = ref.watch(patientAuthApiProvider);
    _changesController = StreamController<void>.broadcast();
    ref.onDispose(_changesController.close);

    Future<void>.microtask(_initialize);

    return AuthStateSnapshot(
      isLoading: true,
      isAuthenticated: false,
      patient: null,
      changes: _changesController.stream,
    );
  }

  Future<void> _initialize() async {
    final token = await _sessionRepository.readToken();
    final patient = await _sessionRepository.readPatientProfile();

    final isAuthenticated = token != null && token.isNotEmpty && patient != null;
    state = AuthStateSnapshot(
      isLoading: false,
      isAuthenticated: isAuthenticated,
      patient: patient,
      changes: _changesController.stream,
    );
    _changesController.add(null);

    if (isAuthenticated) {
      await ref.read(pushTokenRegistrarProvider).registerIfPossible();
    }
  }

  Future<ApiException?> login({
    required String email,
    required String password,
  }) async {
    try {
      final result = await _authApi.login(email: email, password: password);
      await _sessionRepository.saveSession(token: result.token, patient: result.patient);

      state = AuthStateSnapshot(
        isLoading: false,
        isAuthenticated: true,
        patient: result.patient,
        changes: _changesController.stream,
      );
      _changesController.add(null);

      await ref.read(pushTokenRegistrarProvider).registerIfPossible();
      return null;
    } on ApiException catch (e) {
      return e;
    }
  }

  Future<ApiException?> register({
    required String fullName,
    required String email,
    required String password,
    required String phone,
    required String gender,
  }) async {
    try {
      await _authApi.register(
        fullName: fullName,
        email: email,
        password: password,
        phone: phone,
        gender: gender,
      );
      return null;
    } on ApiException catch (e) {
      return e;
    }
  }

  Future<void> logout() async {
    await _sessionRepository.clearSession();
    state = AuthStateSnapshot(
      isLoading: false,
      isAuthenticated: false,
      patient: null,
      changes: _changesController.stream,
    );
    _changesController.add(null);
  }
}

