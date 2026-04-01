import 'package:flutter_test/flutter_test.dart';
import 'package:qureapp/core/network/api_exception.dart';

void main() {
  group('userFacingErrorMessage', () {
    test('returns ApiException.message, not toString()', () {
      final e = ApiException(
        'Session expired. Please log in again.',
        kind: ApiErrorKind.unauthorized,
        statusCode: 401,
      );
      expect(
        userFacingErrorMessage(e),
        'Session expired. Please log in again.',
      );
      expect(
        userFacingErrorMessage(e),
        isNot(contains('ApiException')),
      );
    });

    test('falls back to toString for non-ApiException', () {
      expect(userFacingErrorMessage('plain'), 'plain');
    });
  });
}
