/// Helpers for JSON decoded with [dart:convert] / Dio, where numeric values
/// may be [int] or [double] depending on the payload.
int? parseJsonInt(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is int) {
    return value;
  }
  if (value is double) {
    return value.toInt();
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String) {
    return int.tryParse(value);
  }
  return null;
}

int parseJsonIntWithDefault(dynamic value, int fallback) {
  return parseJsonInt(value) ?? fallback;
}
