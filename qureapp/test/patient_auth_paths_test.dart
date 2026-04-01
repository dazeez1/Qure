import 'package:flutter_test/flutter_test.dart';
import 'package:qureapp/core/network/patient_auth_paths.dart';

void main() {
  group('isPatientAuthCredentialPath', () {
    test('login and register paths are excluded from session logout on 401', () {
      expect(isPatientAuthCredentialPath('/patient/auth/login'), isTrue);
      expect(isPatientAuthCredentialPath('/api/v1/patient/auth/login'), isTrue);
      expect(isPatientAuthCredentialPath('/patient/auth/register'), isTrue);
      expect(
        isPatientAuthCredentialPath('/prefix/patient/auth/register'),
        isTrue,
      );
    });

    test('other API paths are not excluded', () {
      expect(isPatientAuthCredentialPath('/patient/dashboard'), isFalse);
      expect(isPatientAuthCredentialPath('/patient/auth/refresh'), isFalse);
      expect(isPatientAuthCredentialPath('/patient/auth/forgot-password'), isFalse);
    });
  });
}
