class AppointmentListPage {
  const AppointmentListPage({
    required this.appointments,
    required this.currentPage,
    required this.totalPages,
    required this.total,
    required this.limit,
    required this.hasNextPage,
  });

  final List<PatientAppointment> appointments;
  final int currentPage;
  final int totalPages;
  final int total;
  final int limit;
  final bool hasNextPage;
}

class PatientAppointment {
  const PatientAppointment({
    required this.id,
    required this.appointmentDate,
    required this.status,
    required this.reason,
    required this.hospitalId,
    required this.hospitalName,
    required this.departmentName,
    required this.hasFeedback,
  });

  final String id;
  final DateTime appointmentDate;
  final String status;
  final String? reason;
  final String? hospitalId;
  final String? hospitalName;
  final String? departmentName;
  final bool hasFeedback;
}

