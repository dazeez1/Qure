class PatientDashboardData {
  const PatientDashboardData({
    required this.currentQueue,
    required this.upcomingAppointments,
    required this.notifications,
  });

  final CurrentQueueSummary? currentQueue;
  final List<AppointmentSummary> upcomingAppointments;
  final List<PatientNotificationSummary> notifications;
}

class CurrentQueueSummary {
  const CurrentQueueSummary({
    required this.ticketNumber,
    required this.status,
    required this.positionInQueue,
    required this.waitTimeDisplay,
    required this.estimatedWaitMinutes,
    required this.departmentName,
    required this.hospitalId,
  });

  final String ticketNumber;
  final String status;
  final int? positionInQueue;
  final String? waitTimeDisplay;
  final int? estimatedWaitMinutes;
  final String? departmentName;
  final String hospitalId;
}

class AppointmentSummary {
  const AppointmentSummary({
    required this.id,
    required this.appointmentDate,
    required this.status,
    required this.reason,
    required this.hospitalId,
    required this.hospitalName,
    required this.departmentName,
  });

  final String id;
  final DateTime appointmentDate;
  final String status;
  final String? reason;
  final String? hospitalId;
  final String? hospitalName;
  final String? departmentName;
}

class PatientNotificationSummary {
  const PatientNotificationSummary({
    required this.id,
    required this.title,
    required this.content,
    required this.isRead,
    required this.createdAt,
    required this.category,
    required this.priority,
  });

  final String id;
  final String title;
  final String content;
  final bool isRead;
  final DateTime createdAt;
  final String? category;
  final String? priority;
}

