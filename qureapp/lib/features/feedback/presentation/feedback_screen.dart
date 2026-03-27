import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../appointments/data/patient_appointments_api.dart';
import '../../patient/application/patient_hospital_context_provider.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/patient_feedback_api.dart';
import '../domain/public_feedback_item.dart';

const Color _kTitle = Color(0xFF111827);
const Color _kMuted = Color(0xFF6B7280);
const Color _kNavy = Color(0xFF0B2E7A);
const Color _kBorder = Color(0xFFE6E8EC);

final hospitalPublicFeedbackProvider =
    FutureProvider.autoDispose<List<PublicFeedbackItem>>((ref) async {
  final hid = await ref.watch(patientResolvedHospitalIdProvider.future);
  if (hid == null || hid.isEmpty) {
    return [];
  }
  return ref.watch(patientFeedbackApiProvider).fetchHospitalFeedback(hid);
});

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

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(patientResolvedHospitalIdProvider);
    ref.invalidate(hospitalPublicFeedbackProvider);
    ref.invalidate(patientAppointmentsProvider('COMPLETED'));
    try {
      await ref.read(hospitalPublicFeedbackProvider.future);
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (_appointmentId == null || _appointmentId!.isEmpty) {
      await AppToast.showError(context, message: 'Select a completed appointment.');
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
      ref.invalidate(patientAppointmentsProvider('COMPLETED'));
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

  @override
  Widget build(BuildContext context) {
    final completed = ref.watch(patientAppointmentsProvider('COMPLETED'));
    final reviews = ref.watch(hospitalPublicFeedbackProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: RefreshIndicator(
          color: const Color(0xFF0B3F9A),
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
                          color: _kTitle,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Leave Feedback',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _kTitle,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Rating',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: _kTitle,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: List.generate(5, (i) {
                          final n = i + 1;
                          final filled = _rating >= n;
                          return IconButton(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                            onPressed: _submitting ? null : () => setState(() => _rating = n),
                            icon: Icon(
                              filled ? Icons.star_rounded : Icons.star_outline_rounded,
                              size: 32,
                              color: filled ? Colors.amber.shade700 : _kMuted,
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
                          color: _kTitle,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _commentController,
                        maxLines: 4,
                        enabled: !_submitting,
                        decoration: InputDecoration(
                          hintText: 'Share your experience…',
                          filled: true,
                          fillColor: Colors.white,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: _kBorder),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: _kBorder),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Select Appointment',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: _kTitle,
                        ),
                      ),
                      const SizedBox(height: 8),
                      completed.when(
                        data: (page) {
                          final open = page.appointments.where((a) => !a.hasFeedback).toList();
                          if (_appointmentId != null &&
                              !open.any((a) => a.id == _appointmentId)) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted) {
                                setState(() => _appointmentId = null);
                              }
                            });
                          }
                          if (open.isEmpty) {
                            return Text(
                              'No completed visits available for feedback yet.',
                              style: TextStyle(color: Colors.grey.shade600, fontSize: 13.5),
                            );
                          }
                          return InputDecorator(
                            decoration: InputDecoration(
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: _kBorder),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: _kBorder),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
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
                                          '${_formatLongDate(a.appointmentDate.toLocal())} · ${a.departmentName ?? 'Visit'}',
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
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        height: 48,
                        width: double.infinity,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: _kNavy,
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
                  child: reviews.when(
                    data: (list) {
                      if (list.isEmpty) {
                        return Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: _kBorder),
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
                      return _PatientFeedbackCard(
                        item: r,
                        pageIndex: idx + 1,
                        pageCount: list.length,
                        onPrev: idx > 0 ? () => setState(() => _reviewIndex = idx - 1) : null,
                        onNext:
                            idx < list.length - 1 ? () => setState(() => _reviewIndex = idx + 1) : null,
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

class _PatientFeedbackCard extends StatelessWidget {
  const _PatientFeedbackCard({
    required this.item,
    required this.pageIndex,
    required this.pageCount,
    required this.onPrev,
    required this.onNext,
  });

  final PublicFeedbackItem item;
  final int pageIndex;
  final int pageCount;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _kBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.07),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Patient Feedback',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: _kTitle,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            item.patientName,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: _kTitle,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: List.generate(5, (i) {
              return Icon(
                i < item.rating ? Icons.star_rounded : Icons.star_outline_rounded,
                size: 18,
                color: i < item.rating ? Colors.amber.shade700 : _kMuted,
              );
            }),
          ),
          const SizedBox(height: 8),
          Text(
            '${_formatLongDate(item.appointmentDate.toLocal())} - ${item.departmentName}',
            style: const TextStyle(fontSize: 13, color: _kMuted),
          ),
          const SizedBox(height: 8),
          Text(
            _doctorLine(item.doctorName),
            style: const TextStyle(fontSize: 14, color: _kTitle),
          ),
          const SizedBox(height: 10),
          Text(
            item.comment?.trim().isNotEmpty == true ? item.comment!.trim() : '—',
            style: const TextStyle(fontSize: 14.5, height: 1.35, color: _kTitle),
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onPrev,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _kTitle,
                    side: const BorderSide(color: _kBorder),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Previous'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: onNext,
                  style: FilledButton.styleFrom(
                    backgroundColor: _kNavy,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: _kNavy.withValues(alpha: 0.35),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Next'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '$pageIndex/$pageCount',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 13, color: _kMuted),
          ),
        ],
      ),
    );
  }
}

String _doctorLine(String? name) {
  if (name == null || name.trim().isEmpty) {
    return '—';
  }
  final t = name.trim();
  if (t.toLowerCase().startsWith('dr')) {
    return t;
  }
  return 'Dr. $t';
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
