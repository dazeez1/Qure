import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../dashboard/data/patient_dashboard_api.dart';
import '../data/patient_appointments_api.dart';

Future<void> confirmAndCancelPatientAppointment(
  BuildContext context,
  WidgetRef ref, {
  required String appointmentId,
  required void Function() invalidateAppointmentCaches,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Cancel appointment?'),
      content: const Text(
        'This will cancel your booking. You can schedule a new one anytime.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Keep'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Cancel appointment'),
        ),
      ],
    ),
  );

  if (confirmed != true) {
    return;
  }

  try {
    await ref.read(patientAppointmentsApiProvider).cancelAppointment(appointmentId);
    if (!context.mounted) {
      return;
    }
    await AppToast.showSuccess(context, message: 'Appointment cancelled.');
    invalidateAppointmentCaches();
    ref.invalidate(patientDashboardProvider);
  } catch (e) {
    if (!context.mounted) {
      return;
    }
    await AppToast.showError(
      context,
      message: e is ApiException ? e.message : e.toString(),
    );
  }
}

Future<void> reschedulePatientAppointment(
  BuildContext context,
  WidgetRef ref, {
  required String appointmentId,
  required DateTime currentAppointmentDate,
  required void Function() invalidateAppointmentCaches,
}) async {
  final current = currentAppointmentDate.toLocal();
  final date = await showDatePicker(
    context: context,
    initialDate: current.isAfter(DateTime.now())
        ? current
        : DateTime.now().add(const Duration(days: 1)),
    firstDate: DateTime.now(),
    lastDate: DateTime.now().add(const Duration(days: 365)),
  );
  if (!context.mounted || date == null) {
    return;
  }

  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(current),
  );
  if (!context.mounted || time == null) {
    return;
  }

  final next = DateTime(
    date.year,
    date.month,
    date.day,
    time.hour,
    time.minute,
  );

  if (!next.isAfter(DateTime.now())) {
    await AppToast.showError(
      context,
      message: 'Pick a date and time in the future.',
    );
    return;
  }

  try {
    await ref.read(patientAppointmentsApiProvider).rescheduleAppointment(
          appointmentId: appointmentId,
          appointmentDate: next,
        );
    if (!context.mounted) {
      return;
    }
    await AppToast.showSuccess(context, message: 'Appointment rescheduled.');
    invalidateAppointmentCaches();
    ref.invalidate(patientDashboardProvider);
  } catch (e) {
    if (!context.mounted) {
      return;
    }
    await AppToast.showError(
      context,
      message: e is ApiException ? e.message : e.toString(),
    );
  }
}
