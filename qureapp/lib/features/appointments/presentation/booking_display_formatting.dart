/// Formats a local [DateTime] like "March 29, 2026 2:50PM" for booking cards.
String formatBookingCardDateTime(DateTime d) {
  final local = d.toLocal();
  const months = <String>[
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  final h = local.hour;
  final h12 = h % 12 == 0 ? 12 : h % 12;
  final mm = local.minute.toString().padLeft(2, '0');
  final ampm = h >= 12 ? 'PM' : 'AM';
  return '${months[local.month - 1]} ${local.day}, ${local.year} $h12:$mm$ampm';
}
