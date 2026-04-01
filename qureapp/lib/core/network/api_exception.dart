enum ApiErrorKind {
  network,
  unauthorized,
  forbidden,
  validation,
  server,
  unknown,
}

class ApiException implements Exception {
  ApiException(this.message, {required this.kind, this.statusCode});

  final String message;
  final ApiErrorKind kind;
  final int? statusCode;

  @override
  String toString() => 'ApiException(kind: $kind, statusCode: $statusCode, message: $message)';
}

/// Text for AsyncValue / UI error slots (prefer short [message], not full [toString]).
String userFacingErrorMessage(Object error) {
  if (error is ApiException) {
    return error.message;
  }
  return error.toString();
}

