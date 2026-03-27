import '../domain/patient_profile.dart';

class AuthState {
  const AuthState({
    required this.isLoading,
    required this.isAuthenticated,
    required this.patient,
  });

  final bool isLoading;
  final bool isAuthenticated;
  final PatientProfile? patient;

  AuthState copyWith({
    bool? isLoading,
    bool? isAuthenticated,
    PatientProfile? patient,
  }) {
    return AuthState(
      isLoading: isLoading ?? this.isLoading,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      patient: patient ?? this.patient,
    );
  }

  static const initial = AuthState(isLoading: true, isAuthenticated: false, patient: null);
}

