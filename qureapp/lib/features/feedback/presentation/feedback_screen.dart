import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../appointments/domain/patient_appointment_models.dart';
import '../../patient/application/patient_hospital_context_provider.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/hospital_public_feedback_provider.dart';
import '../data/patient_feedback_api.dart';
import '../data/patient_feedback_appointments_provider.dart';
import '../domain/public_feedback_item.dart';
import 'feedback_formatting.dart';
import 'feedback_ui_constants.dart';
import 'widgets/patient_feedback_card.dart';

class FeedbackScreen extends ConsumerStatefulWidget {
  const FeedbackScreen({super.key});

  @override
  ConsumerState<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends ConsumerState<FeedbackScreen> {
  int _rating = 0;
  final _commentController = TextEditingController();
  String? _appointmentId;
  int _reviewIndex = 0;
  bool _submitting = false;

  static InputDecoration _fieldDecoration({String? hint}) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: FeedbackUi.border),
    );
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: Colors.white,
      border: border,
      enabledBorder: border,
    );
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(patientResolvedHospitalIdProvider);
    ref.invalidate(hospitalPublicFeedbackProvider);
    ref.invalidate(patientFeedbackAppointmentCandidatesProvider);
    try {
      await ref.read(hospitalPublicFeedbackProvider.future);
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (_appointmentId == null || _appointmentId!.isEmpty) {
      await AppToast.showError(
        context,
        message: 'Select a completed appointment.',
      );
      return;
    }
    if (_rating < 1 || _rating > 5) {
      await AppToast.showError(context, message: 'Select a star rating.');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref.read(patientFeedbackApiProvider).submitFeedback(
            appointmentId: _appointmentId!,
            rating: _rating,
            comment: _commentController.text.trim().isEmpty
                ? null
                : _commentController.text.trim(),
          );
      if (!mounted) {
        return;
      }
      await AppToast.showSuccess(context, message: 'Feedback submitted.');
      setState(() {
        _rating = 0;
        _appointmentId = null;
        _commentController.clear();
      });
      ref.invalidate(patientFeedbackAppointmentCandidatesProvider);
      ref.invalidate(hospitalPublicFeedbackProvider);
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(context, message: e.message);
    } catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(context, message: e.toString());
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  List<PatientAppointment> _eligibleFeedbackAppointments(AppointmentListPage page) {
    final raw = page.appointments.where((a) => !a.hasFeedback).toList();
    final unique = uniqueAppointmentsById(raw);
    unique.sort((a, b) => b.appointmentDate.compareTo(a.appointmentDate));
    return unique;
  }

  void _clearInvalidAppointmentSelectionIfNeeded(List<PatientAppointment> open) {
    if (_appointmentId == null) {
      return;
    }
    if (open.any((a) => a.id == _appointmentId)) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        setState(() => _appointmentId = null);
      }
    });
  }

  Widget _buildAppointmentPicker(AsyncValue<AppointmentListPage> completed) {
    return completed.when(
      data: (page) {
        final open = _eligibleFeedbackAppointments(page);
        _clearInvalidAppointmentSelectionIfNeeded(open);

        if (open.isEmpty) {
          return Text(
            'No completed visits available for feedback yet.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13.5),
          );
        }

        final border = OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: FeedbackUi.border),
        );
        return InputDecorator(
          decoration: InputDecoration(
            border: border,
            enabledBorder: border,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              hint: const Text('Select a completed appointment'),
              value: _appointmentId,
              items: open
                  .map(
                    (a) => DropdownMenuItem(
                      value: a.id,
                      child: Text(
                        formatAppointmentPickerLine(
                          a.appointmentDate.toLocal(),
                          a.departmentName,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: _submitting
                  ? null
                  : (v) => setState(() => _appointmentId = v),
            ),
          ),
        );
      },
      loading: () => const LinearProgressIndicator(minHeight: 2),
      error: (e, _) => Text(
        e.toString(),
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }

  Widget _buildPublicReviewsCarousel(AsyncValue<List<PublicFeedbackItem>> reviews) {
    return reviews.when(
      data: (list) {
        if (list.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: FeedbackUi.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Text(
              'Patient reviews will appear here once available for your hospital.',
              style: TextStyle(color: Colors.grey.shade700, height: 1.35),
            ),
          );
        }

        final idx = _reviewIndex.clamp(0, list.length - 1);
        if (_reviewIndex != idx) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              setState(() => _reviewIndex = idx);
            }
          });
        }

        final r = list[idx];
        return PatientFeedbackCard(
          item: r,
          pageIndex: idx + 1,
          pageCount: list.length,
          onPrev: idx > 0 ? () => setState(() => _reviewIndex = idx - 1) : null,
          onNext: idx < list.length - 1
              ? () => setState(() => _reviewIndex = idx + 1)
              : null,
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (e, _) => Text(
        e.toString(),
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final completed = ref.watch(patientFeedbackAppointmentCandidatesProvider);
    final reviews = ref.watch(hospitalPublicFeedbackProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: RefreshIndicator(
          color: FeedbackUi.refreshIndicator,
          onRefresh: _refresh,
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
                      const Text(
                        'Feedback & Ratings',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: FeedbackUi.title,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Leave Feedback',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: FeedbackUi.title,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Rating',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: FeedbackUi.title,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: List.generate(5, (i) {
                          final n = i + 1;
                          final filled = _rating >= n;
                          return IconButton(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                              minWidth: 40,
                              minHeight: 40,
                            ),
                            onPressed:
                                _submitting ? null : () => setState(() => _rating = n),
                            icon: Icon(
                              filled
                                  ? Icons.star_rounded
                                  : Icons.star_outline_rounded,
                              size: 32,
                              color: filled ? Colors.amber.shade700 : FeedbackUi.muted,
                            ),
                          );
                        }),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Comments',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: FeedbackUi.title,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _commentController,
                        maxLines: 4,
                        enabled: !_submitting,
                        decoration: _fieldDecoration(hint: 'Share your experience…'),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Select Appointment',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: FeedbackUi.title,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _buildAppointmentPicker(completed),
                      const SizedBox(height: 20),
                      SizedBox(
                        height: 48,
                        width: double.infinity,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: FeedbackUi.navy,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: _submitting ? null : _submit,
                          child: _submitting
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'Submit',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  child: _buildPublicReviewsCarousel(reviews),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
