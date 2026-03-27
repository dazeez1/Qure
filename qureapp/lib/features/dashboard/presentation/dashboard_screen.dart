import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ui/app_toast.dart';
import '../../notifications/data/patient_notifications_api.dart';
import '../../queue/data/patient_queue_api.dart';
import '../../queue/domain/patient_queue_models.dart';
import '../data/patient_dashboard_api.dart';
import '../domain/patient_dashboard_models.dart';

final patientDashboardProvider = FutureProvider.autoDispose<PatientDashboardData>((ref) async {
  final api = ref.watch(patientDashboardApiProvider);
  return api.fetchDashboard();
});

final patientQueueStatusProvider = FutureProvider.autoDispose<PatientQueueStatus?>((ref) async {
  final api = ref.watch(patientQueueApiProvider);
  return api.getQueueStatus();
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(patientDashboardProvider);
    final queueStatus = ref.watch(patientQueueStatusProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(patientDashboardProvider);
            ref.invalidate(patientQueueStatusProvider);
            await ref.read(patientDashboardProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text('Home', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 16),
              _SectionCard(
                title: 'Your queue',
                child: queueStatus.when(
                  data: (data) => _QueueStatusView(
                    status: data,
                    onCancel: data?.queueEntry == null
                        ? null
                        : () => _cancelQueueEntry(context, ref, data!.queueEntry!.id),
                  ),
                  error: (e, _) => _ErrorRow(message: e.toString()),
                  loading: () => const _LoadingRow(),
                ),
              ),
              const SizedBox(height: 16),
              _SectionCard(
                title: 'Upcoming appointments',
                child: dashboard.when(
                  data: (data) => _AppointmentsPreview(appointments: data.upcomingAppointments),
                  error: (e, _) => _ErrorRow(message: e.toString()),
                  loading: () => const _LoadingRow(),
                ),
              ),
              const SizedBox(height: 16),
              _SectionCard(
                title: 'Notifications',
                child: dashboard.when(
                  data: (data) => _NotificationsPreview(notifications: data.notifications),
                  error: (e, _) => _ErrorRow(message: e.toString()),
                  loading: () => const _LoadingRow(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _cancelQueueEntry(
    BuildContext context,
    WidgetRef ref,
    String queueEntryId,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel queue?'),
        content: const Text('Are you sure you want to cancel your queue entry?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('No')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Yes, cancel')),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(patientQueueApiProvider).cancelQueueEntry(queueEntryId);
      if (!context.mounted) return;
      await AppToast.showSuccess(context, message: 'Queue entry cancelled.');
      ref.invalidate(patientQueueStatusProvider);
      ref.invalidate(patientDashboardProvider);
    } catch (e) {
      if (!context.mounted) return;
      await AppToast.showError(context, message: e.toString());
    }
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6E8EC)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _LoadingRow extends StatelessWidget {
  const _LoadingRow();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 12),
          Text('Loading...'),
        ],
      ),
    );
  }
}

class _ErrorRow extends StatelessWidget {
  const _ErrorRow({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: TextStyle(color: Theme.of(context).colorScheme.error),
    );
  }
}

class _QueueStatusView extends StatelessWidget {
  const _QueueStatusView({required this.status, required this.onCancel});

  final PatientQueueStatus? status;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final entry = status?.queueEntry;
    if (entry == null) {
      return const Text('You are not currently in a queue.');
    }

    final wait = status?.estimatedWaitMinutes;
    final waitText = wait == null ? '—' : '$wait min';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Ticket: ${entry.ticketNumber}'),
        const SizedBox(height: 4),
        Text('Status: ${entry.status}'),
        const SizedBox(height: 4),
        Text('Estimated wait: $waitText'),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: FilledButton.tonal(
                onPressed: onCancel,
                child: const Text('Cancel queue'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _AppointmentsPreview extends StatelessWidget {
  const _AppointmentsPreview({required this.appointments});

  final List<AppointmentSummary> appointments;

  @override
  Widget build(BuildContext context) {
    if (appointments.isEmpty) {
      return const Text('No upcoming appointments.');
    }

    return Column(
      children: appointments
          .map(
            (apt) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(apt.departmentName ?? 'Appointment'),
              subtitle: Text('${apt.hospitalName ?? ''} • ${apt.appointmentDate.toLocal()}'),
              trailing: Text(apt.status),
            ),
          )
          .toList(growable: false),
    );
  }
}

class _NotificationsPreview extends ConsumerWidget {
  const _NotificationsPreview({required this.notifications});

  final List<PatientNotificationSummary> notifications;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (notifications.isEmpty) {
      return const Text('No notifications yet.');
    }

    return Column(
      children: notifications
          .take(5)
          .map(
            (notif) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(notif.title),
              subtitle: Text(notif.content, maxLines: 2, overflow: TextOverflow.ellipsis),
              trailing: notif.isRead ? const SizedBox.shrink() : const Icon(Icons.circle, size: 10),
              onTap: notif.isRead
                  ? null
                  : () async {
                      try {
                        await ref.read(patientNotificationsApiProvider).markAsRead(notif.id);
                        ref.invalidate(patientDashboardProvider);
                        if (context.mounted) {
                          await AppToast.showInfo(context, message: 'Marked as read.');
                        }
                      } catch (e) {
                        if (context.mounted) {
                          await AppToast.showError(context, message: e.toString());
                        }
                      }
                    },
            ),
          )
          .toList(growable: false),
    );
  }
}

