import '../../../core/utils/json_numbers.dart';

class QueuePreviewEntry {
  const QueuePreviewEntry({
    required this.ticketNumber,
    required this.patientName,
    required this.patientId,
    required this.departmentName,
    required this.status,
    required this.estimatedWait,
    required this.waitTimeDisplay,
  });

  final String ticketNumber;
  final String patientName;
  final String patientId;
  final String departmentName;
  final String status;
  final int? estimatedWait;
  final String? waitTimeDisplay;

  factory QueuePreviewEntry.fromJson(Map<String, dynamic> json) {
    return QueuePreviewEntry(
      ticketNumber: json['ticketNumber'] as String? ?? '',
      patientName: json['patientName'] as String? ?? '',
      patientId: json['patientId'] as String? ?? '',
      departmentName: json['departmentName'] as String? ?? '',
      status: json['status'] as String? ?? '',
      estimatedWait: parseJsonInt(json['estimatedWait']),
      waitTimeDisplay: json['waitTimeDisplay'] as String?,
    );
  }
}
