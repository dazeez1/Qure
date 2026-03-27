class PatientQueueStatus {
  const PatientQueueStatus({
    required this.queueEntry,
    required this.positionInQueue,
    required this.estimatedWaitMinutes,
    required this.minWaitMinutes,
    required this.maxWaitMinutes,
  });

  final QueueEntryStatus? queueEntry;
  final int? positionInQueue;
  final int? estimatedWaitMinutes;
  final int? minWaitMinutes;
  final int? maxWaitMinutes;
}

class QueueEntryStatus {
  const QueueEntryStatus({
    required this.id,
    required this.hospitalId,
    required this.ticketNumber,
    required this.sequenceNumber,
    required this.status,
    required this.priority,
    required this.checkInTime,
    required this.departmentName,
    required this.assignedDoctorName,
    required this.assignedRoomName,
  });

  final String id;
  final String? hospitalId;
  final String ticketNumber;
  final int? sequenceNumber;
  final String status;
  final String? priority;
  final DateTime? checkInTime;
  final String? departmentName;
  final String? assignedDoctorName;
  final String? assignedRoomName;
}

