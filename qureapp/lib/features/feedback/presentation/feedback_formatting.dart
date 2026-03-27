import '../../appointments/domain/patient_appointment_models.dart';

String formatFeedbackLongDate(DateTime d) {
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
  return '${months[d.month - 1]} ${d.day}, ${d.year}';
}

/// Time + date label so multiple visits on the same day/dept stay distinguishable.
String formatAppointmentPickerLine(DateTime local, String? departmentName) {
  final datePart = formatFeedbackLongDate(local);
  final h = local.hour;
  final h12 = h % 12 == 0 ? 12 : h % 12;
  final mm = local.minute.toString().padLeft(2, '0');
  final ampm = h >= 12 ? 'PM' : 'AM';
  return '$datePart · $h12:$mm $ampm · ${departmentName ?? 'Visit'}';
}

String doctorDisplayLine(String? name) {
  if (name == null || name.trim().isEmpty) {
    return '—';
  }
  final t = name.trim();
  if (t.toLowerCase().startsWith('dr')) {
    return t;
  }
  return 'Dr. $t';
}

List<PatientAppointment> uniqueAppointmentsById(List<PatientAppointment> items) {
  final seen = <String>{};
  return [
    for (final a in items)
      if (seen.add(a.id)) a,
  ];
}
