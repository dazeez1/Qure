import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/utils/json_numbers.dart';
import '../domain/patient_queue_models.dart';

final patientQueueApiProvider = Provider<PatientQueueApi>((ref) {
  final dio = ref.watch(dioProvider);
  return PatientQueueApi(dio);
});

final patientQueueStatusProvider =
    FutureProvider.autoDispose<PatientQueueStatus?>((ref) async {
  final api = ref.watch(patientQueueApiProvider);
  return api.getQueueStatus();
});

class PatientQueueApi {
  PatientQueueApi(this._dio);

  final Dio _dio;

  Future<PatientQueueStatus?> getQueueStatus() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/patient/queue-status');
      final body = response.data;
      final data = body?['data'];
      if (data == null) return null;

      final map = data as Map<String, dynamic>;
      final queueEntryMap = map['queueEntry'] as Map<String, dynamic>?;

      final queueEntry = queueEntryMap == null ? null : _parseQueueEntry(queueEntryMap);
      return PatientQueueStatus(
        queueEntry: queueEntry,
        positionInQueue: parseJsonInt(map['positionInQueue']),
        estimatedWaitMinutes: parseJsonInt(map['estimatedWaitMinutes']),
        minWaitMinutes: parseJsonInt(map['minWaitMinutes']),
        maxWaitMinutes: parseJsonInt(map['maxWaitMinutes']),
      );
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  Future<void> cancelQueueEntry(String queueEntryId) async {
    try {
      await _dio.patch<Map<String, dynamic>>('/patient/queue/$queueEntryId/cancel');
    } on DioException catch (e) {
      throw mapDioError(e);
    }
  }

  QueueEntryStatus _parseQueueEntry(Map<String, dynamic> map) {
    final department = map['department'] as Map<String, dynamic>?;
    final assignedDoctor = map['assignedDoctor'] as Map<String, dynamic>?;
    final assignedRoom = map['assignedRoom'] as Map<String, dynamic>?;

    final doctorName = assignedDoctor == null
        ? null
        : '${assignedDoctor['firstName'] ?? ''} ${assignedDoctor['lastName'] ?? ''}'.trim();

    return QueueEntryStatus(
      id: map['id'] as String,
      hospitalId: map['hospitalId'] as String?,
      ticketNumber: (map['ticketNumber'] as String?) ?? '',
      sequenceNumber: parseJsonInt(map['sequenceNumber']),
      status: (map['status'] as String?) ?? '',
      priority: map['priority'] as String?,
      checkInTime: map['checkInTime'] == null ? null : DateTime.parse(map['checkInTime'] as String),
      departmentName: department?['name'] as String?,
      assignedDoctorName: doctorName?.isEmpty == true ? null : doctorName,
      assignedRoomName: assignedRoom?['name'] as String?,
    );
  }
}

