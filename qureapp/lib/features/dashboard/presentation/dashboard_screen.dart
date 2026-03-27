import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../appointments/data/patient_appointments_api.dart';
import '../../notifications/data/patient_notifications_api.dart';
import '../../auth/application/auth_controller.dart';
import '../../profile/data/patient_profile_api.dart';
import '../../queue/data/patient_queue_api.dart';
import '../../queue/domain/patient_queue_models.dart';
import '../../shell/application/shell_tab_index_provider.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/patient_dashboard_api.dart';
import '../domain/patient_dashboard_models.dart';

const Color _kPrimaryBlue = Color(0xFF0B3F9A);
const Color _kQueueCardBg = Color(0xFFF2F4F7);
const Color _kBorderGrey = Color(0xFFE6E8EC);
const Color _kTextMuted = Color(0xFF6B7280);
const Color _kButtonBlue = Color(0xFF0B2E7A);
const Color _kAccentOrange = Color(0xFFFF8A2B);
const Color _kCancelRed = Color(0xFFE53935);

final patientDashboardFirstNameProvider =
    FutureProvider.autoDispose<String>((ref) async {
  try {
    final me = await ref.watch(patientProfileApiProvider).getMe();
    final parts = me.fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) {
      return 'there';
    }
    return parts.first;
  } catch (_) {
    final patient = ref.watch(authControllerProvider).patient;
    if (patient == null) {
      return 'there';
    }
    final parts = patient.fullName.trim().split(RegExp(r'\s+'));
    return parts.isEmpty ? 'there' : parts.first;
  }
});

final patientDashboardNotificationPrefsProvider =
    FutureProvider.autoDispose<({bool emailEnabled, bool pushEnabled})>((ref) async {
  return ref.watch(patientProfileApiProvider).getNotificationPreferences();
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: RefreshIndicator(
          color: _kPrimaryBlue,
          onRefresh: () async {
            ref.invalidate(patientDashboardProvider);
            ref.invalidate(patientQueueStatusProvider);
            ref.invalidate(patientDashboardFirstNameProvider);
            ref.invalidate(patientDashboardNotificationPrefsProvider);
            try {
              await ref.read(patientDashboardProvider.future);
            } catch (_) {}
            try {
              await ref.read(patientQueueStatusProvider.future);
            } catch (_) {}
          },
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const PatientTopBar(),
                      const SizedBox(height: 20),
                      _GreetingLine(
                        nameAsync: ref.watch(patientDashboardFirstNameProvider),
                      ),
                      const SizedBox(height: 20),
                      _QueueSection(ref: ref),
                      const SizedBox(height: 16),
                      _QuickActionsRow(ref: ref),
                      const SizedBox(height: 28),
                      const _SectionTitle('Upcoming Appointments'),
                      const SizedBox(height: 12),
                      _UpcomingAppointmentsBlock(ref: ref),
                      const SizedBox(height: 28),
                      _NotificationsCard(ref: ref),
                      const SizedBox(height: 16),
                      _FeedbackCard(ref: ref),
                      const SizedBox(height: 16),
                      const _NotificationSettingsCard(),
                      const SizedBox(height: 28),
                      _DashboardFooter(ref: ref),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GreetingLine extends StatelessWidget {
  const _GreetingLine({required this.nameAsync});

  final AsyncValue<String> nameAsync;

  @override
  Widget build(BuildContext context) {
    return nameAsync.when(
      data: (name) => Text(
        'Hi, $name',
        style: const TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: Color(0xFF111827),
          height: 1.15,
        ),
      ),
      loading: () => const Text(
        'Hi, …',
        style: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: Color(0xFF111827),
        ),
      ),
      error: (_, _) => const Text(
        'Hi, there',
        style: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: Color(0xFF111827),
        ),
      ),
    );
  }
}

class _QueueSection extends StatelessWidget {
  const _QueueSection({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(patientQueueStatusProvider);
    return async.when(
      data: (status) => _QueueCard(
        status: status,
        ref: ref,
      ),
      loading: () => const _QueueCardPlaceholder(),
      error: (e, _) => _QueueCardError(message: e.toString()),
    );
  }
}

class _QueueCardPlaceholder extends StatelessWidget {
  const _QueueCardPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 140,
      decoration: BoxDecoration(
        color: _kQueueCardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kBorderGrey),
      ),
      alignment: Alignment.center,
      child: const SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimaryBlue),
      ),
    );
  }
}

class _QueueCardError extends StatelessWidget {
  const _QueueCardError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _kQueueCardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kBorderGrey),
      ),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
      ),
    );
  }
}

class _QueueCard extends StatelessWidget {
  const _QueueCard({
    required this.status,
    required this.ref,
  });

  final PatientQueueStatus? status;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final entry = status?.queueEntry;
    if (entry == null) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: _kQueueCardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _kBorderGrey),
        ),
        child: const Text(
          'You’re not in a queue right now.',
          style: TextStyle(
            fontSize: 14.5,
            color: _kTextMuted,
            height: 1.35,
          ),
        ),
      );
    }

    final waitMinutes = status?.estimatedWaitMinutes;
    final etaText = waitMinutes == null ? '—' : 'ETA: $waitMinutes mins';

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        color: _kQueueCardBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kBorderGrey),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'You are in a queue',
            style: TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w600,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                entry.ticketNumber,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF111827),
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                etaText,
                style: const TextStyle(
                  fontSize: 14.5,
                  color: _kTextMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: _kButtonBlue,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () =>
                        ref.read(shellTabIndexProvider.notifier).goTo(2),
                    child: const Text(
                      'VIEW QUEUE',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 44,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF111827),
                      side: const BorderSide(color: _kBorderGrey, width: 1.2),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () => _confirmCancelQueue(context, ref, entry.id),
                    child: const Text(
                      'CANCEL',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> _confirmCancelQueue(
  BuildContext context,
  WidgetRef ref,
  String queueEntryId,
) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Cancel queue?'),
      content: const Text(
        'Are you sure you want to leave the queue? You can join again later.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('No'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('Yes, cancel'),
        ),
      ],
    ),
  );

  if (confirmed != true) {
    return;
  }

  try {
    await ref.read(patientQueueApiProvider).cancelQueueEntry(queueEntryId);
    if (!context.mounted) {
      return;
    }
    await AppToast.showSuccess(context, message: 'Queue entry cancelled.');
    ref.invalidate(patientQueueStatusProvider);
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

class _QuickActionsRow extends StatelessWidget {
  const _QuickActionsRow({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _QuickActionButton(
            icon: Icons.people_outline,
            label: 'Live Queue Preview',
            onTap: () {
              ref.read(shellTabIndexProvider.notifier).goTo(2);
            },
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _QuickActionButton(
            icon: Icons.calendar_today_outlined,
            label: 'Book Appointment',
            onTap: () {
              context.push('/book-appointment');
            },
          ),
        ),
      ],
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  const _QuickActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      elevation: 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _kBorderGrey),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 10,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Row(
            children: [
              Icon(icon, size: 20, color: _kPrimaryBlue),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF111827),
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        color: Color(0xFF111827),
      ),
    );
  }
}

class _UpcomingAppointmentsBlock extends StatelessWidget {
  const _UpcomingAppointmentsBlock({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(patientDashboardProvider);
    return async.when(
      data: (data) {
        if (data.upcomingAppointments.isEmpty) {
          return const Text(
            'No upcoming appointments.',
            style: TextStyle(color: _kTextMuted, fontSize: 14.5),
          );
        }
        return Column(
          children: data.upcomingAppointments
              .map(
                (apt) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _AppointmentCard(appointment: apt, ref: ref),
                ),
              )
              .toList(),
        );
      },
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimaryBlue),
          ),
        ),
      ),
      error: (e, _) => Text(
        e.toString(),
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}

class _AppointmentCard extends StatelessWidget {
  const _AppointmentCard({
    required this.appointment,
    required this.ref,
  });

  final AppointmentSummary appointment;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final d = appointment.appointmentDate.toLocal();

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorderGrey),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 4,
                child: Text(
                  _formatLongDate(d),
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              Expanded(
                flex: 3,
                child: Text(
                  _formatTime(d),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
              Expanded(
                flex: 3,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: InkWell(
                    onTap: () => _rescheduleAppointment(context, ref, appointment),
                    child: const Text(
                      'Reschedule',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _kPrimaryBlue,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 4,
                child: Text(
                  'Dr. to be assigned',
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
              ),
              Expanded(
                flex: 3,
                child: Text(
                  appointment.departmentName ?? 'Department',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade600,
                  ),
                ),
              ),
              Expanded(
                flex: 3,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: InkWell(
                    onTap: () =>
                        _confirmCancelAppointment(context, ref, appointment.id),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _kCancelRed,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> _confirmCancelAppointment(
  BuildContext context,
  WidgetRef ref,
  String appointmentId,
) async {
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

Future<void> _rescheduleAppointment(
  BuildContext context,
  WidgetRef ref,
  AppointmentSummary appointment,
) async {
  final current = appointment.appointmentDate.toLocal();
  final date = await showDatePicker(
    context: context,
    initialDate: current.isAfter(DateTime.now()) ? current : DateTime.now().add(const Duration(days: 1)),
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
          appointmentId: appointment.id,
          appointmentDate: next,
        );
    if (!context.mounted) {
      return;
    }
    await AppToast.showSuccess(context, message: 'Appointment rescheduled.');
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

class _NotificationsCard extends StatelessWidget {
  const _NotificationsCard({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(patientDashboardProvider);
    return async.when(
      data: (data) => _NotificationsCardContent(
        notifications: data.notifications,
      ),
      loading: () => const _ElevatedPlaceholder(height: 100),
      error: (e, _) => Text(
        e.toString(),
        style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
      ),
    );
  }
}

class _NotificationsCardContent extends ConsumerStatefulWidget {
  const _NotificationsCardContent({required this.notifications});

  final List<PatientNotificationSummary> notifications;

  @override
  ConsumerState<_NotificationsCardContent> createState() =>
      _NotificationsCardContentState();
}

class _NotificationsCardContentState
    extends ConsumerState<_NotificationsCardContent> {
  late final PageController _pageController;
  int _pageIndex = 0;

  /// Expanded body text by notification id (carousel index can shift).
  final Map<String, bool> _expandedByNotificationId = {};

  bool _bulkBusy = false;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
  }

  @override
  void didUpdateWidget(covariant _NotificationsCardContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    final list = widget.notifications.take(12).toList();
    if (list.isNotEmpty && _pageIndex >= list.length) {
      _pageIndex = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pageController.hasClients) {
          _pageController.jumpToPage(0);
        }
      });
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _markAllAsRead() async {
    final list = widget.notifications.take(12).toList();
    if (_bulkBusy || list.isEmpty) {
      return;
    }
    final hasUnread = list.any((n) => !n.isRead);
    if (!hasUnread) {
      await AppToast.showInfo(context, message: 'No unread notifications.');
      return;
    }
    setState(() => _bulkBusy = true);
    try {
      await ref.read(patientNotificationsApiProvider).markAllAsRead();
      if (!mounted) {
        return;
      }
      ref.invalidate(patientDashboardProvider);
      await AppToast.showSuccess(
        context,
        message: 'All notifications marked as read.',
      );
    } on ApiException catch (e) {
      if (mounted) {
        await AppToast.showError(context, message: e.message);
      }
    } catch (e) {
      if (mounted) {
        await AppToast.showError(context, message: e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _bulkBusy = false);
      }
    }
  }

  Future<void> _clearReadNotifications() async {
    final list = widget.notifications.take(12).toList();
    if (_bulkBusy || list.isEmpty) {
      return;
    }
    final hasRead = list.any((n) => n.isRead);
    if (!hasRead) {
      await AppToast.showInfo(context, message: 'No read notifications to clear.');
      return;
    }
    setState(() => _bulkBusy = true);
    try {
      await ref.read(patientNotificationsApiProvider).clearAllRead();
      if (!mounted) {
        return;
      }
      ref.invalidate(patientDashboardProvider);
      await AppToast.showSuccess(
        context,
        message: 'Read notifications cleared.',
      );
    } on ApiException catch (e) {
      if (mounted) {
        await AppToast.showError(context, message: e.message);
      }
    } catch (e) {
      if (mounted) {
        await AppToast.showError(context, message: e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _bulkBusy = false);
      }
    }
  }

  static bool _needsSeeMore(String primary) {
    return primary.trim().length > 100;
  }

  double _slideHeightFor(PatientNotificationSummary n) {
    final primary = n.content.trim().isNotEmpty
        ? n.content.trim()
        : n.title.trim();
    final showTitle = n.title.trim().isNotEmpty &&
        n.content.trim().isNotEmpty &&
        n.title.trim() != primary;
    if (!_needsSeeMore(primary)) {
      return showTitle ? 108.0 : 88.0;
    }
    final expanded = _expandedByNotificationId[n.id] ?? false;
    if (expanded) {
      return showTitle ? 220.0 : 200.0;
    }
    return showTitle ? 132.0 : 118.0;
  }

  Future<void> _onOpen(PatientNotificationSummary n) async {
    if (n.isRead) {
      return;
    }
    try {
      await ref.read(patientNotificationsApiProvider).markAsRead(n.id);
      if (mounted) {
        ref.invalidate(patientDashboardProvider);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final list = widget.notifications.take(12).toList();
    final hasUnread = list.any((n) => !n.isRead);
    final hasRead = list.any((n) => n.isRead);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.07),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: _kBorderGrey.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.notifications_outlined,
                color: _kPrimaryBlue,
                size: 22,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Notifications',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0B2E7A),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Mark all as read',
                onPressed: _bulkBusy || list.isEmpty || !hasUnread
                    ? null
                    : _markAllAsRead,
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(
                  minWidth: 36,
                  minHeight: 36,
                ),
                icon: Icon(
                  Icons.done_all_rounded,
                  size: 22,
                  color: hasUnread && !_bulkBusy
                      ? _kPrimaryBlue
                      : _kTextMuted,
                ),
              ),
              IconButton(
                tooltip: 'Clear read notifications',
                onPressed: _bulkBusy || list.isEmpty || !hasRead
                    ? null
                    : _clearReadNotifications,
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(
                  minWidth: 36,
                  minHeight: 36,
                ),
                icon: Icon(
                  Icons.clear_all_rounded,
                  size: 22,
                  color: hasRead && !_bulkBusy ? _kPrimaryBlue : _kTextMuted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (list.isEmpty)
            const Text(
              'You’re all caught up.',
              style: TextStyle(color: _kTextMuted, fontSize: 14.5),
            )
          else ...[
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              height: _slideHeightFor(list[_pageIndex]),
              child: PageView.builder(
                controller: _pageController,
                itemCount: list.length,
                onPageChanged: (i) => setState(() => _pageIndex = i),
                itemBuilder: (context, index) {
                  final n = list[index];
                  final primary = n.content.trim().isNotEmpty
                      ? n.content.trim()
                      : n.title.trim();
                  final showTitle = n.title.trim().isNotEmpty &&
                      n.content.trim().isNotEmpty &&
                      n.title.trim() != primary;
                  final needsMore = _needsSeeMore(primary);
                  final expanded = _expandedByNotificationId[n.id] ?? false;

                  return Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InkWell(
                          onTap: () => _onOpen(n),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            margin: const EdgeInsets.only(top: 4),
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: n.isRead
                                  ? Colors.transparent
                                  : _kAccentOrange,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (showTitle) ...[
                                InkWell(
                                  onTap: () => _onOpen(n),
                                  child: Text(
                                    n.title.trim(),
                                    style: TextStyle(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.grey.shade800,
                                      height: 1.25,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 4),
                              ],
                              if (needsMore && expanded)
                                Expanded(
                                  child: SingleChildScrollView(
                                    child: InkWell(
                                      onTap: () => _onOpen(n),
                                      child: Text(
                                        primary,
                                        style: const TextStyle(
                                          fontSize: 14.5,
                                          color: Color(0xFF111827),
                                          height: 1.35,
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                              else
                                InkWell(
                                  onTap: () => _onOpen(n),
                                  child: Text(
                                    primary,
                                    maxLines: needsMore ? 3 : null,
                                    overflow: needsMore
                                        ? TextOverflow.ellipsis
                                        : TextOverflow.clip,
                                    style: const TextStyle(
                                      fontSize: 14.5,
                                      color: Color(0xFF111827),
                                      height: 1.35,
                                    ),
                                  ),
                                ),
                              if (needsMore) ...[
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton(
                                    style: TextButton.styleFrom(
                                      padding: const EdgeInsets.only(top: 2),
                                      minimumSize: Size.zero,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                    onPressed: () {
                                      setState(() {
                                        _expandedByNotificationId[n.id] =
                                            !expanded;
                                      });
                                    },
                                    child: Text(
                                      expanded ? 'See less' : 'See more',
                                      style: TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w600,
                                        color: _kPrimaryBlue,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                              InkWell(
                                onTap: () => _onOpen(n),
                                child: Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    _formatRelativeTime(n.createdAt),
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            if (list.length > 1) ...[
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  list.length,
                  (i) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Container(
                      width: i == _pageIndex ? 8 : 6,
                      height: i == _pageIndex ? 8 : 6,
                      decoration: BoxDecoration(
                        color: i == _pageIndex
                            ? _kPrimaryBlue
                            : _kBorderGrey,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _FeedbackCard extends StatelessWidget {
  const _FeedbackCard({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.07),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: _kBorderGrey.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.chat_bubble_outline_rounded,
                  color: Colors.grey.shade800, size: 22),
              const SizedBox(width: 8),
              const Text(
                'Have Feedback?',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF111827),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          InkWell(
            onTap: () {
              ref.read(shellTabIndexProvider.notifier).goTo(3);
            },
            child: const Text(
              'Let us know',
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
                color: _kPrimaryBlue,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationSettingsCard extends ConsumerStatefulWidget {
  const _NotificationSettingsCard();

  @override
  ConsumerState<_NotificationSettingsCard> createState() =>
      _NotificationSettingsCardState();
}

class _NotificationSettingsCardState
    extends ConsumerState<_NotificationSettingsCard> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(patientDashboardNotificationPrefsProvider);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.07),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(color: _kBorderGrey.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.tune_rounded, color: Colors.grey.shade800, size: 22),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'How should we notify you?',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF111827),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          prefs.when(
            data: (p) => Row(
              children: [
                const Text(
                  'Email',
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF111827),
                  ),
                ),
                const Spacer(),
                Switch.adaptive(
                  value: p.emailEnabled,
                  activeTrackColor: _kPrimaryBlue.withValues(alpha: 0.4),
                  activeThumbColor: Colors.white,
                  onChanged: _busy
                      ? null
                      : (v) => _onEmailToggle(context, ref, v),
                ),
              ],
            ),
            loading: () => const LinearProgressIndicator(minHeight: 2),
            error: (e, _) => Text(
              e.toString(),
              style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onEmailToggle(
    BuildContext context,
    WidgetRef ref,
    bool enabled,
  ) async {
    setState(() => _busy = true);
    try {
      await ref.read(patientProfileApiProvider).setNotificationPreferences(
            emailEnabled: enabled,
          );
      ref.invalidate(patientDashboardNotificationPrefsProvider);
      if (context.mounted) {
        await AppToast.showSuccess(
          context,
          message: enabled ? 'Email notifications on.' : 'Email notifications off.',
        );
      }
    } catch (e) {
      if (context.mounted) {
        await AppToast.showError(
          context,
          message: e is ApiException ? e.message : e.toString(),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }
}

class _ElevatedPlaceholder extends StatelessWidget {
  const _ElevatedPlaceholder({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kBorderGrey),
      ),
      alignment: Alignment.center,
      child: const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimaryBlue),
      ),
    );
  }
}

class _DashboardFooter extends StatelessWidget {
  const _DashboardFooter({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '© 2025 Qure Nigeria. All rights reserved.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11.5,
            color: Colors.grey.shade500,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _FooterTextLink(
              label: 'Privacy Policy',
              onTap: () => AppToast.showInfo(
                context,
                message: 'Privacy Policy screen will be added next.',
              ),
            ),
            _FooterDot(color: Colors.grey.shade500),
            _FooterTextLink(
              label: 'Terms of Service',
              onTap: () => context.push('/terms'),
            ),
            _FooterDot(color: Colors.grey.shade500),
            _FooterTextLink(
              label: 'Cookie Settings',
              onTap: () => AppToast.showInfo(
                context,
                message: 'Cookie settings are not used in the mobile app.',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _FooterDot extends StatelessWidget {
  const _FooterDot({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Text('•', style: TextStyle(color: color, fontSize: 11)),
    );
  }
}

class _FooterTextLink extends StatelessWidget {
  const _FooterTextLink({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.5,
          color: Colors.grey.shade600,
          decoration: TextDecoration.underline,
        ),
      ),
    );
  }
}

String _formatLongDate(DateTime d) {
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

String _formatTime(DateTime d) {
  final hour24 = d.hour;
  final minute = d.minute.toString().padLeft(2, '0');
  final period = hour24 >= 12 ? 'PM' : 'AM';
  final h12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
  return '$h12:$minute $period';
}

String _formatRelativeTime(DateTime t) {
  final diff = DateTime.now().difference(t);
  if (diff.inSeconds < 60) {
    return 'Just now';
  }
  if (diff.inMinutes < 60) {
    final m = diff.inMinutes;
    return '$m minute${m == 1 ? '' : 's'} ago';
  }
  if (diff.inHours < 24) {
    final h = diff.inHours;
    return '$h hour${h == 1 ? '' : 's'} ago';
  }
  final days = diff.inDays;
  return '$days day${days == 1 ? '' : 's'} ago';
}
