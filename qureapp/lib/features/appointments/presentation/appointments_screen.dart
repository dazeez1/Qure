import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ui/app_toast.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../../feedback/data/patient_feedback_api.dart';
import '../data/patient_appointments_api.dart';
import '../domain/patient_appointment_models.dart';

class AppointmentsScreen extends ConsumerStatefulWidget {
  const AppointmentsScreen({super.key});

  @override
  ConsumerState<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends ConsumerState<AppointmentsScreen> {
  String? _selectedStatus;

  @override
  Widget build(BuildContext context) {
    final page = ref.watch(patientAppointmentsProvider(_selectedStatus));

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: PatientTopBar(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'My Bookings',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ),
                  IconButton(
                    onPressed: () => ref.invalidate(patientAppointmentsProvider(_selectedStatus)),
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _StatusChip(
                      label: 'Upcoming',
                      selected: _selectedStatus == null || _selectedStatus == 'BOOKED',
                      onSelected: () => setState(() => _selectedStatus = null),
                    ),
                    const SizedBox(width: 8),
                    _StatusChip(
                      label: 'Completed',
                      selected: _selectedStatus == 'COMPLETED',
                      onSelected: () => setState(() => _selectedStatus = 'COMPLETED'),
                    ),
                    const SizedBox(width: 8),
                    _StatusChip(
                      label: 'Cancelled',
                      selected: _selectedStatus == 'CANCELLED',
                      onSelected: () => setState(() => _selectedStatus = 'CANCELLED'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: page.when(
                data: (data) {
                  if (data.appointments.isEmpty) {
                    return const Center(child: Text('No appointments found.'));
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                    itemCount: data.appointments.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final appointment = data.appointments[index];
                      return _AppointmentCard(
                        appointment: appointment,
                        onLeaveFeedback: appointment.status == 'COMPLETED' && !appointment.hasFeedback
                            ? () => _openFeedback(context, appointment.id)
                            : null,
                      );
                    },
                  );
                },
                error: (e, _) => Center(child: Text(e.toString())),
                loading: () => const Center(child: CircularProgressIndicator()),
              ),
            ),
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
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Submit')),
        ],
      ),
    );

    if (submitted != true) return;

    final rating = int.tryParse(ratingController.text.trim());
    if (rating == null || rating < 1 || rating > 5) {
      if (!context.mounted) return;
      await AppToast.showError(context, message: 'Enter a rating between 1 and 5.');
      return;
    }

    try {
      await ref.read(patientFeedbackApiProvider).submitFeedback(
            appointmentId: appointmentId,
            rating: rating,
            comment: commentController.text.trim().isEmpty ? null : commentController.text.trim(),
          );
      if (!context.mounted) return;
      await AppToast.showSuccess(context, message: 'Feedback submitted.');
      ref.invalidate(patientAppointmentsProvider(_selectedStatus));
    } catch (e) {
      if (!context.mounted) return;
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
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }
}

class _AppointmentCard extends StatelessWidget {
  const _AppointmentCard({
    required this.appointment,
    required this.onLeaveFeedback,
  });

  final PatientAppointment appointment;
  final VoidCallback? onLeaveFeedback;

  @override
  Widget build(BuildContext context) {
    final dateText = appointment.appointmentDate.toLocal().toString();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6E8EC)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(appointment.departmentName ?? 'Appointment'),
            const SizedBox(height: 4),
            Text(
              '${appointment.hospitalName ?? ''} • $dateText',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: Text('Status: ${appointment.status}')),
                if (onLeaveFeedback != null)
                  TextButton(
                    onPressed: onLeaveFeedback,
                    child: const Text('Leave feedback'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

