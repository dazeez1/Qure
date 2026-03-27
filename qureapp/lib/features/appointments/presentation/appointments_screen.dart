import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/patient_legal_footer.dart';
import '../../feedback/data/patient_feedback_appointments_provider.dart';
import '../../feedback/data/patient_feedback_api.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/patient_appointments_api.dart';
import '../domain/patient_appointment_models.dart';
import 'booking_display_formatting.dart';
import 'patient_appointment_actions.dart';

const Color _kCardBlue = Color(0xFFE8F0FE);
const Color _kNavyButton = Color(0xFF0B2E7A);
const Color _kCancelBrown = Color(0xFF9A3412);
const Color _kTitle = Color(0xFF111827);

class AppointmentsScreen extends ConsumerStatefulWidget {
  const AppointmentsScreen({super.key});

  @override
  ConsumerState<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends ConsumerState<AppointmentsScreen> {
  String? _selectedStatus;

  void _invalidateAppointmentCaches() {
    ref.invalidate(patientAppointmentsProvider(_selectedStatus));
    ref.invalidate(patientFeedbackAppointmentCandidatesProvider);
  }

  List<Widget> _bookingContentSlivers(
    BuildContext context,
    AsyncValue<AppointmentListPage> page,
  ) {
    return page.when(
      data: (data) {
        if (data.appointments.isEmpty) {
          return [
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: Text(
                    'No appointments found.',
                    style: TextStyle(color: _kTitle, fontSize: 15),
                  ),
                ),
              ),
            ),
          ];
        }
        return [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final appointment = data.appointments[index];
                  final isLast = index == data.appointments.length - 1;
                  return Padding(
                    padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
                    child: _BookingCard(
                      appointment: appointment,
                      onLeaveFeedback:
                          appointment.status == 'COMPLETED' && !appointment.hasFeedback
                              ? () => _openFeedback(context, appointment.id)
                              : null,
                      onReschedule: appointment.status == 'BOOKED'
                          ? () => reschedulePatientAppointment(
                                context,
                                ref,
                                appointmentId: appointment.id,
                                currentAppointmentDate: appointment.appointmentDate,
                                invalidateAppointmentCaches: _invalidateAppointmentCaches,
                              )
                          : null,
                      onCancel: appointment.status == 'BOOKED'
                          ? () => confirmAndCancelPatientAppointment(
                                context,
                                ref,
                                appointmentId: appointment.id,
                                invalidateAppointmentCaches: _invalidateAppointmentCaches,
                              )
                          : null,
                    ),
                  );
                },
                childCount: data.appointments.length,
              ),
            ),
          ),
        ];
      },
      loading: () => [
        const SliverFillRemaining(
          hasScrollBody: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      ],
      error: (e, _) => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              e is ApiException ? e.message : e.toString(),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final page = ref.watch(patientAppointmentsProvider(_selectedStatus));

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                child: PatientTopBar(),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'My Bookings',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: _kTitle,
                          height: 1.1,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => ref.invalidate(
                        patientAppointmentsProvider(_selectedStatus),
                      ),
                      icon: const Icon(Icons.refresh),
                      tooltip: 'Refresh',
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _StatusChip(
                        label: 'Upcoming',
                        selected:
                            _selectedStatus == null || _selectedStatus == 'BOOKED',
                        onSelected: () => setState(() => _selectedStatus = null),
                      ),
                      const SizedBox(width: 8),
                      _StatusChip(
                        label: 'Completed',
                        selected: _selectedStatus == 'COMPLETED',
                        onSelected: () =>
                            setState(() => _selectedStatus = 'COMPLETED'),
                      ),
                      const SizedBox(width: 8),
                      _StatusChip(
                        label: 'Cancelled',
                        selected: _selectedStatus == 'CANCELLED',
                        onSelected: () =>
                            setState(() => _selectedStatus = 'CANCELLED'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 8)),
            ..._bookingContentSlivers(context, page),
            const SliverToBoxAdapter(child: PatientLegalFooter()),
          ],
        ),
      ),
    );
  }

  Future<void> _openFeedback(BuildContext context, String appointmentId) async {
    final ratingController = TextEditingController();
    final commentController = TextEditingController();

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave feedback'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ratingController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Rating (1-5)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: commentController,
              decoration: const InputDecoration(labelText: 'Comment (optional)'),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Submit'),
          ),
        ],
      ),
    );

    if (submitted != true) {
      return;
    }

    final rating = int.tryParse(ratingController.text.trim());
    if (rating == null || rating < 1 || rating > 5) {
      if (!context.mounted) {
        return;
      }
      await AppToast.showError(context, message: 'Enter a rating between 1 and 5.');
      return;
    }

    try {
      await ref.read(patientFeedbackApiProvider).submitFeedback(
            appointmentId: appointmentId,
            rating: rating,
            comment: commentController.text.trim().isEmpty
                ? null
                : commentController.text.trim(),
          );
      if (!context.mounted) {
        return;
      }
      await AppToast.showSuccess(context, message: 'Feedback submitted.');
      ref.invalidate(patientAppointmentsProvider(_selectedStatus));
    } catch (e) {
      if (!context.mounted) {
        return;
      }
      await AppToast.showError(context, message: e.toString());
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
      showCheckmark: false,
      selectedColor: _kCardBlue,
      checkmarkColor: _kNavyButton,
      labelStyle: TextStyle(
        color: selected ? _kNavyButton : _kTitle,
        fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
        fontSize: 13.5,
      ),
      side: BorderSide(color: selected ? _kNavyButton : Colors.grey.shade400),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({
    required this.appointment,
    required this.onLeaveFeedback,
    required this.onReschedule,
    required this.onCancel,
  });

  final PatientAppointment appointment;
  final VoidCallback? onLeaveFeedback;
  final VoidCallback? onReschedule;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final dept = appointment.departmentName ?? '—';
    final dateLine = formatBookingCardDateTime(appointment.appointmentDate);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      decoration: BoxDecoration(
        color: _kCardBlue,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _CenteredFieldBlock(
            label: 'Date & Time',
            value: dateLine,
          ),
          const SizedBox(height: 16),
          _CenteredFieldBlock(
            label: 'Department',
            value: dept,
          ),
          if (onReschedule != null || onCancel != null) ...[
            const SizedBox(height: 18),
            const Text(
              'Action',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: _kTitle,
              ),
            ),
            const SizedBox(height: 10),
            if (onReschedule != null)
              SizedBox(
                width: double.infinity,
                height: 46,
                child: FilledButton(
                  onPressed: onReschedule,
                  style: FilledButton.styleFrom(
                    backgroundColor: _kNavyButton,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'Reschedule',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            if (onReschedule != null && onCancel != null)
              const SizedBox(height: 10),
            if (onCancel != null)
              SizedBox(
                width: double.infinity,
                height: 46,
                child: FilledButton(
                  onPressed: onCancel,
                  style: FilledButton.styleFrom(
                    backgroundColor: _kCancelBrown,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'Cancel',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
          ],
          if (onLeaveFeedback != null) ...[
            const SizedBox(height: 14),
            TextButton(
              onPressed: onLeaveFeedback,
              child: const Text(
                'Leave feedback',
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: _kNavyButton,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CenteredFieldBlock extends StatelessWidget {
  const _CenteredFieldBlock({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: _kTitle,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: _kTitle,
            height: 1.25,
          ),
        ),
      ],
    );
  }
}
