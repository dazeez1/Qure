import 'package:flutter/material.dart';

import '../../domain/public_feedback_item.dart';
import '../feedback_formatting.dart';
import '../feedback_ui_constants.dart';

/// Single review in the hospital “Patient Feedback” carousel.
class PatientFeedbackCard extends StatelessWidget {
  const PatientFeedbackCard({
    super.key,
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
        border: Border.all(color: FeedbackUi.border),
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
              color: FeedbackUi.title,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            item.patientName,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: FeedbackUi.title,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: List.generate(5, (i) {
              return Icon(
                i < item.rating
                    ? Icons.star_rounded
                    : Icons.star_outline_rounded,
                size: 18,
                color: i < item.rating ? Colors.amber.shade700 : FeedbackUi.muted,
              );
            }),
          ),
          const SizedBox(height: 8),
          Text(
            '${formatFeedbackLongDate(item.appointmentDate.toLocal())} - ${item.departmentName}',
            style: const TextStyle(fontSize: 13, color: FeedbackUi.muted),
          ),
          const SizedBox(height: 8),
          Text(
            doctorDisplayLine(item.doctorName),
            style: const TextStyle(fontSize: 14, color: FeedbackUi.title),
          ),
          const SizedBox(height: 10),
          Text(
            item.comment?.trim().isNotEmpty == true
                ? item.comment!.trim()
                : '—',
            style: const TextStyle(
              fontSize: 14.5,
              height: 1.35,
              color: FeedbackUi.title,
            ),
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
                    foregroundColor: FeedbackUi.title,
                    side: const BorderSide(color: FeedbackUi.border),
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
                    backgroundColor: FeedbackUi.navy,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: FeedbackUi.navy.withValues(alpha: 0.35),
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
            style: const TextStyle(fontSize: 13, color: FeedbackUi.muted),
          ),
        ],
      ),
    );
  }
}
